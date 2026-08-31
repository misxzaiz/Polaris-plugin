"""补丁脚本:向已烘焙的 textured GLB 重写做旧顶点色 mask(绕过完整重 bake)。

背景:bake_house.py 曾把 aging mask 写进非 active color 属性,glTF 导出器只导出
active 属性,导致 COLOR_0 全白(mask 失效)。本脚本导入现有 textured GLB,
删除旧颜色属性后按同一套 fbm 公式重写 mask 再导出——几何/贴图不动,~30s。

CLI: blender --background --python patch_aging_vcolor.py -- <in.glb> <out.glb>
"""

import bpy
import sys
import os

import numpy as np

argv = sys.argv
_idx = argv.index('--') if '--' in argv else len(argv)
_args = argv[_idx + 1:]

GLB_IN = os.path.abspath(_args[0])
GLB_OUT = os.path.abspath(_args[1])
SEED = 7.0  # 与 bake_house.py 保持一致


def hash_noise(x, z, seed):
    v = np.sin(x * 12.9898 + z * 78.233 + seed * 37.719) * 43758.5453
    return v - np.floor(v)


def fbm_values(x, z, seed, octaves=4):
    result = np.zeros_like(x)
    # freq 起始 0.15:16m 跨度的房子首倍频覆盖 ~2.4 格,再加 3 层细节;
    # 之前 0.08 整栋只有不到 1 格,patch 趋近常数导致 moss/peel 斑块失效
    amp, freq, total = 1.0, 0.15, 0.0
    for o in range(octaves):
        gx, gz = x * freq, z * freq
        x0, z0 = np.floor(gx), np.floor(gz)
        fx, fz = gx - x0, gz - z0
        fx, fz = fx * fx * (3 - 2 * fx), fz * fz * (3 - 2 * fz)
        h00 = hash_noise(x0, z0, seed + o)
        h10 = hash_noise(x0 + 1, z0, seed + o)
        h01 = hash_noise(x0, z0 + 1, seed + o)
        h11 = hash_noise(x0 + 1, z0 + 1, seed + o)
        nx0 = h00 * (1 - fx) + h10 * fx
        nx1 = h01 * (1 - fx) + h11 * fx
        result += amp * (nx0 * (1 - fz) + nx1 * fz)
        total += amp
        amp *= 0.5
        freq *= 2.3
    return result / total


def write_aging(obj):
    mesh = obj.data
    n = len(mesh.vertices)
    if n == 0:
        return
    co = np.empty(n * 3, dtype=np.float32)
    mesh.vertices.foreach_get('co', co)
    co = co.reshape(n, 3)
    no = np.empty(n * 3, dtype=np.float32)
    mesh.vertices.foreach_get('normal', no)
    no = no.reshape(n, 3)
    mw = np.array(obj.matrix_world)
    world = co @ mw[:3, :3].T + mw[:3, 3]
    # 法线必须转到世界空间:glTF 导入的物体带 +90° X 旋转,局部 +Z 并不是"朝上"
    wno = no @ mw[:3, :3].T
    wno /= np.maximum(np.linalg.norm(wno, axis=1, keepdims=True), 1e-9)

    nz = np.clip(wno[:, 2], 0.0, 1.0)
    patch = fbm_values(world[:, 0], world[:, 1], SEED)

    # 屋面 27° 坡整面 nz≈0.89 都算"朝上"，单靠法线+噪声阈值会整坡全绿。
    # 真实青苔靠雨水携带孢子向低处聚集 → 叠加物体自身高度衰减（檐口浓/脊部淡，
    # 平坦地面 span≈0 时退化为常数 1），并把噪声阈值提到 0.52 让斑块只占 ~1/3。
    z = world[:, 2]
    z_span = max(float(z.max() - z.min()), 1e-6)
    h_fac = 1.0 - np.clip((z - z.min()) / z_span, 0, 1)
    moss = (np.clip((nz - 0.55) / 0.45, 0, 1) ** 1.5
            * np.clip((patch - 0.52) * 3.0, 0, 1)
            * (0.25 + 0.75 * h_fac))
    dirt = np.clip((0.9 - z) / 1.4, 0, 1) * np.clip((patch - 0.3) * 2.0, 0, 1)
    is_wood = obj.name.startswith('wood')
    peel = np.clip((patch - 0.48) * 3.0, 0, 1) if is_wood else np.zeros(n)

    colors = np.empty((n, 4), dtype=np.float32)
    colors[:, 0] = np.clip(moss * 0.9, 0, 1)
    colors[:, 1] = np.clip(dirt * 0.8, 0, 1)
    colors[:, 2] = np.clip(peel, 0, 1)
    colors[:, 3] = 1.0

    # 同理不能用 list() 快照迭代删除(textured 输入带 2 个旧 color 属性时会残留)
    while len(mesh.color_attributes) > 0:
        mesh.color_attributes.remove(mesh.color_attributes[0])
    # CORNER/BYTE_COLOR + export_vertex_color='ACTIVE': POINT/FLOAT_COLOR 会触发
    # 导出器 forced 白 COLOR_0 + 真值进 COLOR_1 的分支(见 bake_house.py 同名注释)
    attr = mesh.color_attributes.new(name='aging', type='BYTE_COLOR', domain='CORNER')
    loop_total = len(mesh.loops)
    loop_verts = np.empty(loop_total, dtype=np.int32)
    mesh.loops.foreach_get('vertex_index', loop_verts)
    attr.data.foreach_set('color', colors[loop_verts].reshape(-1))
    mesh.color_attributes.active_color = attr
    mean = colors.mean(axis=0)
    print(f'[patch] {obj.name}: {n} v, mean mask=({mean[0]:.3f},{mean[1]:.3f},{mean[2]:.3f})')


