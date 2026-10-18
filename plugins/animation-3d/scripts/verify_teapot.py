#!/usr/bin/env python
# 第一步可行性验证脚本：建一个简单 3D 场景 → 渲染 PNG → 退出。
# 运行方式（Blender 装好后）:
#   blender -b -P scripts/verify_teapot.py
# 产出: out/verify_teapot.png
import bpy
import os

# 清空默认场景
bpy.ops.wm.read_factory_settings(use_empty=True)

# 1. Suzanne（猴子头，Blender 经典网格）
bpy.ops.mesh.primitive_monkey_add(size=2, location=(0, 0, 0))

# 2. 地面
bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, -2))
ground = bpy.context.object
mat = bpy.data.materials.new(name="Ground")
mat.diffuse_color = (0.6, 0.6, 0.65, 1)
ground.data.materials.append(mat)

# 3. 材质：给猴子一个简单的橙色（清空自带材质，只留我们的）
monkey = bpy.data.objects["Suzanne"]
while monkey.data.materials:
    monkey.data.materials.pop()
mmonkey = bpy.data.materials.new(name="SuzanneMat")
mmonkey.diffuse_color = (0.85, 0.45, 0.1, 1)
monkey.data.materials.append(mmonkey)

# 4. 相机
bpy.ops.object.camera_add(location=(6, -6, 4))
cam = bpy.context.object
cam.rotation_euler = (1.0472, 0, 0.785398)  # ~60度俯角
bpy.context.scene.camera = cam

# 5. 灯光
bpy.ops.object.light_add(type='SUN', location=(0, 0, 10))
bpy.context.object.data.energy = 3

# 6. 渲染设置（EEVEE，集显友好）
# Blender 4.2+ 中 EEVEE 枚举更名为 BLENDER_EEVEE_NEXT，按版本适配
bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT'
bpy.context.scene.render.resolution_x = 960
bpy.context.scene.render.resolution_y = 540
bpy.context.scene.render.film_transparent = False

# 输出
out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out")
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.abspath(os.path.join(out_dir, "verify_teapot.png"))
bpy.context.scene.render.filepath = out_path

print(f"[verify] rendering to {out_path}")
bpy.ops.render.render(write_still=True)
print(f"[verify] DONE {out_path}")
