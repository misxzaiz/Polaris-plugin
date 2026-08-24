"""
AI 3D Modeling - 写实风格牛（Realistic Cow）建模脚本，含走路骨骼动画
========================================================================
用途：生成一只带走路动画的写实风格牛（GLB 格式）
特点：
  - 细分曲面（Subdivision Surface）→ 光滑有机形态
  - 程序化纹理（Noise Texture + Color Ramp）→ 真实毛皮质感
  - 更精细的骨骼结构（6 根骨骼，自然步态）
  - 真实比例解剖（颈部、肩部、臀部隆起、乳房等细节）
  - 导出时包含 GLTF 动画

输出：GLB 格式（带骨骼动画）

用法：
  blender --background --python realistic_cow.py -- --output output.glb
"""

import bpy
import bmesh
import sys
import os
import json
import math
import random
from mathutils import Vector, Euler


# ============================================================
# 参数配置
# ============================================================
params_schema = {
    "type": "object",
    "properties": {
        "body_color": {"type": "string", "description": "身体主色 hex，默认 #C4843B"},
        "belly_color": {"type": "string", "description": "腹部颜色 hex，默认 #E8D5B0"},
        "scale": {"type": "number", "minimum": 0.1, "maximum": 5, "description": "整体缩放"},
        "animation_enabled": {"type": "boolean", "description": "是否生成走路动画"},
        "subdivision": {"type": "integer", "minimum": 1, "maximum": 3, "description": "细分级别(1-3)，越高越平滑"},
    },
    "additionalProperties": True,
}

