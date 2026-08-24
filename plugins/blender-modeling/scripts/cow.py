"""
AI 3D Modeling - 低多边形牛（Cow）建模脚本，含走路骨骼动画
===============================================================
用途：生成一只带走路动画的低多边形牛（GLB 格式）
特点：
  - 低多边形风格（LP）
  - 褐色身体 + 奶白色斑点
  - 完整的骨骼走路动画
  - 导出时包含 GLTF 动画，可直接在 viewer.html 中播放

输出：GLB 格式（带骨骼动画）

用法：
  blender --background --python cow.py -- --output output.glb

AI 可修改参数：见 params 字典
"""

import bpy
import bmesh
import sys
import os
import json
import math
from mathutils import Vector, Euler


# ============================================================
# 参数配置
# ============================================================
params_schema = {
    "type": "object",
    "properties": {
        "body_color": {"type": "string", "description": "身体颜色 hex，默认 #C4843B"},
        "spot_color": {"type": "string", "description": "斑点颜色 hex，默认 #F5E6D0"},
        "scale": {"type": "number", "minimum": 0.1, "maximum": 5, "description": "整体缩放"},
        "animation_enabled": {"type": "boolean", "description": "是否生成走路动画"},
    },
    "additionalProperties": True,
}

params = {
    "body_color": "#C4843B",
    "spot_color": "#F5E6D0",
    "horn_color": "#4A4A4A",
    "eye_color": "#1A1A1A",
    "nose_color": "#8B6B5A",
    "scale": 1.0,
    "animation_enabled": True,
    "animation_fps": 24,
    "animation_duration": 1.0,
    "subdivision_levels": 0,
}


# ============================================================
# 工具函数
# ============================================================

def parse_args():
    args = sys.argv
    if '--' not in args:
        return
    idx = args.index('--')
    custom_args = args[idx + 1:]
    for i, arg in enumerate(custom_args):
        if arg.startswith('--'):
            key = arg[2:]
            if i + 1 < len(custom_args) and not custom_args[i + 1].startswith('--'):
                val = custom_args[i + 1]
                if key == 'output':
                    params['output_path'] = val
                elif key == 'params':
                    try:
                        extra = json.loads(val)
                        params.update(extra)
                    except json.JSONDecodeError:
                        print(f"Warning: could not parse params JSON: {val}")


def clean_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)
    for block in bpy.data.armatures:
        bpy.data.armatures.remove(block)
    for block in bpy.data.images:
        bpy.data.images.remove(block)
    for block in bpy.data.actions:
        bpy.data.actions.remove(block)


def hex_to_tuple(hex_str, alpha=1.0):
    h = hex_str.lstrip('#')
    if len(h) == 6:
        return (
            int(h[0:2], 16) / 255.0,
            int(h[2:4], 16) / 255.0,
            int(h[4:6], 16) / 255.0,
            alpha,
        )
    return (0.6, 0.6, 0.6, alpha)


def make_plain_material(name, color, roughness=0.6, specular=0.3):
    c = list(color)
    if len(c) == 3:
        c.append(1.0)
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    for n in nodes:
        nodes.remove(n)
    principled = nodes.new(type='ShaderNodeBsdfPrincipled')
    principled.inputs['Base Color'].default_value = tuple(c)
    principled.inputs['Roughness'].default_value = roughness
    if specular is not None:
        principled.inputs['Specular IOR Level'].default_value = specular
    output = nodes.new(type='ShaderNodeOutputMaterial')
    mat.node_tree.links.new(principled.outputs['BSDF'], output.inputs['Surface'])
    mat.diffuse_color = tuple(c)
    return mat


def create_sphere(radius, location, name="mesh", subdivisions=0):
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=radius, location=location, segments=8, ring_count=6)
    obj = bpy.context.active_object
    obj.name = name
    if subdivisions > 0:
        mod = obj.modifiers.new(name="Subdivision", type='SUBSURF')
        mod.levels = subdivisions
        mod.render_levels = subdivisions
    return obj


