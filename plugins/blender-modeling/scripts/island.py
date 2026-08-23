"""
AI 3D Modeling - 海岛（Island）建模脚本
===========================================
用途：生成完整的 3D 海岛模型，包含地形、沙滩、植被、岩石等
特点：
  - 程序化地形（FBM 噪声驱动高度图）
  - 沙滩渐变色带
  - 棕榈树（树干 + 树冠叶片）
  - 灌木丛
  - 礁石
  - 环礁湖水面（半透明）
  - 低多边形风格，导出体积小

输出：GLB 格式

用法：
  blender --background --python island.py -- --output output.glb

AI 可修改参数：见 params 字典
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
# 参数配置（含 params_schema 用于客户端验证）
# ============================================================
params_schema = {
    "type": "object",
    "properties": {
        "island_radius": {"type": "number", "minimum": 1.0, "maximum": 20.0, "description": "海岛半径"},
        "height_scale": {"type": "number", "minimum": 0.1, "maximum": 5.0, "description": "地形高度幅度"},
        "sand_color": {"type": "string", "description": "沙滩颜色（hex），默认 #F5DEB3"},
        "grass_color": {"type": "string", "description": "草地颜色（hex），默认 #5A8F3E"},
        "rock_color": {"type": "string", "description": "岩石颜色（hex），默认 #6B6B6B"},
        "palm_trees": {"type": "integer", "minimum": 0, "maximum": 30, "description": "棕榈树数量"},
        "bushes": {"type": "integer", "minimum": 0, "maximum": 50, "description": "灌木数量"},
        "rocks": {"type": "integer", "minimum": 0, "maximum": 30, "description": "礁石数量"},
        "lagoon_enabled": {"type": "boolean", "description": "是否生成环礁湖水面"},
        "seed": {"type": "integer", "minimum": 0, "maximum": 99999, "description": "随机种子"},
    },
    "additionalProperties": True,
}

params = {
    # ---- 地形 ----
    "island_radius": 4.0,
    "height_scale": 1.2,
    "terrain_octaves": 5,
    "terrain_roughness": 0.5,

    # ---- 颜色 ----
    "sand_color": "#F5DEB3",
    "grass_color": "#5A8F3E",
    "rock_color": "#6B6B6B",
    "water_color": "#3A8FC4",
    "trunk_color": "#6B4226",
    "leaf_color": "#2D7D2D",

    # ---- 植被 ----
    "palm_trees": 6,
    "bushes": 12,
    "rocks": 8,

    # ---- 水面 ----
    "lagoon_enabled": True,
    "water_radius": 5.5,
    "water_alpha": 0.6,

    # ---- 细分 ----
    "terrain_resolution": 64,
    "subdivision_levels": 1,

    # ---- 渲染 ----
    "seed": 42,
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
    for block in bpy.data.images:
        bpy.data.images.remove(block)
    for block in bpy.data.actions:
        bpy.data.actions.remove(block)


def hex_to_tuple(hex_str, alpha=1.0):
    """将 #RRGGBB 转为 (R, G, B, A)"""
    h = hex_str.lstrip('#')
    if len(h) == 6:
        return (
            int(h[0:2], 16) / 255.0,
            int(h[2:4], 16) / 255.0,
            int(h[4:6], 16) / 255.0,
            alpha,
        )
    return (0.6, 0.6, 0.6, alpha)


def make_plain_material(name, color, roughness=0.5, specular=0.5, alpha=1.0):
    """纯色 Principled 材质"""
    c = list(color)
    if len(c) == 3:
        c.append(alpha)
    elif len(c) == 4:
        c[3] = alpha
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
    if alpha < 1.0:
        mat.blend_method = 'BLEND'
    mat.diffuse_color = tuple(c)
    return mat


# ============================================================
# 噪声函数（FBM）
# ============================================================

def _hash(x, y, seed):
    h = seed + x * 374761393 + y * 668265263
    h = (h ^ (h >> 13)) * 1274126177
    return (h ^ (h >> 16)) & 0xffffffff