params = {
    "body_color": "#A0703A",
    "belly_color": "#E0C8A0",
    "horn_color": "#4A4A48",
    "eye_color": "#1A1A1A",
    "nose_color": "#8B6B5A",
    "hoof_color": "#2A2A28",
    "udder_color": "#D4A080",
    "scale": 1.0,
    "animation_enabled": True,
    "animation_fps": 24,
    "animation_duration": 1.0,
    "subdivision": 2,
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
    for block in bpy.data.textures:
        bpy.data.textures.remove(block)


def hex_to_rgb(hex_str):
    h = hex_str.lstrip('#')
    if len(h) == 6:
        return (
            int(h[0:2], 16) / 255.0,
            int(h[2:4], 16) / 255.0,
            int(h[4:6], 16) / 255.0,
        )
    return (0.6, 0.6, 0.6)


def make_fur_material(name, base_color, roughness=0.6, specular=0.2, subsurface=0.0):
    """创建带程序化纹理的毛皮材质"""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for n in nodes:
        nodes.remove(n)

    # 节点输出
    output = nodes.new(type='ShaderNodeOutputMaterial')
    output.location = (800, 0)

    # Principled BSDF
    principled = nodes.new(type='ShaderNodeBsdfPrincipled')
    principled.location = (500, 0)
    principled.inputs['Roughness'].default_value = roughness
    principled.inputs['Specular IOR Level'].default_value = specular
    if subsurface > 0:
        principled.inputs['Subsurface Weight'].default_value = subsurface
        principled.inputs['Subsurface Radius'].default_value = (0.3, 0.1, 0.05)

    # 纹理坐标 + 映射
    tex_coord = nodes.new(type='ShaderNodeTexCoord')
    tex_coord.location = (-800, 0)
    mapping = nodes.new(type='ShaderNodeMapping')
    mapping.location = (-600, 0)
    mapping.inputs['Scale'].default_value = (1.5, 1.5, 1.5)

    # 噪声纹理 → 表皮细节（模拟毛皮纹理）
    noise = nodes.new(type='ShaderNodeTexNoise')
    noise.location = (-400, 100)
    noise.inputs['Scale'].default_value = 30.0
    noise.inputs['Detail'].default_value = 8.0
    noise.inputs['Roughness'].default_value = 0.6
    noise.inputs['Distortion'].default_value = 0.2

    # 颜色渐变：将噪声映射到毛皮颜色变化
    color_ramp = nodes.new(type='ShaderNodeValToRGB')
    color_ramp.location = (-200, 100)
    # 深色基底 + 浅色毛尖
    base_rgb = hex_to_rgb(base_color)
    lighter = tuple(min(1.0, c + 0.12) for c in base_rgb)
    darker = tuple(max(0.0, c - 0.08) for c in base_rgb)
    color_ramp.color_ramp.elements[0].color = (*darker, 1.0)
    color_ramp.color_ramp.elements[0].position = 0.3
    elem = color_ramp.color_ramp.elements.new(0.7)
    elem.color = (*lighter, 1.0)
    elem2 = color_ramp.color_ramp.elements.new(0.9)
    elem2.color = (*tuple(min(1.0, c + 0.20) for c in base_rgb), 1.0)

    # 连接
    links.new(tex_coord.outputs['UV'], mapping.inputs['Vector'])
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
    links.new(noise.outputs['Fac'], color_ramp.inputs['Fac'])
    links.new(color_ramp.outputs['Color'], principled.inputs['Base Color'])
    links.new(principled.outputs['BSDF'], output.inputs['Surface'])

    return mat


def make_belly_material(name, base_color):
    """腹部材质（更浅、更柔软）"""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for n in nodes:
        nodes.remove(n)

    output = nodes.new(type='ShaderNodeOutputMaterial')
    output.location = (600, 0)

    principled = nodes.new(type='ShaderNodeBsdfPrincipled')
    principled.location = (300, 0)
    principled.inputs['Roughness'].default_value = 0.7
    principled.inputs['Specular IOR Level'].default_value = 0.15
    principled.inputs['Subsurface Weight'].default_value = 0.1

    tex_coord = nodes.new(type='ShaderNodeTexCoord')
    tex_coord.location = (-600, 0)
    mapping = nodes.new(type='ShaderNodeMapping')
    mapping.location = (-400, 0)
    mapping.inputs['Scale'].default_value = (1.0, 1.0, 1.0)

    noise = nodes.new(type='ShaderNodeTexNoise')
    noise.location = (-200, 100)
    noise.inputs['Scale'].default_value = 15.0
    noise.inputs['Detail'].default_value = 4.0

    base_rgb = hex_to_rgb(base_color)
    color_ramp = nodes.new(type='ShaderNodeValToRGB')
    color_ramp.location = (0, 100)
    darker = tuple(max(0.0, c - 0.05) for c in base_rgb)
    lighter = tuple(min(1.0, c + 0.08) for c in base_rgb)
    color_ramp.color_ramp.elements[0].color = (*darker, 1.0)
    color_ramp.color_ramp.elements[0].position = 0.4
    elem = color_ramp.color_ramp.elements.new(0.8)
    elem.color = (*lighter, 1.0)

    links.new(tex_coord.outputs['UV'], mapping.inputs['Vector'])
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
    links.new(noise.outputs['Fac'], color_ramp.inputs['Fac'])
    links.new(color_ramp.outputs['Color'], principled.inputs['Base Color'])
    links.new(principled.outputs['BSDF'], output.inputs['Surface'])

    return mat


def make_simple_material(name, color, roughness=0.5, specular=0.3):
    """纯色材质（用于眼睛、角、蹄子等）"""
    rgb = hex_to_rgb(color)
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    for n in nodes:
        nodes.remove(n)
    principled = nodes.new(type='ShaderNodeBsdfPrincipled')
    principled.inputs['Base Color'].default_value = (*rgb, 1.0)
    principled.inputs['Roughness'].default_value = roughness
    if specular is not None:
        principled.inputs['Specular IOR Level'].default_value = specular
    output = nodes.new(type='ShaderNodeOutputMaterial')
    mat.node_tree.links.new(principled.outputs['BSDF'], output.inputs['Surface'])
    mat.diffuse_color = (*rgb, 1.0)
    return mat


def add_subdivision(obj, levels):
    """添加细分曲面修饰器"""
    if levels > 0:
        mod = obj.modifiers.new(name="Subdivision", type='SUBSURF')
        mod.levels = levels
        mod.render_levels = levels
        mod.quality = 3
        return mod
    return None


def create_primitive(type_name, location, name, **kwargs):
    """创建基本体并返回对象"""
    if type_name == 'sphere':
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=kwargs.get('radius', 0.5),
            location=location,
            segments=kwargs.get('segments', 16),
            ring_count=kwargs.get('rings', 12))
    elif type_name == 'cube':
        bpy.ops.mesh.primitive_cube_add(
            size=kwargs.get('size', 1.0),
            location=location)
    elif type_name == 'cylinder':
        bpy.ops.mesh.primitive_cylinder_add(
            radius=kwargs.get('radius', 0.5),
            depth=kwargs.get('depth', 1.0),
            location=location,
            vertices=kwargs.get('vertices', 16))
    else:
        raise ValueError(f"Unknown primitive: {type_name}")

    obj = bpy.context.active_object
    obj.name = name
    return obj


