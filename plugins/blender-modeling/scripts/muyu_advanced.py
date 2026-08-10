"""
AI 3D Modeling - 真实木鱼 + 敲击动画
==============================================
用途：生成高保真木鱼 3D 模型，附木鱼槌敲击骨骼动画
特点：
  - 程序化木纹贴图（512x512，嵌入 GLB）
  - 缩扁椭球主体 + 鱼嘴窄缝 + 内腔
  - 鱼鳞浅浮雕（多圈分布，避开开口/尾部）
  - 双瓣鱼尾上翘
  - 木鱼槌：骨架构建 + 敲击→弹性回弹 GLTF 动画
  - 圆形底座 + 金属铆钉装饰
  - 三处敲击接触点微凹
  - 导出时包含完整 GLTF 动画

输出：GLB 格式（带木纹 + 骨骼动画）

用法：
  blender --background --python muyu_advanced.py -- --output output.glb

AI 可修改参数：见 params 字典
"""

import bpy
import bmesh
import sys
import os
import json
import math
import struct
import zlib
from mathutils import Vector, Euler, Quaternion


# ============================================================
# 参数配置（含 params_schema 用于客户端验证）
# ============================================================
params_schema = {
    "type": "object",
    "properties": {
        "body_radius": {"type": "number", "minimum": 0.1, "maximum": 5, "description": "主体半径"},
        "body_flatten": {"type": "number", "minimum": 0.5, "maximum": 1.0, "description": "垂直方向压扁比例（越小越扁）"},
        "wood_color": {"type": "string", "description": "木色基调（hex），默认 #8B5A2B"},
        "scale_rings": {"type": "integer", "minimum": 1, "maximum": 10, "description": "鱼鳞圈数"},
        "scale_per_ring": {"type": "integer", "minimum": 4, "maximum": 24, "description": "每圈鳞片数"},
        "tail_enabled": {"type": "boolean", "description": "是否生成鱼尾"},
        "mallet_enabled": {"type": "boolean", "description": "是否生成木鱼槌"},
        "animation_enabled": {"type": "boolean", "description": "是否导出敲击动画"},
        "base_enabled": {"type": "boolean", "description": "是否生成底座"},
    },
    "additionalProperties": True,
}