def _smooth_noise(x, y, seed):
    ix, iy = int(math.floor(x)), int(math.floor(y))
    fx, fy = x - ix, y - iy
    sx = fx * fx * (3 - 2 * fx)
    sy = fy * fy * (3 - 2 * fy)
    v00 = _hash(ix, iy, seed) / 0xffffffff
    v10 = _hash(ix + 1, iy, seed) / 0xffffffff
    v01 = _hash(ix, iy + 1, seed) / 0xffffffff
    v11 = _hash(ix + 1, iy + 1, seed) / 0xffffffff
    return v00 + (v10 - v00) * sx + (v01 - v00) * sy + (v11 - v10 - v01 + v00) * sx * sy


def _fbm(x, y, seed, octaves=5, lacunarity=2.0, gain=0.5):
    val = 0.0
    amp = 1.0
    freq = 1.0
    max_val = 0.0
    for _ in range(octaves):
        val += amp * _smooth_noise(x * freq, y * freq, seed)
        max_val += amp
        amp *= gain
        freq *= lacunarity
        seed += 12345
    return val / max_val


def height_at(x, y, p):
    """采样地形高度"""
    r = p['island_radius']
    dist = math.sqrt(x * x + y * y)
    if dist >= r:
        return -0.05  # 水下

    # 中心到边缘的衰减
    falloff = 1.0 - (dist / r) ** 1.5
    if falloff < 0:
        falloff = 0.0

    # FBM 噪声地形
    noise_scale = 1.8
    h = _fbm(x * noise_scale / r, y * noise_scale / r, p['seed'],
             octaves=p['terrain_octaves'], gain=p['terrain_roughness'])

    # 地形高度 = 噪声 * 衰减 * 高度缩放
    height = h * falloff * p['height_scale']

    # 沙滩：边缘平缓
    beach_zone = 0.25  # 边缘 25% 为沙滩过渡区
    beach_threshold = 1.0 - beach_zone
    if falloff < beach_threshold:
        # 越靠近边缘越平坦，形成沙滩
        beach_factor = 1.0 - (beach_threshold - falloff) / beach_zone
        height = height * (1.0 - beach_factor * 0.6) + 0.05 * beach_factor

    return max(height, -0.05)


# ============================================================
# 地形构建
# ============================================================