def clean_material_vc_nodes():
    """删除材质里 glTF 导入器生成的 VERTEX_COLOR(→MIX)混合链,贴图直连 BaseColor。

    导入带顶点色的 GLB 时导入器会插 VERTEX_COLOR→MIX→BaseColor;重写 aging 属性后
    节点引用的旧属性已不存在,导出器解析 active vertex color 失败 → 生成垃圾 COLOR_0
    + aging 进 COLOR_1(见 bake_house.py 注释)。three.js 端用 onBeforeCompile 做
    aging 混色,Blender 端该节点无渲染作用,删掉并直连即可。
    """
    for mat in bpy.data.materials:
        nt = mat.node_tree
        if not nt:
            continue
        vc_nodes = [n for n in nt.nodes if n.type == 'VERTEX_COLOR']
        if not vc_nodes:
            continue
        mix_nodes = [n for n in nt.nodes if n.type == 'MIX'
                     and any(l.from_node.type == 'VERTEX_COLOR' for l in n.inputs['B'].links)]
        for mix in mix_nodes:
            a_links = list(mix.inputs['A'].links)
            bsdf_links = list(mix.outputs['Result'].links)
            if a_links and bsdf_links:
                src_socket = a_links[0].from_socket
                for l in bsdf_links:
                    nt.links.new(src_socket, l.to_socket)
                nt.nodes.remove(mix)
        for n in vc_nodes:
            nt.nodes.remove(n)
        print(f'[patch] material cleaned: {mat.name}')


def rebuild_mesh_datablock(obj):
    """用 from_pydata 重建 mesh datablock（几何+UV+材质原样搬运）。

    经历过 glTF 导出的 mesh datablock 即使删净 color 属性、清 custom normal，
    导出器仍会生成 forced COLOR_0(白)+aging 进 COLOR_1 —— 触发源在 datablock
    自身的隐藏状态，无法定点清除；全新 datablock 则单 COLOR_0 直通(已标定)。
    """
    old = obj.data
    mat = old.materials[0] if old.materials else None
    verts = [v.co.copy() for v in old.vertices]
    polys = [list(p.vertices) for p in old.polygons]
    old_uv = np.empty(len(old.loops) * 2, dtype=np.float32)
    old.uv_layers[0].data.foreach_get('uv', old_uv)
    old_uv = old_uv.reshape(-1, 2)
    old_lv = np.empty(len(old.loops), dtype=np.int32)
    old.loops.foreach_get('vertex_index', old_lv)
    old_face_starts = np.cumsum([0] + [p.loop_total for p in old.polygons])[:-1]

    new = bpy.data.meshes.new(old.name + '_rb')
    if mat:
        new.materials.append(mat)
    new.from_pydata(verts, [], polys)
    new.update()
    uvl = new.uv_layers.new(name='UVMap')
    nv = np.empty(len(new.loops), dtype=np.int32)
    new.loops.foreach_get('vertex_index', nv)
    uv_out = np.zeros((len(new.loops), 2), dtype=np.float32)
    new_face_starts = np.cumsum([0] + [p.loop_total for p in new.polygons])[:-1]
    for fi, p in enumerate(new.polygons):
        base_old, base_new = int(old_face_starts[fi]), int(new_face_starts[fi])
        old_base_v = old_lv[base_old:base_old + p.loop_total]
        for li in range(p.loop_total):
            v = nv[base_new + li]
            idx = int(np.where(old_base_v == v)[0][0])
            uv_out[base_new + li] = old_uv[base_old + idx]
    uvl.data.foreach_set('uv', uv_out.reshape(-1))
    new.update()
    obj.data = new
    bpy.data.meshes.remove(old)
    return new


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    print(f'[patch] in ={GLB_IN}')
    bpy.ops.import_scene.gltf(filepath=GLB_IN)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    print(f'[patch] objects: {[o.name for o in meshes]}')
    for o in meshes:
        new = rebuild_mesh_datablock(o)
        write_aging(o)
    clean_material_vc_nodes()
    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format='GLB',
        export_image_format='JPEG',
        export_jpeg_quality=85,
        export_vertex_color='ACTIVE',
    )
    print(f'[patch] EXPORT_DONE: {GLB_OUT} ({os.path.getsize(GLB_OUT) / 1048576:.1f} MB)')


main()
