"""一次性修复：把现有 textured GLB 内嵌 diffuse 贴图从线性值转 sRGB。

背景：bake 出的 DIFFUSE 图以 Non-Color(线性)存盘并内嵌进 GLB,three.js 按
sRGB 采样 → 渲染整体过暗 ~2.2 次方。本脚本导入 GLB,对每个材质的 BaseColor
贴图像素做 linear→sRGB 变换后重导出,免 19 分钟重烘。
之后 bake_house.py 已在源头修复(save_bake_image srgb=True),本脚本仅供补救。

CLI: blender --background --python fix_glb_srgb.py -- <in.glb> <out.glb>
"""

import bpy
import sys
import os

import numpy as np

argv = sys.argv
_idx = argv.index('--') if '--' in argv else len(argv)
GLB_IN = os.path.abspath(argv[_idx + 1])
GLB_OUT = os.path.abspath(argv[_idx + 2])


def linear_to_srgb(x):
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(np.clip(x, 1e-8, None), 1 / 2.4) - 0.055)


def fix_diffuse_srgb():
    """只转换名字带 _diffuse 的贴图(bake 产物命名约定)。"""
    fixed = set()
    for mat in bpy.data.materials:
        nt = mat.node_tree
        if not nt:
            continue
        for n in nt.nodes:
            if n.type != 'TEX_IMAGE' or not n.image or not n.image.name.endswith('_diffuse'):
                continue
            img = n.image
            if img.name in fixed:
                continue
            fixed.add(img.name)
        w, h = img.size
        px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
        # pixels 底行在前,翻转处理再翻回
        px = px[::-1]
        rgb = px[..., :3]
        # 图像以线性浮点读出(Non-Color) → 转成 sRGB 数值
        px[..., :3] = linear_to_srgb(rgb)
        px = px[::-1]
        img.pixels = px.ravel().tolist()
        img.filepath_raw = ''  # 打包用,避免引用外部文件
        print(f'[srgb-fix] converted: {img.name} ({w}x{h})')
    print(f'[srgb-fix] {len(fixed)} images converted')


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_IN)
    fix_diffuse_srgb()
    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format='GLB',
        export_image_format='JPEG',
        export_jpeg_quality=85,
    )
    print(f'[srgb-fix] EXPORT_DONE: {GLB_OUT} ({os.path.getsize(GLB_OUT) / 1048576:.1f} MB)')


main()