def build_terrain(p):
    """构建海岛地形网格"""
    print("  Building terrain...")

    res = p['terrain_resolution']
    r = p['island_radius']
    sand_mat = make_plain_material("SandMat", hex_to_tuple(p['sand_color']), roughness=0.8, specular=0.1)
    grass_mat = make_plain_material("GrassMat", hex_to_tuple(p['grass_color']), roughness=0.7, specular=0.2)
    rock_mat = make_plain_material("RockMat", hex_to_tuple(p['rock_color']), roughness=0.9, specular=0.05)

    # 创建网格
    mesh = bpy.data.meshes.new("Island_Terrain")
    obj = bpy.data.objects.new("Island_Terrain", mesh)
    bpy.context.collection.objects.link(obj)

    verts = []
    faces = []
    uv = []

    for iy in range(res + 1):
        for ix in range(res + 1):
            u = ix / res
            v = iy / res
            x = (u - 0.5) * 2 * r * 1.1
            y = (v - 0.5) * 2 * r * 1.1
            z = height_at(x, y, p)
            verts.append((x, y, z))
            uv.append((u, v))

    for iy in range(res):
        for ix in range(res):
            i0 = iy * (res + 1) + ix
            i1 = iy * (res + 1) + ix + 1
            i2 = (iy + 1) * (res + 1) + ix + 1
            i3 = (iy + 1) * (res + 1) + ix
            faces.append((i0, i1, i2, i3))

    mesh.from_pydata(verts, [], faces)
    mesh.update()

    # 计算法线
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))

    # 细分
    if p['subdivision_levels'] > 0:
        mod = obj.modifiers.new(name="Subdivision", type='SUBSURF')
        mod.levels = p['subdivision_levels']
        mod.render_levels = p['subdivision_levels']

    # 根据高度分配材质
    # 由于不能直接对单个面分配不同材质（需要 multi-material），
    # 我们创建一个顶点颜色图层来标记沙滩 vs 草地
    # 然后用两个材质插槽

    # 简化：使用单一材质，但通过顶点颜色来区分
    # 生成 vertex color 表示沙滩/草地过渡
    vert_col = mesh.vertex_colors.new(name="Biome")
    dists = []
    for v in mesh.vertices:
        d = math.sqrt(v.co.x ** 2 + v.co.y ** 2)
        dists.append(d)

    max_dist = max(dists) if dists else 1.0
    for i, loop in enumerate(vert_col.data):
        v_idx = mesh.loops[i].vertex_index
        d = dists[v_idx] / max_dist if max_dist > 0 else 0
        z = mesh.vertices[v_idx].co.z
        # 沙滩因子：靠近边缘且高度低 → 沙滩
        sand_factor = 0.0
        if z < 0.15:
            sand_factor = max(0, 1.0 - d * 2.5)  # 外部边缘
        if z < 0.05:
            sand_factor = max(sand_factor, 1.0 - abs(d - 0.85) * 8)

        # 混合颜色
        sand_col = hex_to_tuple(p['sand_color'])
        grass_col = hex_to_tuple(p['grass_color'])
        r_col = sand_col[0] * sand_factor + grass_col[0] * (1 - sand_factor)
        g_col = sand_col[1] * sand_factor + grass_col[1] * (1 - sand_factor)
        b_col = sand_col[2] * sand_factor + grass_col[2] * (1 - sand_factor)
        loop.color = (r_col, g_col, b_col, 1.0)

    # 替换材质为带顶点颜色的版本
    vcol_mat = make_plain_material("Island_Mat", (0.8, 0.7, 0.5, 1.0), roughness=0.7)
    # 使用 Attribute 节点读取顶点颜色
    vcol_mat.use_nodes = True
    nodes = vcol_mat.node_tree.nodes
    for n in nodes:
        nodes.remove(n)

    attr = nodes.new(type='ShaderNodeVertexColor')
    attr.layer_name = "Biome"

    principled = nodes.new(type='ShaderNodeBsdfPrincipled')
    principled.inputs['Roughness'].default_value = 0.7
    principled.inputs['Specular IOR Level'].default_value = 0.1

    output = nodes.new(type='ShaderNodeOutputMaterial')
    vcol_mat.node_tree.links.new(attr.outputs['Color'], principled.inputs['Base Color'])
    vcol_mat.node_tree.links.new(principled.outputs['BSDF'], output.inputs['Surface'])

    if obj.data.materials:
        obj.data.materials[0] = vcol_mat
    else:
        obj.data.materials.append(vcol_mat)

    # 统计
    above_water = sum(1 for v in mesh.vertices if v.co.z > 0)
    print(f"    Terrain vertices: {len(mesh.vertices)}, above water: {above_water}")

    return obj, sand_mat, grass_mat, rock_mat


# ============================================================
# 棕榈树
# ============================================================

