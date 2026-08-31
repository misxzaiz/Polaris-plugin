"""老房子材质烘焙（阶段1.5）：白模 GLB → PolyHaven PBR 贴图 + Cycles bake 三张图 + 顶点色做旧 mask → 带纹理 GLB。

管线：
  1. 导入白模 GLB（realistic_house.py 产物）
  2. 按材质合并为 8 个物体（每物体单材质，bake 语义干净）
  3. Smart UV Project 展开 UV
  4. 下载 PolyHaven 贴图（Diffuse/Rough/nor_gl，本地缓存 cache/textures/<asset_id>/）
  5. Cycles CPU bake：DIFFUSE(COLOR) / ROUGHNESS / NORMAL / AO(samples 提高平滑) → numpy 合成 ORM
  6. 顶点色 RGBA：R=苔藓 G=污渍 B=剥落 A=1（three.js 端做旧混色用）
  7. 导出 GLB（JPEG 内嵌控制体积）

CLI: blender --background --python bake_house.py -- --output <glb> --params <json>
"""

import bpy
import os
import sys
import json
import math
import urllib.request

import numpy as np

# ---------------------------------------------------------------- CLI

argv = sys.argv
_idx = argv.index('--') if '--' in argv else len(argv)
_args = argv[_idx + 1:]


def _arg(name, default=None):
    if name in _args:
        return _args[_args.index(name) + 1]
    return default


# ============================================================
# 参数 schema 与默认值（MCP 自动读取 params_schema 生成工具参数）
# ============================================================
params_schema = {
    "type": "object",
    "properties": {
        "white_glb": {"type": "string", "description": "白模 GLB 输入路径（默认 generated/realistic_house.glb）"},
        "output_path": {"type": "string", "description": "带纹理 GLB 输出路径（MCP 会用 --output 覆盖）"},
        "resolution_main": {"type": "integer", "minimum": 512, "maximum": 8192, "description": "主材质 bake 分辨率（brick/plaster/tile）"},
        "resolution_secondary": {"type": "integer", "minimum": 256, "maximum": 4096, "description": "其余材质 bake 分辨率"},
        "ao_samples": {"type": "integer", "minimum": 1, "maximum": 128, "description": "AO bake 采样数"},
        "bake_margin": {"type": "integer", "minimum": 2, "maximum": 64, "description": "bake 边距(px)"},
        "skip_bake": {"type": "boolean", "description": "跳过 Cycles bake，直接用 PolyHaven 原图导出（快速验证链路，~1min；完整 bake 实测 ~11-13min，MCP 调用须传 timeout>=1200000）"},
        "write_masks": {"type": "boolean", "description": "写入顶点色做旧 mask（R=苔藓 G=污渍 B=剥落）"},
        "seed": {"type": "integer", "description": "做旧噪声种子（可复现）"}
    },
    "additionalProperties": True,
}

PARAMS = json.loads(_arg('--params', '{}') or '{}')

_GENERATED_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'generated'))


def _resolve_glb(p, default_name):
    """MCP spawn 的 blender CWD 不定：相对路径按 generated/ 解析，绝对路径原样使用。"""
    if not p:
        return os.path.join(_GENERATED_DIR, default_name)
    return p if os.path.isabs(p) else os.path.join(_GENERATED_DIR, p)


OUTPUT_PATH = os.path.abspath(_resolve_glb(_arg('--output', '') or PARAMS.get('output_path', ''), 'realistic_house_textured.glb'))

WHITE_GLB = os.path.abspath(_resolve_glb(PARAMS.get('white_glb', ''), 'realistic_house.glb'))

RES_MAIN = int(PARAMS.get('resolution_main', 4096))       # 主立面/屋面（4k 保砖缝细节）
RES_SECONDARY = int(PARAMS.get('resolution_secondary', 2048))
# 纹理平铺密度：Smart UV 把整面墙铺 0-1，需在节点端放大纹理重复次数。
# 砖墙 2k 图横向 ~10 块砖；15m 墙需 ~60 块 ⇒ scale≈5~6。其余按视觉密度减半。
TEX_SCALE = {
    'brick': 5.0, 'plaster': 4.0, 'tile': 4.0,
    'plinth': 3.0, 'earth': 3.0,
    'wood_dark': 2.5, 'wood_light': 2.5, 'wood_frame': 2.5,
}
AO_SAMPLES = int(PARAMS.get('ao_samples', 16))
BAKE_MARGIN = int(PARAMS.get('bake_margin', 8))           # px
SKIP_BAKE = bool(PARAMS.get('skip_bake', False))          # 跳过 bake 直接用原贴图导出（快速验证链路）
WRITE_MASKS = bool(PARAMS.get('write_masks', True))       # 顶点色做旧 mask
SEED = float(PARAMS.get('seed', 7))

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_ROOT = os.path.abspath(os.path.join(HERE, '..', 'cache', 'textures'))
BAKE_DIR = os.path.abspath(os.path.join(HERE, '..', 'generated', 'bake'))