def create_cube(size, location, name="mesh"):
    bpy.ops.mesh.primitive_cube_add(size=size, location=location)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def create_cylinder(radius, depth, location, name="mesh", vertices=8):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, location=location, vertices=vertices)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def assign_material(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


# ============================================================
# 牛身体构建
# ============================================================

def build_cow_body(p):
    """构建牛的身体各部分"""
    print("  Building cow body...")

    s = p['scale']
    body_mat = make_plain_material("BodyMat", hex_to_tuple(p['body_color']), roughness=0.7)
    spot_mat = make_plain_material("SpotMat", hex_to_tuple(p['spot_color']), roughness=0.6)
    horn_mat = make_plain_material("HornMat", hex_to_tuple(p['horn_color']), roughness=0.3, specular=0.5)
    eye_mat = make_plain_material("EyeMat", hex_to_tuple(p['eye_color']), roughness=0.1, specular=0.9)
    nose_mat = make_plain_material("NoseMat", hex_to_tuple(p['nose_color']), roughness=0.8)

    parts = []
    cz = 0.0  # 地面高度

    # ---- 身体（椭球） ----
    body = create_sphere(radius=0.5 * s, location=(0, 0, cz + 0.45 * s), name="Body", subdivisions=0)
    body.scale = (1.3, 0.85, 0.7)
    assign_material(body, body_mat)
    parts.append(body)

    # ---- 胸部（稍小的椭球，前倾） ----
    chest = create_sphere(radius=0.38 * s, location=(0.35 * s, 0, cz + 0.42 * s), name="Chest", subdivisions=0)
    chest.scale = (0.9, 0.8, 0.75)
    assign_material(chest, body_mat)
    parts.append(chest)

    # ---- 臀部（后部） ----
    hip = create_sphere(radius=0.4 * s, location=(-0.4 * s, 0, cz + 0.40 * s), name="Hip", subdivisions=0)
    hip.scale = (0.85, 0.82, 0.72)
    assign_material(hip, body_mat)
    parts.append(hip)

    # ---- 头部 ----
    head = create_sphere(radius=0.25 * s, location=(0.75 * s, 0, cz + 0.55 * s), name="Head", subdivisions=0)
    head.scale = (0.8, 0.7, 0.7)
    assign_material(head, body_mat)
    parts.append(head)

    # ---- 口鼻部 ----
    snout = create_sphere(radius=0.12 * s, location=(0.95 * s, 0, cz + 0.48 * s), name="Snout", subdivisions=0)
    snout.scale = (0.8, 0.6, 0.5)
    assign_material(snout, nose_mat)
    parts.append(snout)

    # ---- 眼睛 ----
    for side in [-1, 1]:
        eye = create_sphere(radius=0.04 * s, location=(0.80 * s, side * 0.18 * s, cz + 0.62 * s), name=f"Eye_{side}", subdivisions=0)
        eye.scale = (0.5, 0.3, 0.3)
        assign_material(eye, eye_mat)
        parts.append(eye)

    # ---- 牛角 ----
    for side in [-1, 1]:
        horn = create_cylinder(radius=0.025 * s, depth=0.15 * s,
                               location=(0.65 * s, side * 0.15 * s, cz + 0.72 * s),
                               name=f"Horn_{side}", vertices=6)
        horn.rotation_euler = (0, math.radians(side * 15), math.radians(side * 20))
        assign_material(horn, horn_mat)
        parts.append(horn)

    # ---- 尾巴 ----
    tail = create_cylinder(radius=0.015 * s, depth=0.25 * s,
                           location=(-0.65 * s, 0, cz + 0.40 * s),
                           name="Tail", vertices=6)
    tail.rotation_euler = (math.radians(30), 0, 0)
    assign_material(tail, body_mat)
    parts.append(tail)

    # ---- 尾巴末端毛球 ----
    tail_tip = create_sphere(radius=0.025 * s, location=(-0.78 * s, 0, cz + 0.32 * s), name="TailTip", subdivisions=0)
    assign_material(tail_tip, body_mat)
    parts.append(tail_tip)

    # ---- 四条腿 ----
    leg_positions = [
        (0.32 * s, 0.22 * s, "FrontLeft"),
        (0.32 * s, -0.22 * s, "FrontRight"),
        (-0.32 * s, 0.22 * s, "RearLeft"),
        (-0.32 * s, -0.22 * s, "RearRight"),
    ]
    for lx, ly, lname in leg_positions:
        leg = create_cylinder(radius=0.045 * s, depth=0.35 * s,
                              location=(lx, ly, cz + 0.175 * s),
                              name=f"Leg_{lname}", vertices=6)
        assign_material(leg, body_mat)
        parts.append(leg)

        # 蹄子
        hoof = create_sphere(radius=0.035 * s, location=(lx, ly, cz + 0.01 * s), name=f"Hoof_{lname}", subdivisions=0)
        hoof.scale = (0.8, 0.6, 0.3)
        assign_material(hoof, horn_mat)
        parts.append(hoof)

    # ---- 斑点（用扁球体贴在身体上） ----
    spot_positions = [
        (0.15 * s, 0.20 * s, cz + 0.50 * s, 0.10 * s),
        (-0.10 * s, -0.15 * s, cz + 0.45 * s, 0.08 * s),
        (0.05 * s, 0.25 * s, cz + 0.38 * s, 0.06 * s),
        (-0.25 * s, 0.10 * s, cz + 0.48 * s, 0.07 * s),
        (0.20 * s, -0.22 * s, cz + 0.42 * s, 0.09 * s),
    ]
    for sx, sy, sz, sr in spot_positions:
        spot = create_sphere(radius=sr, location=(sx, sy, sz), name="Spot", subdivisions=0)
        spot.scale = (1.0, 0.5, 0.3)
        assign_material(spot, spot_mat)
        parts.append(spot)

    print(f"    Total body parts: {len(parts)}")
    return parts


# ============================================================
# 骨骼动画（走路循环）
# ============================================================

def build_walk_animation(p, body_parts):
    """为牛创建走路骨骼动画

    骨骼结构：
    - Root（身体根骨骼，控制整体位置）
    - Body（身体骨骼，控制身体上下浮动）
    - FrontLeft / FrontRight / RearLeft / RearRight（四条腿骨骼）

    走路动画循环：
    - 阶段1（0-25%）：左前+右后 抬起，右前+左后 放下
    - 阶段2（25-50%）：过渡到直立
    - 阶段3（50-75%）：右前+左后 抬起，左前+右后 放下
    - 阶段4（75-100%）：过渡到直立
    """
    if not p['animation_enabled']:
        return None

    print("  Creating walk animation armature...")

    s = p['scale']
    fps = p['animation_fps']
    duration = p['animation_duration']
    total_frames = int(duration * fps)

    # 创建骨骼
    armature = bpy.data.armatures.new("Cow_Armature")
    armature_obj = bpy.data.objects.new("Cow_Armature", armature)
    bpy.context.collection.objects.link(armature_obj)
    bpy.context.view_layer.objects.active = armature_obj

    bpy.ops.object.mode_set(mode='EDIT')
    edit_bones = armature.edit_bones

    cz = 0.0  # 地面高度

    # 根骨骼（在身体中心）
    root_bone = edit_bones.new("Root")
    root_bone.head = (0, 0, cz + 0.35 * s)
    root_bone.tail = (0, 0, cz + 0.55 * s)
    root_bone.use_connect = False

    # 身体骨骼
    body_bone = edit_bones.new("Body")
    body_bone.head = (0, 0, cz + 0.35 * s)
    body_bone.tail = (0, 0, cz + 0.45 * s)
    body_bone.parent = root_bone

    # 四条腿骨骼（在腿的根部位置）
    leg_data = [
        ("FrontLeft", 0.32 * s, 0.22 * s),
        ("FrontRight", 0.32 * s, -0.22 * s),
        ("RearLeft", -0.32 * s, 0.22 * s),
        ("RearRight", -0.32 * s, -0.22 * s),
    ]
    leg_bones = {}
    for lname, lx, ly in leg_data:
        leg_bone = edit_bones.new(lname)
        leg_bone.head = (lx, ly, cz + 0.25 * s)
        leg_bone.tail = (lx, ly, cz + 0.05 * s)
        leg_bone.parent = body_bone
        leg_bones[lname] = leg_bone

    bpy.ops.object.mode_set(mode='POSE')
    poses = armature_obj.pose.bones

    # ---- 父级牛部件到骨骼 ----
    bpy.ops.object.mode_set(mode='OBJECT')

    # 身体部件绑定到 Body 骨骼
    body_part_names = ['Body', 'Chest', 'Hip', 'Head', 'Snout', 'Tail', 'TailTip']
    for side in [-1, 1]:
        body_part_names.append(f"Eye_{side}")
        body_part_names.append(f"Horn_{side}")
    body_part_names.append('Spot')  # 多个斑点同名
    for obj in bpy.data.objects:
        for pname in body_part_names:
            if obj.name.startswith(pname):
                obj.parent = armature_obj
                obj.parent_type = 'ARMATURE'
                obj.parent_bone = "Body"

    # 腿绑定到对应腿骨骼
    for lname, _, _ in leg_data:
        for obj in bpy.data.objects:
            if obj.name.startswith(f"Leg_{lname}") or obj.name.startswith(f"Hoof_{lname}"):
                obj.parent = armature_obj
                obj.parent_type = 'ARMATURE'
                obj.parent_bone = lname

    bpy.context.view_layer.objects.active = armature_obj

    # ---- 生成走路动画关键帧 ----
    print(f"    Generating walk animation: {total_frames} frames...")

    # 腿摆动角度（弧度）
    leg_swing = math.radians(25)
    body_bob = 0.04 * s  # 身体上下浮动幅度

    def keyframe_leg(pose_bone, angle, frame):
        pose_bone.rotation_mode = 'XYZ'
        pose_bone.rotation_euler = (angle, 0, 0)
        pose_bone.keyframe_insert(data_path='rotation_euler', frame=frame, index=0)

    def keyframe_body(pose_bone, z_offset, frame):
        pose_bone.location = (0, 0, z_offset)
        pose_bone.keyframe_insert(data_path='location', frame=frame, index=2)

    root_pose = poses["Root"]
    body_pose = poses["Body"]
    fl_pose = poses["FrontLeft"]
    fr_pose = poses["FrontRight"]
    rl_pose = poses["RearLeft"]
    rr_pose = poses["RearRight"]

    f = total_frames
    f0 = 1

    # 生成 4 阶段关键帧
    keyframes = [0, 0.25, 0.50, 0.75, 1.0]

    for t in keyframes:
        frame = int(f0 + t * f) if t < 1.0 else f0 + f

        # 腿摆动：对角线交替
        # 相位 0: 左前+右后 抬起 (正角度)
        # 相位 0.5: 右前+左后 抬起
        phase = t * 2 * math.pi  # 一个完整周期

        fl_angle = leg_swing * math.sin(phase)
        rr_angle = leg_swing * math.sin(phase)
        fr_angle = leg_swing * math.sin(phase + math.pi)
        rl_angle = leg_swing * math.sin(phase + math.pi)

        keyframe_leg(fl_pose, fl_angle, frame)
        keyframe_leg(rr_pose, rr_angle, frame)
        keyframe_leg(fr_pose, fr_angle, frame)
        keyframe_leg(rl_pose, rl_angle, frame)

        # 身体上下浮动
        bob = body_bob * abs(math.sin(phase))
        keyframe_body(body_pose, bob, frame)

    # 设置插值曲线
    scene = bpy.context.scene
    action = armature_obj.animation_data.action
    if action:
        for fcurve in action.fcurves:
            for point in fcurve.keyframe_points:
                point.interpolation = 'CUBIC'

    # 设置动画循环
    scene.render.fps = fps
    scene.frame_start = f0
    scene.frame_end = f0 + f

    print(f"    Walk animation: {total_frames} frames, {duration}s at {fps}fps")
    return armature_obj


# ============================================================
# 场景设置与导出
# ============================================================

def setup_scene():
    scene = bpy.context.scene
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1920
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.world.use_nodes = False
    scene.world.color = (0.95, 0.95, 0.98)

    bpy.ops.object.light_add(type='SUN', location=(3, 3, 5))
    sun = bpy.context.active_object
    sun.data.energy = 1.5

    bpy.ops.object.light_add(type='AREA', location=(3, -3, 4))
    area = bpy.context.active_object
    area.data.energy = 200


def export_glb(output_path, export_animations):
    if not output_path:
        output_path = "//cow.glb"
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)

    bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        export_materials='EXPORT',
        export_image_format='JPEG',
        export_texcoords=True,
        export_normals=True,
        export_draco_mesh_compression_enable=False,
        export_animations=export_animations,
        export_skins=True,
    )
    print(f"\n✅ Exported to: {output_path}")


# ============================================================
# 主入口
# ============================================================

if __name__ == "__main__":
    parse_args()

    print("=" * 50)
    print("🐄 牛建模开始")
    print(f"    Scale: {params['scale']}")
    print(f"    Animation: {params['animation_enabled']}")
    print("=" * 50)

    clean_scene()

    # 构建牛身体
    body_parts = build_cow_body(params)

    # 骨骼动画
    armature_obj = None
    if params['animation_enabled']:
        armature_obj = build_walk_animation(params, body_parts)

    setup_scene()

    output = params.get('output_path', '//cow.glb')
    export_glb(output, export_animations=params['animation_enabled'])

    parts_count = len(body_parts)
    print(f"\n{'=' * 50}")
    print(f"🎉 牛建模完成！")
    print(f"   总部件数: {parts_count}")
    print(f"   骨骼动画: {'✅ 已导出' if params['animation_enabled'] else '❌ 未启用'}")
    print(f"   输出文件: {output}")
    print(f"{'=' * 50}")