def build_palm_tree(x, y, z, scale, p, seed):
    """构建一棵棕榈树"""
    random.seed(seed)
    parts = []

    trunk_height = scale * (1.2 + random.random() * 0.8)
    trunk_radius = scale * 0.06
    lean_angle = math.radians(random.uniform(-8, 8))

    # 树干（弯曲的圆柱）
    trunk_segments = 8
    for i in range(trunk_segments):
        t = i / trunk_segments
        seg_z = z + t * trunk_height
        seg_x = x + math.sin(t * math.pi * 0.5) * lean_angle * 0.3
        seg_y = y + math.cos(t * math.pi * 0.7) * lean_angle * 0.2
        seg_r = trunk_radius * (1.0 - t * 0.3)

        if i == 0:
            # 树干底部略粗
            seg_r *= 1.3

        bpy.ops.mesh.primitive_cylinder_add(
            radius=seg_r, depth=trunk_height / trunk_segments * 0.9,
            location=(seg_x, seg_y, seg_z + t * trunk_height / trunk_segments),
            vertices=6)
        trunk_seg = bpy.context.active_object
        trunk_seg.name = f"PalmTrunk_{seed}_{i}"
        trunk_seg.rotation_euler = (random.uniform(-0.03, 0.03), random.uniform(-0.03, 0.03), 0)
        trunk_mat = make_plain_material(f"TrunkMat_{seed}", hex_to_tuple(p['trunk_color']), roughness=0.9)
        if trunk_seg.data.materials:
            trunk_seg.data.materials[0] = trunk_mat
        else:
            trunk_seg.data.materials.append(trunk_mat)
        parts.append(trunk_seg)

    # 树冠顶部位置
    crown_x = x + math.sin(math.pi * 0.5) * lean_angle * 0.3
    crown_y = y + math.cos(math.pi * 0.7) * lean_angle * 0.2
    crown_z = z + trunk_height

    # 叶片（6-10 片）
    leaf_count = random.randint(6, 10)
    leaf_mat = make_plain_material(f"LeafMat_{seed}", hex_to_tuple(p['leaf_color']), roughness=0.6, specular=0.3)

    for li in range(leaf_count):
        angle = 2 * math.pi * li / leaf_count + random.uniform(-0.2, 0.2)
        tilt = math.radians(random.uniform(40, 75))
        leaf_len = scale * (0.5 + random.random() * 0.4)
        leaf_width = 0.04

        # 叶片用扁平的椭球体
        leaf_x = crown_x + math.cos(angle) * 0.1
        leaf_y = crown_y + math.sin(angle) * 0.1
        leaf_z = crown_z + 0.05

        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=leaf_width, location=(leaf_x, leaf_y, leaf_z),
            segments=4, ring_count=3)
        leaf = bpy.context.active_object
        leaf.name = f"PalmLeaf_{seed}_{li}"
        leaf.scale = (1.0, 0.3, leaf_len / leaf_width * 0.5)
        leaf.rotation_euler = (math.radians(70 + random.uniform(-10, 10)),
                               angle + random.uniform(-0.2, 0.2),
                               random.uniform(-0.3, 0.3))
        if leaf.data.materials:
            leaf.data.materials[0] = leaf_mat
        else:
            leaf.data.materials.append(leaf_mat)
        parts.append(leaf)

    # 树冠中心（小绿球，填充空隙）
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=scale * 0.12, location=(crown_x, crown_y, crown_z + 0.05),
        segments=8, ring_count=6)
    crown = bpy.context.active_object
    crown.name = f"PalmCrown_{seed}"
    crown.scale = (1.0, 1.0, 0.6)
    crown_mat = make_plain_material(f"CrownMat_{seed}", hex_to_tuple(p['leaf_color']), roughness=0.7)
    if crown.data.materials:
        crown.data.materials[0] = crown_mat
    else:
        crown.data.materials.append(crown_mat)
    parts.append(crown)

    print(f"    Palm tree {seed}: {len(parts)} parts")
    return parts


# ============================================================
# 灌木
# ============================================================

def build_bush(x, y, z, scale, p, seed):
    """构建一个灌木丛"""
    random.seed(seed + 1000)
    parts = []
    bush_mat = make_plain_material(f"BushMat_{seed}", hex_to_tuple(p['grass_color']), roughness=0.7)

    cluster_count = random.randint(3, 6)
    for ci in range(cluster_count):
        offset_x = random.uniform(-scale * 0.2, scale * 0.2)
        offset_y = random.uniform(-scale * 0.2, scale * 0.2)
        offset_z = random.uniform(0, scale * 0.1)
        r = scale * random.uniform(0.08, 0.15)

        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=r, location=(x + offset_x, y + offset_y, z + offset_z),
            segments=6, ring_count=4)
        sphere = bpy.context.active_object
        sphere.name = f"Bush_{seed}_{ci}"
        sphere.scale = (random.uniform(0.8, 1.2), random.uniform(0.8, 1.2), random.uniform(0.6, 0.9))
        if sphere.data.materials:
            sphere.data.materials[0] = bush_mat
        else:
            sphere.data.materials.append(bush_mat)
        parts.append(sphere)

    return parts