# ------------------------------------------------- 材质 → PolyHaven 资产映射

# 白模 8 材质（realistic_house.py init_materials）
MAT_MAP = {
    'brick':      'brick_wall_006',                # 清水砖墙
    'plaster':    'worn_mossy_plasterwall',        # 抹灰山墙（浅暖灰+苔斑；clay_plaster 偏棕陶土弃用）
    'tile':       'roof_tiles_14',                 # 小青瓦 + 屋脊
    'wood_dark':  'weathered_planks',              # 望板/檩条/门槛
    'wood_light': 'beam_wall_01',                  # 椽条
    'wood_frame': 'wood_peeling_paint_weathered',  # 门窗框/窗棂（漆皮剥落）
    'earth':      'dirt_floor',                    # 泥土地面
    'plinth':     'castle_brick_02_red',           # 台基/压顶石
}
# PolyHaven API key → (缓存文件后缀, Blender 色彩空间)
PH_MAPS = [
    ('Diffuse', 'diff', 'sRGB'),
    ('Rough', 'rough', 'Non-Color'),
    ('nor_gl', 'normal', 'Non-Color'),
    ('AO', 'ao', 'Non-Color'),
]
RES_SUFFIX = '2k'
IMG_EXT = 'jpg'


# ---------------------------------------------------------------- 纹理缓存

def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def download_file(url, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=120) as r, open(dst, 'wb') as f:
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)


def get_texture(asset_id, ph_key, cache_key):
    """返回缓存后的贴图路径；优先读缓存。"""
    dst = os.path.join(CACHE_ROOT, asset_id, f'{cache_key}_{RES_SUFFIX}.{IMG_EXT}')
    if os.path.isfile(dst) and os.path.getsize(dst) > 0:
        return dst
    d = fetch_json(f'https://api.polyhaven.com/files/{asset_id}')
    if ph_key not in d or RES_SUFFIX not in d[ph_key] or IMG_EXT not in d[ph_key][RES_SUFFIX]:
        raise RuntimeError(f'{asset_id}: missing {ph_key}/{RES_SUFFIX}/{IMG_EXT}')
    url = d[ph_key][RES_SUFFIX][IMG_EXT]['url']
    print(f'[tex] downloading {asset_id}/{cache_key} ...')
    download_file(url, dst)
    return dst


def load_image(path, name, colorspace):
    img = bpy.data.images.load(path, check_existing=True)
    img.name = name
    img.colorspace_settings.name = colorspace
    return img


# ---------------------------------------------------------------- 场景准备

def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_white_model():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=WHITE_GLB)
    return [o for o in bpy.data.objects if o not in before]


def join_by_material(objs):
    """按材质槽的第一个材质名合并 → 每材质一个 object。"""
    groups = {}
    for o in objs:
        if o.type != 'MESH' or not o.data.materials:
            continue
        groups.setdefault(o.data.materials[0].name, []).append(o)
    merged = []
    bpy.ops.object.select_all(action='DESELECT')
    for mat_name, group in groups.items():
        for o in group:
            o.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        if len(group) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = mat_name
        merged.append(obj)
        bpy.ops.object.select_all(action='DESELECT')
    return merged