def create_ellipsoid(radius, location, name, scale_xyz, subdiv=2):
    """创建椭球体（细分后的球体，缩放）"""
    obj = create_primitive('sphere', location, name,
                          radius=radius, segments=16, rings=12)
    obj.scale = scale_xyz
    add_subdivision(obj, subdiv)
    return obj


def assign_material(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


# ============================================================
# 牛身体构建（写实风格，使用细分曲面）
# ============================================================

def build_cow(p):
    """构建牛的身体各部分，使用细分曲面达到平滑效果"""
    print("  Building realistic cow body...")

    s = p['scale']
    subdiv = p['subdivision']

    # 材质
    body_mat = make_fur_material("BodyMat", p['body_color'], roughness=0.65, specular=0.2, subsurface=0.05)
    belly_mat = make_belly_material("BellyMat", p['belly_color'])
    horn_mat = make_simple_material("HornMat", p['horn_color'], roughness=0.3, specular=0.5)
    eye_mat = make_simple_material("EyeMat", p['eye_color'], roughness=0.1, specular=0.9)
    nose_mat = make_simple_material("NoseMat", p['nose_color'], roughness=0.8)
    hoof_mat = make_simple_material("HoofMat", p['hoof_color'], roughness=0.9, specular=0.05)
    udder_mat = make_simple_material("UdderMat", p['udder_color'], roughness=0.7, specular=0.2)

    parts = []
    cz = 0.0  # 地面

    # ================================================================
    # 身体主躯干（使用多个椭球体融合，通过细分平滑）
    # ================================================================

    # 躯干主体（较大的椭球，覆盖胸→腹→臀）
    body = create_ellipsoid(0.5 * s, (0, 0, cz + 0.55 * s), "Body",
                           (1.4, 0.85, 0.75), subdiv)
    assign_material(body, body_mat)
    parts.append(body)

    # 胸部（前胸凸起，牛肩部）
    chest = create_ellipsoid(0.35 * s, (0.55 * s, 0, cz + 0.55 * s), "Chest",
                            (0.85, 0.75, 0.75), subdiv)
    assign_material(chest, body_mat)
    parts.append(chest)

    # 肩部隆起（牛的典型特征，肩胛骨上方）
    shoulder = create_ellipsoid(0.25 * s, (0.35 * s, 0, cz + 0.72 * s), "Shoulder",
                               (0.7, 0.6, 0.5), subdiv)
    assign_material(shoulder, body_mat)
    parts.append(shoulder)

    # 臀部隆起
    hip = create_ellipsoid(0.3 * s, (-0.55 * s, 0, cz + 0.68 * s), "Hip",
                          (0.75, 0.7, 0.55), subdiv)
    assign_material(hip, body_mat)
    parts.append(hip)

    # 腹部（较浅的颜色，有下垂感）
    belly = create_ellipsoid(0.3 * s, (0.05 * s, 0, cz + 0.35 * s), "Belly",
                            (1.0, 0.65, 0.4), subdiv)
    assign_material(belly, belly_mat)
    parts.append(belly)

    # ================================================================
    # 颈部（连接躯干和头部，细长，向下倾斜）
    # ================================================================
    neck = create_ellipsoid(0.18 * s, (0.85 * s, 0, cz + 0.62 * s), "Neck",
                           (0.65, 0.5, 0.5), subdiv)
    neck.rotation_euler = (0, math.radians(-15), 0)
    assign_material(neck, body_mat)
    parts.append(neck)

    # ================================================================
    # 头部
    # ================================================================
    # 头骨主体（略长，牛头特征）
    head = create_ellipsoid(0.2 * s, (1.15 * s, 0, cz + 0.65 * s), "Head",
                           (0.75, 0.6, 0.65), subdiv)
    head.rotation_euler = (0, math.radians(-10), 0)
    assign_material(head, body_mat)
    parts.append(head)

    # 额头（稍凸）
    forehead = create_ellipsoid(0.14 * s, (1.05 * s, 0, cz + 0.72 * s), "Forehead",
                               (0.4, 0.5, 0.4), subdiv)
    assign_material(forehead, body_mat)
    parts.append(forehead)

    # 口鼻部（宽而长）
    snout = create_ellipsoid(0.12 * s, (1.35 * s, 0, cz + 0.58 * s), "Snout",
                            (0.5, 0.5, 0.45), subdiv)
    assign_material(snout, nose_mat)
    parts.append(snout)

    # 鼻镜（湿润的黑色鼻子区域）
    nose_plate = create_ellipsoid(0.06 * s, (1.42 * s, 0, cz + 0.56 * s), "NosePlate",
                                 (0.3, 0.5, 0.25), subdiv)
    assign_material(nose_plate, horn_mat)  # 用深色材质
    parts.append(nose_plate)

    # 下颌
    jaw = create_ellipsoid(0.1 * s, (1.20 * s, 0, cz + 0.55 * s), "Jaw",
                          (0.5, 0.45, 0.35), subdiv)
    assign_material(jaw, body_mat)
    parts.append(jaw)

    # ================================================================
    # 耳朵
    # ================================================================
    for side in [-1, 1]:
        ear = create_primitive('sphere', (1.08 * s, side * 0.18 * s, cz + 0.75 * s),
                              f"Ear_{side}", radius=0.05 * s, segments=8, rings=6)
        ear.scale = (0.5, 0.15, 0.3)
        ear.rotation_euler = (math.radians(side * 20), math.radians(10), math.radians(side * 30))
        add_subdivision(ear, subdiv)
        assign_material(ear, body_mat)
        # 耳内粉色
        ear_inner = create_primitive('sphere', (1.08 * s, side * 0.18 * s, cz + 0.74 * s),
                                     f"EarInner_{side}", radius=0.03 * s, segments=6, rings=4)
        ear_inner.scale = (0.3, 0.1, 0.2)
        ear_inner.rotation_euler = (math.radians(side * 20), math.radians(10), math.radians(side * 30))
        ear_inner_mat = make_simple_material(f"EarInnerMat_{side}", "#D4A080", roughness=0.6)
        assign_material(ear_inner, ear_inner_mat)
        add_subdivision(ear_inner, subdiv)
        parts.append(ear)
        parts.append(ear_inner)

    # ================================================================
    # 眼睛
    # ================================================================
    for side in [-1, 1]:
        # 眼球
        eye = create_primitive('sphere', (1.15 * s, side * 0.15 * s, cz + 0.68 * s),
                              f"Eye_{side}", radius=0.035 * s, segments=10, rings=8)
        assign_material(eye, eye_mat)
        parts.append(eye)
        # 眼白（稍大，在眼球后面）
        eye_white = create_primitive('sphere', (1.15 * s, side * 0.15 * s, cz + 0.68 * s),
                                     f"EyeWhite_{side}", radius=0.04 * s, segments=8, rings=6)
        eye_white.scale = (0.8, 0.8, 0.8)
        white_mat = make_simple_material(f"EyeWhiteMat_{side}", "#F5F0E8", roughness=0.1)
        assign_material(eye_white, white_mat)
        parts.append(eye_white)

    # ================================================================
    # 角（牛的角是弯曲的，用多个圆柱段拼接）
    # ================================================================
    for side in [-1, 1]:
        angle_mult = side
        # 角基部（粗）
        horn_base = create_primitive('cylinder', (1.0 * s, angle_mult * 0.12 * s, cz + 0.78 * s),
                                     f"HornBase_{side}", radius=0.03 * s, depth=0.1 * s, vertices=12)
        horn_base.rotation_euler = (math.radians(angle_mult * 10), math.radians(10), math.radians(angle_mult * 15))
        add_subdivision(horn_base, 1)
        assign_material(horn_base, horn_mat)
        parts.append(horn_base)

        # 角中部（弯曲）
        horn_mid = create_primitive('cylinder', (0.98 * s, angle_mult * 0.18 * s, cz + 0.85 * s),
                                    f"HornMid_{side}", radius=0.022 * s, depth=0.12 * s, vertices=12)
        horn_mid.rotation_euler = (math.radians(angle_mult * 15), math.radians(15), math.radians(angle_mult * 25))
        add_subdivision(horn_mid, 1)
        assign_material(horn_mid, horn_mat)
        parts.append(horn_mid)

        # 角尖（细，向外弯曲）
        horn_tip = create_primitive('cylinder', (0.95 * s, angle_mult * 0.25 * s, cz + 0.92 * s),
                                    f"HornTip_{side}", radius=0.015 * s, depth=0.15 * s, vertices=12)
        horn_tip.rotation_euler = (math.radians(angle_mult * 20), math.radians(20), math.radians(angle_mult * 35))
        add_subdivision(horn_tip, 1)
        assign_material(horn_tip, horn_mat)
        parts.append(horn_tip)

    # ================================================================
    # 尾巴
    # ================================================================
    tail = create_primitive('cylinder', (-0.75 * s, 0, cz + 0.50 * s),
                           "Tail", radius=0.025 * s, depth=0.35 * s, vertices=8)
    tail.rotation_euler = (math.radians(35), math.radians(5), 0)
    add_subdivision(tail, 1)
    assign_material(tail, body_mat)
    parts.append(tail)

    # 尾巴末端毛簇
    tail_tuft = create_primitive('sphere', (-0.88 * s, 0, cz + 0.30 * s),
                                "TailTuft", radius=0.04 * s, segments=8, rings=6)
    tail_tuft.scale = (0.8, 0.5, 0.6)
    add_subdivision(tail_tuft, 1)
    tuft_mat = make_simple_material("TuftMat", "#8B6B4A", roughness=0.9)
    assign_material(tail_tuft, tuft_mat)
    parts.append(tail_tuft)

    # ================================================================
    # 四条腿
    # ================================================================
    # 腿的位置（前后左右）
    leg_positions = [
        (0.40 * s, 0.25 * s, "FrontLeft"),
        (0.40 * s, -0.25 * s, "FrontRight"),
        (-0.40 * s, 0.25 * s, "RearLeft"),
        (-0.40 * s, -0.25 * s, "RearRight"),
    ]

    for lx, ly, lname in leg_positions:
        # 大腿/上腿（粗）
        upper_leg = create_primitive('cylinder', (lx, ly, cz + 0.35 * s),
                                    f"LegUpper_{lname}", radius=0.06 * s, depth=0.25 * s, vertices=12)
        upper_leg.scale = (1.0, 1.0, 1.0)
        add_subdivision(upper_leg, 1)
        assign_material(upper_leg, body_mat)
        parts.append(upper_leg)

        # 小腿（稍细）
        lower_leg = create_primitive('cylinder', (lx, ly, cz + 0.15 * s),
                                     f"LegLower_{lname}", radius=0.04 * s, depth=0.2 * s, vertices=12)
        add_subdivision(lower_leg, 1)
        assign_material(lower_leg, body_mat)
        parts.append(lower_leg)

        # 膝关节（球体）
        knee = create_primitive('sphere', (lx, ly, cz + 0.28 * s),
                               f"Knee_{lname}", radius=0.045 * s, segments=8, rings=6)
        knee.scale = (1.0, 0.8, 0.7)
        add_subdivision(knee, 1)
        assign_material(knee, body_mat)
        parts.append(knee)

        # 蹄子
        hoof = create_primitive('sphere', (lx, ly, cz + 0.04 * s),
                               f"Hoof_{lname}", radius=0.035 * s, segments=8, rings=6)
        hoof.scale = (0.7, 0.55, 0.3)
        hoof.rotation_euler = (math.radians(5), 0, 0)
        assign_material(hoof, hoof_mat)
        parts.append(hoof)

        # 蹄叉（蹄子后面的小突出）
        dewclaw = create_primitive('sphere', (lx, ly - 0.02 * s if ly > 0 else ly + 0.02 * s, cz + 0.06 * s),
                                   f"Dewclaw_{lname}", radius=0.015 * s, segments=6, rings=4)
        dewclaw.scale = (0.5, 0.3, 0.3)
        assign_material(dewclaw, hoof_mat)
        parts.append(dewclaw)

    # ================================================================
    # 乳房（母牛特征）
    # ================================================================
    udder = create_primitive('sphere', (-0.30 * s, 0, cz + 0.15 * s),
                            "Udder", radius=0.1 * s, segments=10, rings=8)
    udder.scale = (0.8, 0.6, 0.4)
    add_subdivision(udder, 1)
    assign_material(udder, udder_mat)
    parts.append(udder)

    # 乳头（4个）
    for ti in range(4):
        t_angle = 2 * math.pi * ti / 4
        t_x = -0.30 * s + 0.04 * s * math.cos(t_angle)
        t_z = 0.04 * s
        t_y = 0.06 * s * math.sin(t_angle)
        teat = create_primitive('cylinder', (t_x, t_y, cz + t_z),
                               f"Teat_{ti}", radius=0.015 * s, depth=0.04 * s, vertices=8)
        assign_material(teat, udder_mat)
        parts.append(teat)

    print(f"    Total parts: {len(parts)}")
    return parts


# ============================================================
# 骨骼动画（走路循环，更真实的步态）
# ============================================================

def build_walk_animation(p, body_parts):
    """创建牛走路骨骼动画

    骨骼结构：
    - Root（控制整体位置，轻微上下浮动）
    - Body（身体骨骼，控制呼吸/起伏）
    - FrontLeft / FrontRight / RearLeft / RearRight（四条腿骨骼）

    真实步态（牛的行走方式）：
    - 牛是四足动物，行走时对角线步态
    - 左前+右后 同时向前 → 右前+左后 同时向前
    - 每步有抬腿→前伸→落地→后蹬四个阶段
    """
    if not p['animation_enabled']:
        return None

    print("  Creating realistic walk animation armature...")

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

    cz = 0.0

    # 骨骼结构
    root_bone = edit_bones.new("Root")
    root_bone.head = (0, 0, cz + 0.35 * s)
    root_bone.tail = (0.05 * s, 0, cz + 0.55 * s)

    body_bone = edit_bones.new("Body")
    body_bone.head = (0, 0, cz + 0.35 * s)
    body_bone.tail = (0.05 * s, 0, cz + 0.50 * s)
    body_bone.parent = root_bone

    # 腿骨骼：在腿根部位置，向下延伸到地面
    leg_data = [
        ("FrontLeft", 0.40 * s, 0.25 * s),
        ("FrontRight", 0.40 * s, -0.25 * s),
        ("RearLeft", -0.40 * s, 0.25 * s),
        ("RearRight", -0.40 * s, -0.25 * s),
    ]
    leg_bones = {}
    for lname, lx, ly in leg_data:
        leg_bone = edit_bones.new(lname)
        leg_bone.head = (lx, ly, cz + 0.30 * s)
        leg_bone.tail = (lx, ly, cz + 0.02 * s)
        leg_bone.parent = body_bone
        leg_bones[lname] = leg_bone

    bpy.ops.object.mode_set(mode='POSE')
    poses = armature_obj.pose.bones

    # ---- 父级牛部件到骨骼 ----
    bpy.ops.object.mode_set(mode='OBJECT')

    # 身体部件绑定到 Body 骨骼
    body_part_names = [
        'Body', 'Chest', 'Shoulder', 'Hip', 'Belly', 'Neck',
        'Head', 'Forehead', 'Snout', 'NosePlate', 'Jaw',
        'Tail', 'TailTuft', 'Udder',
    ]
    for side in [-1, 1]:
        body_part_names.append(f"Eye_{side}")
        body_part_names.append(f"EyeWhite_{side}")
        body_part_names.append(f"Ear_{side}")
        body_part_names.append(f"EarInner_{side}")
        body_part_names.append(f"HornBase_{side}")
        body_part_names.append(f"HornMid_{side}")
        body_part_names.append(f"HornTip_{side}")

    for ti in range(4):
        body_part_names.append(f"Teat_{ti}")

    for obj in bpy.data.objects:
        for pname in body_part_names:
            if obj.name.startswith(pname):
                obj.parent = armature_obj
                obj.parent_type = 'ARMATURE'
                obj.parent_bone = "Body"

    # 腿绑定到对应腿骨骼
    for lname, _, _ in leg_data:
        for obj in bpy.data.objects:
            if (obj.name.startswith(f"LegUpper_{lname}") or
                obj.name.startswith(f"LegLower_{lname}") or
                obj.name.startswith(f"Knee_{lname}") or
                obj.name.startswith(f"Hoof_{lname}") or
                obj.name.startswith(f"Dewclaw_{lname}")):
                obj.parent = armature_obj
                obj.parent_type = 'ARMATURE'
                obj.parent_bone = lname

    bpy.context.view_layer.objects.active = armature_obj

    # ---- 生成走路动画关键帧 ----
    print(f"    Generating realistic walk animation: {total_frames} frames...")

    leg_swing = math.radians(20)    # 腿摆动幅度
    body_bob = 0.03 * s             # 身体浮动
    body_sway = 0.02 * s            # 身体左右摇摆

    def keyframe_leg(pose_bone, angle, frame):
        pose_bone.rotation_mode = 'XYZ'
        pose_bone.rotation_euler = (angle, 0, 0)
        pose_bone.keyframe_insert(data_path='rotation_euler', frame=frame)

    def keyframe_body_loc(pose_bone, z_offset, x_offset, frame):
        pose_bone.location = (x_offset, 0, z_offset)
        pose_bone.keyframe_insert(data_path='location', frame=frame)

    def keyframe_root(pose_bone, z_offset, frame):
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

    # 更自然的步态：使用正弦波，对角线配对
    for frame in range(f0, f0 + f + 1):
        t = (frame - f0) / f  # 0..1
        phase = t * 2 * math.pi

        # 对角线步态：左前+右后 同相，右前+左后 反相
        fl_angle = leg_swing * math.sin(phase)
        rr_angle = leg_swing * math.sin(phase)
        fr_angle = leg_swing * math.sin(phase + math.pi)
        rl_angle = leg_swing * math.sin(phase + math.pi)

        keyframe_leg(fl_pose, fl_angle, frame)
        keyframe_leg(rr_pose, rr_angle, frame)
        keyframe_leg(fr_pose, fr_angle, frame)
        keyframe_leg(rl_pose, rl_angle, frame)

        # 身体上下浮动（每一步落地时身体最低）
        bob = body_bob * (1.0 - abs(math.sin(phase)))
        # 身体左右摇摆（体重转移到支撑腿）
        sway = body_sway * math.sin(phase)
        keyframe_body_loc(body_pose, bob, sway, frame)

        # 根骨骼轻微上下（整体节奏）
        root_bob = 0.01 * s * (1.0 - abs(math.sin(phase)))
        keyframe_root(root_pose, root_bob, frame)

    # 设置 CUBIC 插值（平滑）
    action = armature_obj.animation_data.action
    if action:
        for fcurve in action.fcurves:
            for point in fcurve.keyframe_points:
                point.interpolation = 'CUBIC'

    # 设置动画循环
    scene = bpy.context.scene
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

    # 主光
    bpy.ops.object.light_add(type='SUN', location=(4, 3, 6))
    sun = bpy.context.active_object
    sun.data.energy = 1.8
    sun.rotation_euler = (math.radians(50), math.radians(15), math.radians(25))

    # 补光
    bpy.ops.object.light_add(type='AREA', location=(3, -4, 4))
    area = bpy.context.active_object
    area.data.energy = 250
    area.data.size = 5

    # 背光
    bpy.ops.object.light_add(type='AREA', location=(-3, 2, 3))
    rim = bpy.context.active_object
    rim.data.energy = 100
    rim.data.size = 4


def export_glb(output_path, export_animations):
    if not output_path:
        output_path = "//realistic_cow.glb"
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
        export_all_influences=True,
        export_vertex_groups=True,
    )
    print(f"\n✅ Exported to: {output_path}")


# ============================================================
# 主入口
# ============================================================

if __name__ == "__main__":
    parse_args()

    print("=" * 50)
    print("🐄 写实风格牛建模开始")
    print(f"    Scale: {params['scale']}")
    print(f"    Subdivision: {params['subdivision']}")
    print(f"    Animation: {params['animation_enabled']}")
    print("=" * 50)

    clean_scene()

    # 构建牛身体
    body_parts = build_cow(params)

    # 骨骼动画
    armature_obj = None
    if params['animation_enabled']:
        armature_obj = build_walk_animation(params, body_parts)

    setup_scene()

    output = params.get('output_path', '//realistic_cow.glb')
    export_glb(output, export_animations=params['animation_enabled'])

    parts_count = len(body_parts)
    print(f"\n{'=' * 50}")
    print(f"🎉 写实风格牛建模完成！")
    print(f"   总部件数: {parts_count}")
    print(f"   骨骼动画: {'✅ 已导出' if params['animation_enabled'] else '❌ 未启用'}")
    print(f"   细分级别: {params['subdivision']}")
    print(f"   输出文件: {output}")
    print(f"{'=' * 50}")