# ============================================================
# 礁石
# ============================================================

def build_rock(x, y, z, scale, p, seed):
    """构建一块礁石"""
    random.seed(seed + 2000)
    rock_mat = make_plain_material(f"RockMat_{seed}", hex_to_tuple(p['rock_color']), roughness=0.9, specular=0.05)

    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=scale * 0.15, location=(x, y, z),
        segments=7, ring_count=5)
    rock = bpy.context.active_object
    rock.name = f"Rock_{seed}"
    rock.scale = (
        random.uniform(0.7, 1.3),
        random.uniform(0.7, 1.3),
        random.uniform(0.4, 0.7),
    )
    rock.rotation_euler = (
        random.uniform(-0.3, 0.3),
        random.uniform(-0.3, 0.3),
        random.uniform(0, math.pi),
    )

    # 随机位移（displace）增加表面细节
    disp = rock.modifiers.new(name="Displace", type='DISPLACE')
    disp.strength = scale * 0.03
    disp.mid_level = 0.5

    if rock.data.materials:
        rock.data.materials[0] = rock_mat
    else:
        rock.data.materials.append(rock_mat)

    print(f"    Rock {seed}: placed at ({x:.2f}, {y:.2f}, {z:.2f})")
    return [rock]


# ============================================================
# 环礁湖水面
# ============================================================

def build_lagoon(p):
    """构建半透明环礁湖水面"""
    print("  Building lagoon water...")

    water_mat = make_plain_material(
        "WaterMat", hex_to_tuple(p['water_color']),
        roughness=0.05, specular=0.8, alpha=p['water_alpha'])

    r = p['water_radius']
    bpy.ops.mesh.primitive_circle_add(
        radius=r, location=(0, 0, -0.02), vertices=48,
        fill_type='NGON')
    water = bpy.context.active_object
    water.name = "Lagoon_Water"
    water.scale = (1.0, 1.0, 1.0)

    # 让水面稍微透明
    if water.data.materials:
        water.data.materials[0] = water_mat
    else:
        water.data.materials.append(water_mat)

    # 添加 wave 修饰器
    wave = water.modifiers.new(name="Wave", type='WAVE')
    wave.time_offset = 0.0
    wave.height = 0.02
    wave.width = 0.5
    wave.speed = 0.0  # 静态
    wave.narrowness = 2.0

    # 细分使水面平滑
    subdiv = water.modifiers.new(name="Subdivision", type='SUBSURF')
    subdiv.levels = 2
    subdiv.render_levels = 2

    print(f"    Water radius: {r}")
    return [water]


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
    scene.world.color = (0.85, 0.87, 0.95)

    # 主光（太阳）
    bpy.ops.object.light_add(type='SUN', location=(8, 5, 15))
    sun = bpy.context.active_object
    sun.data.energy = 1.5
    sun.rotation_euler = (math.radians(45), math.radians(20), math.radians(30))

    # 环境光
    bpy.ops.object.light_add(type='AREA', location=(5, -8, 10))
    area = bpy.context.active_object
    area.data.energy = 300
    area.data.size = 5

    # 补光
    bpy.ops.object.light_add(type='AREA', location=(-8, 3, 6))
    fill = bpy.context.active_object
    fill.data.energy = 150
    fill.data.size = 8


def export_glb(output_path):
    if not output_path:
        output_path = "//island.glb"
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
        export_animations=False,
        export_skins=False,
    )
    print(f"\n✅ Exported to: {output_path}")


# ============================================================
# 植被分布
# ============================================================