def smart_uv(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')


# ---------------------------------------------------------------- PBR 节点

def build_pbr_nodes(mat, asset_id):
    """PolyHaven 贴图 → Principled；返回节点引用供 bake 后替换。"""
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')

    scale = TEX_SCALE.get(mat.name, 3.0)
    n_coord = nt.nodes.new('ShaderNodeTexCoord')
    n_coord.location = (-1100, 300)
    n_map = nt.nodes.new('ShaderNodeMapping')
    n_map.location = (-950, 300)
    n_map.inputs['Scale'].default_value = (scale, scale, scale)
    nt.links.new(n_coord.outputs['UV'], n_map.inputs['Vector'])

    def tex_node(img, y):
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        n.location = (-800, y)
        nt.links.new(n_map.outputs['Vector'], n.inputs['Vector'])
        return n

    img_diff = load_image(get_texture(asset_id, 'Diffuse', 'diff'), f'{mat.name}_ph_diff', 'sRGB')
    img_rough = load_image(get_texture(asset_id, 'Rough', 'rough'), f'{mat.name}_ph_rough', 'Non-Color')
    img_norm = load_image(get_texture(asset_id, 'nor_gl', 'normal'), f'{mat.name}_ph_norm', 'Non-Color')

    n_diff = tex_node(img_diff, 300)
    nt.links.new(n_diff.outputs['Color'], bsdf.inputs['Base Color'])

    n_rough = tex_node(img_rough, 0)
    nt.links.new(n_rough.outputs['Color'], bsdf.inputs['Roughness'])

    n_norm = tex_node(img_norm, -300)
    n_nmap = nt.nodes.new('ShaderNodeNormalMap')
    n_nmap.location = (-500, -300)
    nt.links.new(n_norm.outputs['Color'], n_nmap.inputs['Color'])
    nt.links.new(n_nmap.outputs['Normal'], bsdf.inputs['Normal'])

    bsdf.inputs['Metallic'].default_value = 0.0
    return {'diff': n_diff, 'rough': n_rough, 'norm': n_norm}


# ---------------------------------------------------------------- Bake

def new_bake_image(name, size, alpha=False):
    img = bpy.data.images.new(name, size, size, alpha=alpha)
    img.colorspace_settings.name = 'Non-Color'
    return img


def bake_pass(obj, mat, pass_type, img, samples, pass_filter=None):
    """对单物体单材质 bake 到 img（active image node 模式）。"""
    nt = mat.node_tree
    node = nt.nodes.new('ShaderNodeTexImage')
    node.image = img
    node.name = '_bake_target'
    nt.nodes.active = node

    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    scene = bpy.context.scene
    old_samples = scene.cycles.samples
    scene.cycles.samples = samples
    kw = dict(type=pass_type, use_clear=True, margin=BAKE_MARGIN)
    if pass_filter is not None:
        kw['pass_filter'] = pass_filter
    bpy.ops.object.bake(**kw)
    scene.cycles.samples = old_samples

    nt.nodes.remove(node)


def save_bake_image(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()


def compose_orm(ao_img, rough_img, size):
    """R=AO G=Rough B=0 → ORM 图。"""
    ao = np.array(ao_img.pixels[:], dtype=np.float32).reshape(size, size, 4)
    ro = np.array(rough_img.pixels[:], dtype=np.float32).reshape(size, size, 4)
    orm = np.zeros((size, size, 4), dtype=np.float32)
    orm[..., 0] = ao[..., 0]
    orm[..., 1] = ro[..., 0]
    orm[..., 3] = 1.0
    out = bpy.data.images.new('orm_tmp', size, size, alpha=False)
    out.colorspace_settings.name = 'Non-Color'
    out.pixels = orm.ravel().tolist()
    return out


# ---------------------------------------------------------------- 顶点色做旧

def hash_noise(x, z, seed):
    v = np.sin(x * 12.9898 + z * 78.233 + seed * 37.719) * 43758.5453
    return v - np.floor(v)


def fbm_values(x, z, seed, octaves=4):
    """简易 value-noise FBM（双线性插值网格 hash）。"""
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


def write_aging_vertex_colors(objs):
    """顶点色 RGBA：R=苔藓 G=污渍(墙脚) B=剥落(木件) A=1。"""
    for obj in objs:
        mesh = obj.data
        n = len(mesh.vertices)
        if n == 0:
            continue
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

        nz = np.clip(wno[:, 2], 0.0, 1.0)            # 朝上程度（世界空间）
        patch = fbm_values(world[:, 0], world[:, 1], SEED)

        moss = np.clip((nz - 0.55) / 0.45, 0, 1) ** 1.5 * np.clip((patch - 0.42) * 2.5, 0, 1)
        dirt = np.clip((0.9 - world[:, 2]) / 1.4, 0, 1) * np.clip((patch - 0.3) * 2.0, 0, 1)
        is_wood = obj.name.startswith('wood')
        peel = np.clip((patch - 0.48) * 3.0, 0, 1) if is_wood else np.zeros(n)

        colors = np.empty((n, 4), dtype=np.float32)
        colors[:, 0] = np.clip(moss * 0.9, 0, 1)
        colors[:, 1] = np.clip(dirt * 0.8, 0, 1)
        colors[:, 2] = np.clip(peel, 0, 1)
        colors[:, 3] = 1.0

        # glTF 导出器只导出 active color 属性;白模导入时可能自带全白 COLOR_0,
        # 不删掉的话新建的 aging 属性不是 active,导出的就是全白 mask(做旧失效)
        for old in list(mesh.color_attributes):
            mesh.color_attributes.remove(old)
        attr = mesh.color_attributes.new(name='aging', type='FLOAT_COLOR', domain='POINT')
        attr.data.foreach_set('color', colors.reshape(-1))


# ---------------------------------------------------------------- main

def main():
    print(f'[bake] white={WHITE_GLB}')
    print(f'[bake] output={OUTPUT_PATH}')
    clean_scene()

    # 1. 导入 + 合并
    objs = import_white_model()
    merged = join_by_material(objs)
    print(f'[bake] merged objects: {[o.name for o in merged]}')
    print(f'Created {len(merged)} objects')  # MCP stdout 契约: partsMatch 正则统计部件数

    # 2. UV
    for o in merged:
        smart_uv(o)
    print('[bake] UV done')

    # 3. PBR 节点（下载贴图）
    node_refs = {}
    for o in merged:
        mat = o.data.materials[0]
        asset_id = MAT_MAP[mat.name]
        node_refs[o.name] = build_pbr_nodes(mat, asset_id)
        print(f'[bake] PBR nodes: {mat.name} <- {asset_id}')

    if SKIP_BAKE:
        print('[bake] skip_bake=True, export with source textures')
    else:
        # 4. Cycles bake
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'

        for o in merged:
            mat = o.data.materials[0]
            size = RES_MAIN if mat.name in ('brick', 'plaster', 'tile') else RES_SECONDARY

            img_diff = new_bake_image(f'{mat.name}_bake_diffuse', size)
            bake_pass(o, mat, 'DIFFUSE', img_diff, 1, pass_filter={'COLOR'})

            img_rough = new_bake_image(f'{mat.name}_bake_rough', size)
            bake_pass(o, mat, 'ROUGHNESS', img_rough, 1)

            img_norm = new_bake_image(f'{mat.name}_bake_normal', size)
            bake_pass(o, mat, 'NORMAL', img_norm, 1)

            img_ao = new_bake_image(f'{mat.name}_bake_ao', size)
            bake_pass(o, mat, 'AO', img_ao, AO_SAMPLES)

            img_orm = compose_orm(img_ao, img_rough, size)

            # 存盘（three.js 调试可复用）
            save_bake_image(img_diff, os.path.join(BAKE_DIR, f'{mat.name}_diffuse.png'))
            save_bake_image(img_norm, os.path.join(BAKE_DIR, f'{mat.name}_normal.png'))
            save_bake_image(img_orm, os.path.join(BAKE_DIR, f'{mat.name}_orm.png'))

            # 替换连线：BaseColor/Normal 用 bake 图，Roughness 用 ORM 图
            nt = mat.node_tree
            bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
            ref = node_refs[o.name]
            for link in list(nt.links):
                if link.to_node == bsdf and link.to_socket.name in ('Base Color', 'Roughness', 'Normal'):
                    nt.links.remove(link)

            n_diff = nt.nodes.new('ShaderNodeTexImage')
            n_diff.image = img_diff
            n_diff.location = ref['diff'].location
            nt.links.new(n_diff.outputs['Color'], bsdf.inputs['Base Color'])

            n_norm = nt.nodes.new('ShaderNodeTexImage')
            n_norm.image = img_norm
            n_norm.location = ref['norm'].location
            n_nmap = nt.nodes.new('ShaderNodeNormalMap')
            n_nmap.location = (-500, -300)
            nt.links.new(n_norm.outputs['Color'], n_nmap.inputs['Color'])
            nt.links.new(n_nmap.outputs['Normal'], bsdf.inputs['Normal'])

            n_orm = nt.nodes.new('ShaderNodeTexImage')
            n_orm.image = img_orm
            n_orm.location = ref['rough'].location
            nt.links.new(n_orm.outputs['Color'], bsdf.inputs['Roughness'])

            print(f'[bake] baked: {mat.name} @ {size}')

    # 5. 顶点色
    if WRITE_MASKS:
        write_aging_vertex_colors(merged)
        print('[bake] vertex colors written')

    # 6. 导出 GLB
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in merged:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_PATH,
        export_format='GLB',
        export_image_format='JPEG',
        export_jpeg_quality=85,
        use_selection=True,
    )
    size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    print(f'Exported to: {OUTPUT_PATH}')
    print(f'[bake] EXPORT_DONE: {OUTPUT_PATH} ({size_mb:.1f} MB)')


main()
