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

    moss = np.clip((nz - 0.55) / 0.45, 0, 1) ** 1.5 * np.clip((patch - 0.42) * 2.5, 0, 1)
    dirt = np.clip((0.9 - world[:, 2]) / 1.4, 0, 1) * np.clip((patch - 0.3) * 2.0, 0, 1)
    is_wood = obj.name.startswith('wood')
    peel = np.clip((patch - 0.48) * 3.0, 0, 1) if is_wood else np.zeros(n)

    colors = np.empty((n, 4), dtype=np.float32)
    colors[:, 0] = np.clip(moss * 0.9, 0, 1)
    colors[:, 1] = np.clip(dirt * 0.8, 0, 1)
    colors[:, 2] = np.clip(peel, 0, 1)
    colors[:, 3] = 1.0

    for old in list(mesh.color_attributes):
        mesh.color_attributes.remove(old)
    attr = mesh.color_attributes.new(name='aging', type='FLOAT_COLOR', domain='POINT')
    attr.data.foreach_set('color', colors.reshape(-1))
    mean = colors.mean(axis=0)
    print(f'[patch] {obj.name}: {n} v, mean mask=({mean[0]:.3f},{mean[1]:.3f},{mean[2]:.3f})')


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    print(f'[patch] in ={GLB_IN}')
    bpy.ops.import_scene.gltf(filepath=GLB_IN)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    print(f'[patch] objects: {[o.name for o in meshes]}')
    for o in meshes:
        write_aging(o)
    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format='GLB',
        export_image_format='JPEG',
        export_jpeg_quality=85,
    )
    print(f'[patch] EXPORT_DONE: {GLB_OUT} ({os.path.getsize(GLB_OUT) / 1048576:.1f} MB)')


main()