params = {
    # ---- 主体尺寸 ----
    "body_radius": 0.6,
    "body_flatten": 0.82,
    "body_width_stretch": 1.08,
    "wood_color": "#8B5A2B",

    # ---- 鱼嘴开口 ----
    "mouth_x": 0.25,
    "mouth_slit_width": 0.20,
    "mouth_slit_length": 0.50,

    # ---- 鱼鳞 ----
    "scale_rings": 5,
    "scale_per_ring": 14,
    "scale_size": 0.032,

    # ---- 鱼尾 ----
    "tail_enabled": True,
    "tail_size": 0.16,
    "tail_lift": 0.08,

    # ---- 木鱼槌 ----
    "mallet_enabled": True,
    "mallet_handle_length": 0.55,
    "mallet_handle_radius": 0.022,
    "mallet_head_radius": 0.055,

    # ---- 敲击动画 ----
    "animation_enabled": True,
    "animation_duration": 1.5,
    "animation_fps": 30,

    # ---- 底座 ----
    "base_enabled": True,
    "base_radius": 0.55,
    "base_height": 0.05,

    # ---- 木纹纹理 ----
    "wood_texture_size": 512,
    "wood_texture_seed": 42,

    # ---- 渲染 ----
    "subdivision_levels": 1,
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


def hex_to_tuple(hex_str):
    """将 #RRGGBB 转为 (R, G, B, 1.0)"""
    h = hex_str.lstrip('#')
    if len(h) == 6:
        return (
            int(h[0:2], 16) / 255.0,
            int(h[2:4], 16) / 255.0,
            int(h[4:6], 16) / 255.0,
            1.0,
        )
    return (0.55, 0.35, 0.15, 1.0)


# ============================================================
# 程序化木纹贴图（512x512 PNG，嵌入 GLB）
# ============================================================

def _simple_hash(x, y, seed):
    h = seed + x * 374761393 + y * 668265263
    h = (h ^ (h >> 13)) * 1274126177
    return (h ^ (h >> 16)) & 0xffffffff


def _smooth_noise(x, y, seed):
    ix, iy = int(math.floor(x)), int(math.floor(y))
    fx, fy = x - ix, y - iy
    sx = fx * fx * (3 - 2 * fx)
    sy = fy * fy * (3 - 2 * fy)
    v00 = _simple_hash(ix, iy, seed) / 0xffffffff
    v10 = _simple_hash(ix + 1, iy, seed) / 0xffffffff
    v01 = _simple_hash(ix, iy + 1, seed) / 0xffffffff
    v11 = _simple_hash(ix + 1, iy + 1, seed) / 0xffffffff
    return v00 + (v10 - v00) * sx + (v01 - v00) * sy + (v11 - v10 - v01 + v00) * sx * sy


def _fbm(x, y, seed, octaves=3):
    val = 0.0
    amp = 0.5
    freq = 1.0
    for _ in range(octaves):
        val += amp * _smooth_noise(x * freq, y * freq, seed)
        amp *= 0.5
        freq *= 2.0
        seed += 12345
    return val


def generate_wood_texture(size=512, seed=42, base_color=(0.55, 0.35, 0.15)):
    """生成木纹贴图 RGBA 像素数据

    木纹逻辑：
    - 横向条纹模拟年轮，带正弦扰动
    - FBM 噪声添加细节
    - 中心敲击包浆暗化
    - 边缘渐深模拟使用痕迹
    """
    pixels = bytearray()
    bx, by, bz = base_color

    for py in range(size):
        for px in range(size):
            u = px / size
            v = py / size

            # 年轮条纹：沿 Y 方向
            warp = 0.18 * math.sin(u * math.pi * 4 + v * 2.5) \
                 + 0.10 * math.sin(u * math.pi * 9 + v * 4.0) \
                 + 0.05 * math.sin(u * math.pi * 16 + v * 7.0)
            grain = (v + warp) * 20.0
            band = 0.55 + 0.45 * math.sin(grain * math.pi)

            # 噪声细节
            noise = _fbm(u * 25, v * 25, seed, octaves=4) * 0.10
            noise2 = _fbm(u * 60, v * 60, seed + 777, octaves=2) * 0.04

            # 中心敲击包浆（暗化）
            center_dist = math.sqrt((u - 0.5) ** 2 + (v - 0.45) ** 2)
            center_dark = 0.0 if center_dist > 0.35 else (0.35 - center_dist) * 0.12

            # 边缘渐深
            edge_dist = min(u, 1 - u, v, 1 - v)
            edge_dark = 0.0 if edge_dist > 0.15 else (0.15 - edge_dist) * 0.08

            val = max(0.0, min(1.0, band * 0.80 + noise + noise2 + 0.20 - center_dark - edge_dark))

            r = int(max(0, min(255, (bx * 0.6 + bx * 0.4 * val) * 255)))
            g = int(max(0, min(255, (by * 0.6 + by * 0.4 * val) * 255)))
            b = int(max(0, min(255, (bz * 0.6 + bz * 0.4 * val) * 255)))

            pixels.extend([r, g, b, 255])

    return bytes(pixels)


def make_wood_material_from_pixels(name, pixels, width, height, tint=(1.0, 1.0, 1.0, 1.0)):
    """从像素数据创建带木纹纹理的材质（PNG → Image → Node）"""
    def _png_chunk(ctype, data):
        chunk = ctype + data
        crc = struct.pack('>I', zlib.crc32(chunk) & 0xffffffff)
        return struct.pack('>I', len(data)) + chunk + crc

    raw = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    raw += _png_chunk(b'IHDR', ihdr)
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00' + bytes(pixels[y * width * 4:(y + 1) * width * 4])
    raw += _png_chunk(b'IDAT', zlib.compress(raw_data))
    raw += _png_chunk(b'IEND', b'')

    out_dir = os.path.dirname(params.get('output_path', '//muyu_advanced.glb'))
    if not out_dir or out_dir == '//':
        out_dir = '.'
    out_dir = os.path.abspath(out_dir)
    png_path = os.path.join(out_dir, f"{name}.png")
    with open(png_path, 'wb') as f:
        f.write(raw)

    img = bpy.data.images.load(png_path, check_existing=True)
    img.name = f"{name}_tex"

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    for n in nodes:
        nodes.remove(n)

    tex_node = nodes.new(type='ShaderNodeTexImage')
    tex_node.image = img
    tex_node.interpolation = 'Linear'
    tex_node.projection = 'FLAT'

    principled = nodes.new(type='ShaderNodeBsdfPrincipled')
    principled.inputs['Roughness'].default_value = 0.35
    principled.inputs['Specular IOR Level'].default_value = 0.5

    output = nodes.new(type='ShaderNodeOutputMaterial')
    mat.node_tree.links.new(tex_node.outputs['Color'], principled.inputs['Base Color'])
    mat.node_tree.links.new(principled.outputs['BSDF'], output.inputs['Surface'])

    mat.diffuse_color = tint
    return mat


def make_plain_material(name, color, roughness=0.5):
    """纯色 Principled 材质"""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    for n in nodes:
        nodes.remove(n)
    principled = nodes.new(type='ShaderNodeBsdfPrincipled')
    principled.inputs['Base Color'].default_value = color
    principled.inputs['Roughness'].default_value = roughness
    output = nodes.new(type='ShaderNodeOutputMaterial')
    mat.node_tree.links.new(principled.outputs['BSDF'], output.inputs['Surface'])
    mat.diffuse_color = color
    return mat


# ============================================================
# 几何工具
# ============================================================

def create_sphere(radius, location, name="mesh", subdivisions=1):
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=radius, location=location, segments=20, ring_count=14)
    obj = bpy.context.active_object
    obj.name = name
    if subdivisions > 0:
        mod = obj.modifiers.new(name="Subdivision", type='SUBSURF')
        mod.levels = subdivisions
        mod.render_levels = subdivisions
        mod.quality = 3
    return obj