def distribute_objects(p, count, placer_func, base_seed_offset):
    """在岛上均匀分布对象"""
    random.seed(p['seed'] + base_seed_offset)
    all_parts = []
    r = p['island_radius']
    attempts = 0
    max_attempts = count * 20
    placed = 0
    positions = []

    while placed < count and attempts < max_attempts:
        attempts += 1
        # 随机角度和半径，倾向于中部区域（植被区）
        angle = random.uniform(0, 2 * math.pi)
        # 半径分布：集中在 0.2r ~ 0.7r 之间（中间偏外，但非沙滩）
        radius_factor = 0.2 + random.random() * 0.5
        dist = r * radius_factor

        x = dist * math.cos(angle)
        y = dist * math.sin(angle)
        z = height_at(x, y, p)

        # 只放在水面以上，且不太高（山顶不种树）
        if z < 0.05 or z > p['height_scale'] * 0.7:
            continue

        # 避免太拥挤：检查与其他已放置位置的距离
        too_close = False
        min_dist = r * 0.15
        for px, py in positions:
            if math.sqrt((x - px) ** 2 + (y - py) ** 2) < min_dist:
                too_close = True
                break
        if too_close:
            continue

        positions.append((x, y))
        scale = 0.6 + random.random() * 0.6
        parts = placer_func(x, y, z, scale, p, placed + base_seed_offset)
        all_parts.extend(parts)
        placed += 1

    print(f"    Placed {placed}/{count} objects")
    return all_parts


def distribute_rocks(p, count):
    """在岛边缘和沙滩区域分布礁石"""
    random.seed(p['seed'] + 3000)
    all_parts = []
    r = p['island_radius']
    placed = 0
    attempts = 0
    max_attempts = count * 20

    while placed < count and attempts < max_attempts:
        attempts += 1
        angle = random.uniform(0, 2 * math.pi)
        # 礁石分布在边缘和外部
        radius_factor = 0.7 + random.random() * 0.35
        dist = r * radius_factor

        x = dist * math.cos(angle)
        y = dist * math.sin(angle)
        z = height_at(x, y, p)

        # 在水面附近或略高于水面
        if z < -0.02 or z > 0.3:
            continue

        scale = 0.5 + random.random() * 1.0
        parts = build_rock(x, y, z, scale, p, placed + 3000)
        all_parts.extend(parts)
        placed += 1

    print(f"    Placed {placed}/{count} rocks")
    return all_parts


# ============================================================
# 主入口
# ============================================================

if __name__ == "__main__":
    parse_args()

    print("=" * 50)
    print("🌴 海岛建模开始")
    print(f"    Radius: {params['island_radius']}")
    print(f"    Height: {params['height_scale']}")
    print(f"    Palm trees: {params['palm_trees']}")
    print(f"    Bushes: {params['bushes']}")
    print(f"    Rocks: {params['rocks']}")
    print(f"    Seed: {params['seed']}")
    print("=" * 50)

    clean_scene()

    all_parts = []

    # 1. 地形
    terrain, sand_mat, grass_mat, rock_mat = build_terrain(params)
    all_parts.append(terrain)

    # 2. 棕榈树
    if params['palm_trees'] > 0:
        print("\n  Distributing palm trees...")
        palm_parts = distribute_objects(params, params['palm_trees'], build_palm_tree, 0)
        all_parts.extend(palm_parts)

    # 3. 灌木
    if params['bushes'] > 0:
        print("\n  Distributing bushes...")
        bush_parts = distribute_objects(params, params['bushes'], build_bush, 1000)
        all_parts.extend(bush_parts)

    # 4. 礁石
    if params['rocks'] > 0:
        print("\n  Distributing rocks...")
        rock_parts = distribute_rocks(params, params['rocks'])
        all_parts.extend(rock_parts)

    # 5. 环礁湖水面
    if params['lagoon_enabled']:
        print("\n  Building lagoon...")
        lagoon_parts = build_lagoon(params)
        all_parts.extend(lagoon_parts)

    # 场景设置
    print("\n  Setting up scene...")
    setup_scene()

    # 导出
    output = params.get('output_path', '//island.glb')
    print(f"\n  Exporting to {output}...")
    export_glb(output)

    parts_count = len(all_parts)
    print(f"\n{'=' * 50}")
    print(f"🎉 海岛建模完成！")
    print(f"   总部件数: {parts_count}")
    print(f"   输出文件: {output}")
    print(f"   种子: {params['seed']}")
    print(f"{'=' * 50}")