def create_cylinder(radius, depth, location, name="mesh", subdivisions=1, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, location=location, vertices=vertices)
    obj = bpy.context.active_object
    obj.name = name
    if subdivisions > 0:
        mod = obj.modifiers.new(name="Subdivision", type='SUBSURF')
        mod.levels = subdivisions
        mod.render_levels = subdivisions
        mod.quality = 3
    return obj


def assign_material(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def orient_along(obj, direction):
    d = direction.normalized()
    if d.length < 1e-6:
        return
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = d.to_track_quat('Z', 'Y')


def remove_slit(obj, axis, center_x, slit_width, slit_length, local_scale=1.0):
    """在球体前端开鱼嘴窄缝"""
    idx = 'xyz'.index(axis)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    remove = []
    for f in bm.faces:
        verts_local = [v.co for v in f.verts]
        if not all(v[idx] > center_x for v in verts_local):
            continue
        if not all(abs(v.y) < slit_width * 0.5 * local_scale for v in verts_local):
            continue
        if not all(v.z > -slit_length * 0.15 * local_scale for v in verts_local):
            continue
        remove.append(f)
    bmesh.ops.delete(bm, geom=remove, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()


# ============================================================
# 木鱼主体构建
# ============================================================

def build_muyu_body(p):
    """构建木鱼主体（主体 + 开口 + 内腔 + 鳞片 + 鱼尾 + 底座）"""
    print("  Building 木鱼 body...")

    r = p['body_radius']
    flatten = p['body_flatten']
    stretch = p['body_width_stretch']
    body_mat = p['body_mat']

    base_h = p['base_height'] if p['base_enabled'] else 0.0
    body_center_z = base_h + r * flatten

    # ---- 底座 ----
    base_obj = None
    if p['base_enabled']:
        print("    Creating base...")
        base_mat = make_plain_material("BaseMat", (0.35, 0.20, 0.08, 1.0), roughness=0.6)
        base = create_cylinder(
            radius=p['base_radius'], depth=p['base_height'],
            location=(0, 0, p['base_height'] / 2), name="Base", subdivisions=0)
        assign_material(base, base_mat)

        # 底座金属铆钉装饰
        for i in range(6):
            angle = 2 * math.pi * i / 6
            rx = p['base_radius'] * 0.92 * math.cos(angle)
            ry = p['base_radius'] * 0.92 * math.sin(angle)
            rivet = create_sphere(
                radius=0.02, location=(rx, ry, p['base_height'] + 0.005),
                name=f"Rivet_{i}", subdivisions=0)
            rivet_mat = make_plain_material("RivetMat", (0.55, 0.42, 0.18, 1.0), roughness=0.2)
            assign_material(rivet, rivet_mat)
        base_obj = base

    # ---- 主体（缩扁椭球）----
    print("    Creating body sphere...")
    body = create_sphere(
        radius=r, location=(0, 0, body_center_z),
        name="Muyu_Body", subdivisions=p['subdivision_levels'])
    body.scale = (stretch, 1.0, flatten)
    assign_material(body, body_mat)

    # ---- 鱼嘴窄缝 ----
    print("    Cutting mouth slit...")
    remove_slit(body, 'x', p['mouth_x'], p['mouth_slit_width'], p['mouth_slit_length'],
                local_scale=min(stretch, flatten))

    # ---- 内腔（暗示空腔的暗色小体）----
    print("    Creating cavity...")
    cavity_mat = make_plain_material("CavityMat", (0.15, 0.06, 0.02, 1.0), roughness=0.9)
    cavity = create_sphere(
        radius=r * 0.32,
        location=(r * 0.18, 0, body_center_z),
        name="Cavity", subdivisions=0)
    cavity.scale = (stretch * 0.30, p['mouth_slit_width'] * 0.45, p['mouth_slit_length'] * 0.50)
    # 只保留朝开口方向的面
    bm = bmesh.new()
    bm.from_mesh(cavity.data)
    to_remove = [f for f in bm.faces if all(v.co.x < 0 for v in f.verts)]
    bmesh.ops.delete(bm, geom=to_remove, context='FACES')
    bm.to_mesh(cavity.data)
    bm.free()
    assign_material(cavity, cavity_mat)

    # ---- 鱼鳞（浅浮雕）----
    print(f"    Creating scales ({p['scale_rings']} rings x {p['scale_per_ring']} per ring)...")
    scale_mat = make_plain_material("ScaleMat", (0.55, 0.35, 0.15, 1.0), roughness=0.4)

    for ring in range(1, p['scale_rings'] + 1):
        theta = math.radians(15 + ring * 14)
        sin_t, cos_t = math.sin(theta), math.cos(theta)
        count = p['scale_per_ring']
        for k in range(count):
            phi = 2 * math.pi * k / count
            lx = r * sin_t * math.cos(phi)
            ly = r * sin_t * math.sin(phi)
            lz = r * cos_t
            wx = lx * stretch
            wy = ly
            wz = lz * flatten + body_center_z

            # 跳过开口区（前端）
            if wx > r * stretch * 0.40:
                continue
            # 跳过后端尾区
            if wx < -r * stretch * 0.75:
                continue

            normal = Vector((lx / stretch, ly, lz / flatten)).normalized()
            s = create_sphere(
                radius=p['scale_size'],
                location=(wx, wy, wz),
                name=f"Scale_{ring}_{k}", subdivisions=0)
            s.scale = (1.1, 1.1, 0.10)
            orient_along(s, normal)
            assign_material(s, scale_mat)

    # ---- 鱼尾（双瓣上翘）----
    tail_obj = None
    if p['tail_enabled']:
        print("    Creating tail...")
        tail_mat = make_plain_material("TailMat", (0.48, 0.30, 0.12, 1.0), roughness=0.4)
        tail_x = -r * stretch - 0.02

        for side in [-1, 1]:
            tail = create_sphere(
                radius=p['tail_size'],
                location=(tail_x, side * 0.06, body_center_z + p['tail_lift']),
                name=f"Tail_{side}", subdivisions=0)
            tail.scale = (0.55, 0.45, 0.35)
            tail.rotation_euler = (0.1, math.radians(side * 30), 0)
            assign_material(tail, tail_mat)
        tail_obj = tail

    # ---- 敲击接触点微凹（用小球体做视觉提示）----
    print("    Adding knock indent markers...")
    indent_mat = make_plain_material("IndentMat", (0.30, 0.18, 0.05, 1.0), roughness=0.8)
    indent_positions = [
        (r * stretch * 0.60, 0, body_center_z + r * flatten * 0.20),
        (r * stretch * 0.65, 0, body_center_z - r * flatten * 0.10),
    ]
    for i, pos in enumerate(indent_positions):
        indent = create_sphere(
            radius=0.015, location=pos, name=f"Indent_{i}", subdivisions=0)
        assign_material(indent, indent_mat)

    # ---- 收集所有部件 ----
    parts = []
    if base_obj:
        parts.append(base_obj)
    parts.append(body)
    parts.append(cavity)
    if tail_obj:
        parts.append(tail_obj)
    # 鱼鳞、铆钉、凹点是独立对象，bpy.data.objects 中已存在
    for obj in bpy.data.objects:
        if obj.name.startswith('Scale_') or obj.name.startswith('Rivet_') or obj.name.startswith('Indent_'):
            parts.append(obj)

    print(f"    Total body parts: {len(parts)}")
    return parts


# ============================================================
# 木鱼槌 + 骨骼动画
# ============================================================

def build_mallet_with_animation(p, body_center_z):
    """构建木鱼槌并添加敲击骨骼动画

    动画设计：
    - 木鱼槌初始位置：在木鱼右上方
    - 敲击动作：向下摆动锤击木鱼顶部 → 弹性回弹 → 回到初始
    - 使用骨骼（Armature）驱动，导出 GLTF 动画
    """
    if not p['mallet_enabled']:
        return None, None

    print("  Building mallet with armature animation...")

    # ---- 木鱼槌几何 ----
    mallet_mat = make_plain_material("MalletMat", (0.55, 0.35, 0.15, 1.0), roughness=0.4)

    handle_length = p['mallet_handle_length']
    handle_radius = p['mallet_handle_radius']
    head_radius = p['mallet_head_radius']

    # 木鱼槌初始位置：木鱼右上方，槌头朝向木鱼中心
    mallet_pivot_x = 0.85
    mallet_pivot_z = body_center_z + handle_length * 0.5 + 0.05
    mallet_pivot_y = 0.0

    # 手柄（圆柱）
    handle = create_cylinder(
        radius=handle_radius,
        depth=handle_length,
        location=(mallet_pivot_x, mallet_pivot_y, mallet_pivot_z - handle_length * 0.45),
        name="Mallet_Handle", subdivisions=0)
    assign_material(handle, mallet_mat)

    # 槌头（球体）
    head_z = mallet_pivot_z + handle_length * 0.1 - head_radius * 0.5
    head = create_sphere(
        radius=head_radius,
        location=(mallet_pivot_x, mallet_pivot_y, head_z),
        name="Mallet_Head", subdivisions=1)
    assign_material(head, mallet_mat)

    # 槌头红色绒布（装饰）
    cloth_mat = make_plain_material("ClothMat", (0.75, 0.10, 0.08, 1.0), roughness=0.8)
    cloth = create_sphere(
        radius=head_radius * 0.55,
        location=(mallet_pivot_x + head_radius * 0.15, mallet_pivot_y, head_z),
        name="Mallet_Cloth", subdivisions=0)
    assign_material(cloth, cloth_mat)

    # ---- 骨骼系统 ----
    print("    Creating armature...")
    armature = bpy.data.armatures.new("Mallet_Armature")
    armature_obj = bpy.data.objects.new("Mallet_Armature", armature)
    bpy.context.collection.objects.link(armature_obj)
    bpy.context.view_layer.objects.active = armature_obj

    bpy.ops.object.mode_set(mode='EDIT')
    edit_bones = armature.edit_bones

    # 根部骨骼（位于木鱼槌手柄末端，作为旋转支点）
    root_bone = edit_bones.new("Mallet_Root")
    root_bone.head = (mallet_pivot_x, 0, mallet_pivot_z)
    root_bone.tail = (mallet_pivot_x, 0, mallet_pivot_z + 0.2)
    root_bone.use_connect = False

    # 槌身骨骼
    shaft_bone = edit_bones.new("Mallet_Shaft")
    shaft_bone.head = (mallet_pivot_x, 0, mallet_pivot_z - 0.2)
    shaft_bone.tail = (mallet_pivot_x, 0, mallet_pivot_z - 0.6)
    shaft_bone.use_connect = True

    bpy.ops.object.mode_set(mode='POSE')

    # ---- 将木鱼槌对象父级到骨骼 ----
    # 在 POSE 模式下，将几何体父级到对应骨骼
    bpy.context.view_layer.objects.active = armature_obj

    # 先切到 object 模式做 parent 设置
    bpy.ops.object.mode_set(mode='OBJECT')

    # 父级到骨骼：使用 armature 父级
    for mesh_obj in [handle, head, cloth]:
        mesh_obj.parent = armature_obj
        mesh_obj.parent_type = 'ARMATURE'
        mesh_obj.parent_bone = "Mallet_Shaft"

    bpy.context.view_layer.objects.active = armature_obj

    # ---- 生成敲击动画 ----
    print("    Generating knock animation...")
    fps = p['animation_fps']
    duration = p['animation_duration']
    total_frames = int(duration * fps)

    # 动画时间线（4 阶段）：
    # 阶段 1（0-20%）：预备——槌子向上抬起
    # 阶段 2（20-50%）：快速下摆敲击
    # 阶段 3（50-60%）：接触瞬间微停
    # 阶段 4（60-85%）：弹性回弹（带过冲）
    # 阶段 5（85-100%）：稳定回位

    # 旋转角度定义（绕 X 轴，单位：弧度）
    # 初始角度：槌头大致指向木鱼
    base_angle = math.radians(75)
    lift_angle = math.radians(120)    # 预备抬起
    knock_angle = math.radians(35)    # 敲击最低点
    bounce_angle = math.radians(50)   # 弹性回弹

    # 关键帧数据
    poses = armature_obj.pose.bones

    root_pose = poses["Mallet_Root"]
    shaft_pose = poses["Mallet_Shaft"]

    def keyframe_root(frame, angle):
        root_pose.rotation_mode = 'XYZ'
        root_pose.rotation_euler = (angle, 0, 0)
        root_pose.keyframe_insert(data_path='rotation_euler', frame=frame, index=0)

    def keyframe_shaft(frame, angle):
        shaft_pose.rotation_mode = 'XYZ'
        shaft_pose.rotation_euler = (angle, 0, 0)
        shaft_pose.keyframe_insert(data_path='rotation_euler', frame=frame, index=0)

    f = total_frames
    f0 = 1
    f_lift = int(f * 0.20)
    f_knock = int(f * 0.50)
    f_hold = int(f * 0.60)
    f_bounce = int(f * 0.85)
    f_end = f

    # 阶段 1：预备
    keyframe_root(f0, 0.0)
    keyframe_root(f_lift, lift_angle - base_angle)
    keyframe_shaft(f0, 0.0)
    keyframe_shaft(f_lift, lift_angle - base_angle)

    # 阶段 2：快速下摆
    keyframe_root(f_knock, knock_angle - base_angle)
    keyframe_shaft(f_knock, knock_angle - base_angle)

    # 阶段 3：接触停留
    keyframe_root(f_hold, knock_angle - base_angle)
    keyframe_shaft(f_hold, knock_angle - base_angle)

    # 阶段 4：弹性回弹
    keyframe_root(f_bounce, bounce_angle - base_angle)
    keyframe_shaft(f_bounce, bounce_angle - base_angle)

    # 阶段 5：稳定
    keyframe_root(f_end, 0.0)
    keyframe_shaft(f_end, 0.0)

    # 设置插值曲线为 ease-in-out
    scene = bpy.context.scene
    action = armature_obj.animation_data.action
    if action:
        for fcurves in action.fcurves:
            for point in fcurves.keyframe_points:
                point.interpolation = 'CUBIC'

    # 设置动画帧率
    scene.render.fps = fps
    scene.frame_start = f0
    scene.frame_end = f_end

    print(f"    Animation: {total_frames} frames, {duration}s at {fps}fps")
    return armature_obj, [handle, head, cloth]


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
    bpy.ops.object.light_add(type='SUN', location=(5, 3, 10))
    sun = bpy.context.active_object
    sun.data.energy = 1.2

    # 环境光
    bpy.ops.object.light_add(type='AREA', location=(5, -5, 8))
    area = bpy.context.active_object
    area.data.energy = 200


def export_glb(output_path, export_animations):
    if not output_path:
        output_path = "//muyu_advanced.glb"
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

    clean_scene()

    # 生成木纹
    tex_size = params['wood_texture_size']
    tex_seed = params['wood_texture_seed']
    print("  Generating wood texture...")
    wood_color = hex_to_tuple(params.get('wood_color', '#8B5A2B'))
    wood_pixels = generate_wood_texture(size=tex_size, seed=tex_seed, base_color=wood_color)
    print(f"    Done: {tex_size}x{tex_size}, {len(wood_pixels)} bytes")

    # 创建材质
    body_mat = make_wood_material_from_pixels(
        "BodyMat", wood_pixels, tex_size, tex_size,
        tint=wood_color)

    # 构建木鱼主体
    body_parts = build_muyu_body({
        **params,
        'body_mat': body_mat,
    })

    # 构建木鱼槌 + 动画
    armature_obj = None
    if params['animation_enabled'] and params['mallet_enabled']:
        base_h = params['base_height'] if params['base_enabled'] else 0.0
        body_center_z = base_h + params['body_radius'] * params['body_flatten']
        armature_obj, mallet_parts = build_mallet_with_animation(params, body_center_z)
        if mallet_parts:
            body_parts.extend(mallet_parts)
    elif params['mallet_enabled']:
        base_h = params['base_height'] if params['base_enabled'] else 0.0
        body_center_z = base_h + params['body_radius'] * params['body_flatten']
        _, mallet_parts = build_mallet_with_animation({
            **params,
            'animation_enabled': False,
        }, body_center_z)

    setup_scene()

    output = params.get('output_path', '//muyu_advanced.glb')
    export_glb(output, export_animations=params['animation_enabled'])

    parts_count = len(body_parts)
    print(f"\n🎉 真实木鱼建模完成！")
    print(f"   总部件数: {parts_count}")
    print(f"   骨骼动画: {'✅ 已导出' if params['animation_enabled'] else '❌ 未启用'}")
    print(f"   输出文件: {output}")