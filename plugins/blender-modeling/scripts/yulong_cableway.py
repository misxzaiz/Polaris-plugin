# -*- coding: utf-8 -*-
"""
玉龙雪山大索道（Jade Dragon Snow Mountain Cableway）— 第一期：缆车系统
========================================================================
按真实参数建模：3356m 下站 → 4506m 上站，高差 1150m，水平距约 2900m，
单线循环脱挂式 6 人封闭吊厢（Doppelmayr 改建，1200 pph）。

第一期范围：
  - 雪坡地形（纵剖面 + 噪声起伏，按高度带分雪/岩）
  - 双索线（去程/回程，抛物线悬垂）
  - 格构式塔架（4 主柱 + 横腹杆 + 顶部横臂 + 托索轮组 + 爬梯）
  - 蓝色封闭吊厢 × N（吊杆 + 抱索器 + 厢体 + 环窗带 + 滑橇）
  - 下站站房 + 上站嵌岩平台

阶段 2（未实现）：冰川主峰体、蓝月谷、云杉坪林线、植被带、材质 bake。

用法：
  blender --background --python yulong_cableway.py -- --output yulong_cableway.glb [--params '{}']
"""

import bpy
import bmesh
import sys
import os
import json
import math
import random
from mathutils import Vector, Matrix

# ============================================================
# 参数 schema（MCP 自动提取；最后一项无尾逗号）
# ============================================================
params_schema = {
    "type": "object",
    "properties": {
        "line_length": {"type": "number", "minimum": 800, "maximum": 6000, "description": "线路水平长度(m)"},
        "elev_low": {"type": "number", "minimum": 1500, "maximum": 4000, "description": "下站海拔(m)"},
        "elev_high": {"type": "number", "minimum": 3000, "maximum": 5596, "description": "上站海拔(m)"},
        "cabin_count": {"type": "integer", "minimum": 2, "maximum": 40, "description": "场景内可见吊厢数"},
        "tower_count": {"type": "integer", "minimum": 2, "maximum": 12, "description": "中间塔架数"},
        "snow_line_ratio": {"type": "number", "minimum": 0.2, "maximum": 0.9, "description": "雪线位置(0=下站,1=上站)"},
        "terrain_detail": {"type": "integer", "minimum": 2, "maximum": 8, "description": "地形细分倍率"},
        "season": {"type": "string", "enum": ["winter", "summer"], "description": "季节"},
        "seed": {"type": "integer", "description": "随机种子"},
        "white_model": {"type": "boolean", "description": "仅白模"},
        "output_path": {"type": "string", "description": "GLB 输出路径"}
    },
    "additionalProperties": True
}

params = {
    "line_length": 2900.0,
    "elev_low": 3356.0,
    "elev_high": 4506.0,
    "cabin_count": 16,
    "tower_count": 3,
    "snow_line_ratio": 0.45,
    "terrain_detail": 4,
    "season": "winter",
    "seed": 42,
    "white_model": False,
    "output_path": "//yulong_cableway.glb"
}

# ============================================================
# 派生常量
# ============================================================
L = params["line_length"]
Z0 = params["elev_low"]
Z1 = params["elev_high"]
DH = Z1 - Z0
TOWER_N = params["tower_count"]
CABIN_N = params["cabin_count"]
SNOW_RATIO = params["snow_line_ratio"]
SEASON = params["season"]
WHITE = params["white_model"]

TOWER_H = 18.0
GAUGE = 4.6
CABIN_L = 2.6
CABIN_W = 1.8
CABIN_H = 2.0
HANGER_L = 1.6
ROPE_R = 0.055
STATION_L = 36.0
STATION_W = 16.0
STATION_H = 9.0
SAG = 0.022
TERRAIN_PAD = 220.0
TERRAIN_RES = max(24, 24 * params["terrain_detail"])

rng = random.Random(params["seed"])


# ============================================================
# CLI 解析
# ============================================================
def parse_args():
    args = sys.argv
    if '--' not in args:
        return
    idx = args.index('--')
    custom = args[idx + 1:]
    i = 0
    while i < len(custom):
        a = custom[i]
        if a == '--output':
            params['output_path'] = custom[i + 1]
            i += 2
            continue
        if a == '--params':
            try:
                extra = json.loads(custom[i + 1])
                params.update(extra)
            except (json.JSONDecodeError, IndexError):
                print("Warning: could not parse params JSON")
            i += 2
            continue
        i += 1


def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


# ============================================================
# 材质
# ============================================================
def make_principled(name, color, rough=0.35, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bp = mat.node_tree.nodes["Principled BSDF"]
    bp.inputs["Base Color"].default_value = (*color, 1.0)
    bp.inputs["Metallic"].default_value = metallic
    bp.inputs["Roughness"].default_value = rough
    return mat


def make_rock_material(name, base, var):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bp = nt.nodes["Principled BSDF"]
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 0.04
    noise.inputs['Detail'].default_value = 12.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35
    dark = tuple(max(0.0, c * (1 - var)) for c in base)
    light = tuple(min(1.0, c * (1 + var)) for c in base)
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.65
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bp.inputs["Base Color"])
    bp.inputs["Roughness"].default_value = 0.95
    bp.inputs["Metallic"].default_value = 0.0
    return mat


def make_snow_material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bp = mat.node_tree.nodes["Principled BSDF"]
    bp.inputs["Base Color"].default_value = (0.92, 0.94, 0.97, 1.0)
    bp.inputs["Roughness"].default_value = 0.28
    bp.inputs["Metallic"].default_value = 0.0
    try:
        bp.inputs["Subsurface Weight"].default_value = 0.25
        bp.inputs["Subsurface Radius"].default_value = (0.35, 0.42, 0.5)
    except KeyError:
        pass
    return mat


def _flat(rgb):
    m = bpy.data.materials.new("Flat")
    m.use_nodes = True
    bp = m.node_tree.nodes["Principled BSDF"]
    bp.inputs["Base Color"].default_value = (*rgb, 1.0)
    bp.inputs["Roughness"].default_value = 0.7
    return m


M_CABIN = M_TOWER = M_ROPE = M_ROCK = M_SNOW = M_STATION = M_ROOF = M_GLASS = None


def init_materials():
    global M_CABIN, M_TOWER, M_ROPE, M_ROCK, M_SNOW, M_STATION, M_ROOF, M_GLASS
    if WHITE:
        w = (0.85, 0.85, 0.85)
        M_CABIN = M_TOWER = M_ROPE = M_ROCK = M_SNOW = M_STATION = M_ROOF = M_GLASS = _flat(w)
        return
    M_CABIN = make_principled("CabinBlue", hex_to_rgb("#2E7CC4"), 0.30, 0.15)
    M_TOWER = make_principled("TowerGreen", hex_to_rgb("#8E9B7D"), 0.45, 0.6)
    M_ROPE = make_principled("Rope", (0.04, 0.04, 0.045), 0.5, 0.7)
    M_ROCK = make_rock_material("YulongRock", hex_to_rgb("#6E6F72"), 0.22)
    M_SNOW = make_snow_material("Snow")
    M_STATION = make_principled("StationWall", hex_to_rgb("#E8E3D8"), 0.6, 0.0)
    M_ROOF = make_principled("StationRoof", hex_to_rgb("#A33D2F"), 0.5, 0.0)
    M_GLASS = make_principled("CabinGlass", hex_to_rgb("#1C2A38"), 0.12, 0.2)


def assign(obj, mat):
    if mat is None:
        return
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


# ============================================================
# 线形函数
# ============================================================
def line_profile(t):
    """纵剖面：下站缓平台 → 中段陡 → 上站平台（smoothstep）"""
    s = t * t * (3 - 2 * t)
    return Z0 + DH * s


def terrain_z(x, y):
    """地形高程（海拔 m）"""
    t = min(max(x / L, 0.0), 1.0)
    base = line_profile(t)
    if 0.3 < t < 0.85:
        base += math.sin((t - 0.3) / 0.55 * math.pi) * DH * 0.06
    base += (y / TERRAIN_PAD) ** 2 * (-DH * 0.14)
    a1 = math.sin(x * 0.011 + y * 0.007) + math.sin(x * 0.023 - y * 0.017 + 1.7)
    a2 = math.sin(x * 0.047 + y * 0.031 + 3.1) + math.sin(y * 0.053 - x * 0.041)
    a3 = math.sin(x * 0.09 + y * 0.13 + 0.9) + math.sin(y * 0.11 + x * 0.083 + 2.3)
    base += a1 * 13 + a2 * 4.5 + a3 * 1.1
    return base


def rope_z(x):
    """运载索海拔（抛物线悬垂近似）"""
    t = min(max(x / L, 0.0), 1.0)
    z_lin = line_profile(t)
    span = L
    return z_lin + SAG * span * span * t * (1 - t) * 4


# ============================================================
# 地形
# ============================================================
def build_terrain():
    res_u = TERRAIN_RES
    res_v = max(12, 12 * params["terrain_detail"])
    bm = bmesh.new()
    verts = []
    x_min = -STATION_L * 1.5
    x_max = L + STATION_L * 1.5
    for j in range(res_v + 1):
        row = []
        for i in range(res_u + 1):
            x = x_min + i / res_u * (x_max - x_min)
            y = -TERRAIN_PAD + j / res_v * TERRAIN_PAD * 2
            z = terrain_z(x, y * 0.35) - Z0
            v = bm.verts.new((x, y, z))
            row.append(v)
        verts.append(row)
    bm.verts.ensure_lookup_table()
    for j in range(res_v):
        for i in range(res_u):
            v0 = verts[j][i]
            v1 = verts[j][i + 1]
            v2 = verts[j + 1][i + 1]
            v3 = verts[j + 1][i]
            bm.faces.new((v0, v1, v2, v3))
    bm.normal_update()
    me = bpy.data.meshes.new("Terrain_mesh")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new("Terrain", me)
    bpy.context.scene.collection.objects.link(obj)
    # 双材质：0=雪, 1=岩
    obj.data.materials.append(M_SNOW)
    if not WHITE:
        obj.data.materials.append(M_ROCK)
        snow_z = Z0 + DH * SNOW_RATIO
        for poly in obj.data.polygons:
            cz = poly.center.z + Z0
            n_z = poly.normal.z
            steep = n_z < 0.62
            high = cz > snow_z
            if SEASON == "summer" and not high:
                poly.material_index = 1
            elif steep and not high:
                poly.material_index = 1
            else:
                poly.material_index = 0
    else:
        assign(obj, M_SNOW)
    return obj


# ============================================================
# 索线（曲线 + bevel）
# ============================================================
def build_rope(name, y_offset):
    SEG = 160
    curve_data = bpy.data.curves.new(name + "_curve", type='CURVE')
    curve_data.dimensions = '3D'
    curve_data.resolution_u = 12
    curve_data.bevel_depth = ROPE_R
    curve_data.bevel_resolution = 3
    spline = curve_data.splines.new('POLY')
    spline.points.add(SEG)  # 已有 1 个点，再 add SEG 个 = SEG+1 总
    x_min = -STATION_L * 0.5
    x_max = L + STATION_L * 0.5
    for i in range(SEG + 1):
        t = i / SEG
        x = x_min + t * (x_max - x_min)
        z = rope_z(x) - Z0
        spline.points[i].co = (x, y_offset, z, 1.0)
    obj = bpy.data.objects.new(name, curve_data)
    bpy.context.scene.collection.objects.link(obj)
    assign(obj, M_ROPE)
    return obj


def build_ropes():
    objs = []
    objs.append(build_rope("Rope_Up", -GAUGE / 2))
    objs.append(build_rope("Rope_Down", GAUGE / 2))
    return objs


# ============================================================
# 塔架
# ============================================================
def build_tower(index, x_pos):
    """格构式塔架：4 主柱 + 横腹杆 + 顶部横臂 + 轮组"""
    z_rope = rope_z(x_pos)
    z_base = terrain_z(x_pos, 0) - Z0  # 地形局部 z（已减 Z0）
    # 塔基插入地形以下 1m
    base_z = z_base - 1.0
    top_z = z_rope - Z0 + 1.5  # 塔顶略高于索
    height = top_z - base_z

    objs = []
    # 主柱截面参数
    leg_r = 0.18
    spread = 1.8  # 底部半宽
    top_spread = 0.6  # 顶部半宽（收分）

    def leg_pos(corner, h_frac):
        """corner: 0-3; h_frac: 0=底 1=顶"""
        sx = spread * (1 - h_frac) + top_spread * h_frac
        sy = sx
        signs = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        sx_, sy_ = signs[corner]
        return (x_pos + sx_ * sx, sy_ * sy, base_z + height * h_frac)

    # 4 根主柱（用圆柱）
    for c in range(4):
        x0, y0, z0 = leg_pos(c, 0.0)
        x1, y1, z1 = leg_pos(c, 1.0)
        dx, dy, dz = x1 - x0, y1 - y0, z1 - z0
        length = math.sqrt(dx * dx + dy * dy + dz * dz)
        bpy.ops.mesh.primitive_cylinder_add(
            radius=leg_r, depth=length, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
        )
        obj = bpy.context.active_object
        obj.name = f"Tower{index}_leg{c}"
        # 朝向
        rot = Vector((dx, dy, dz)).to_track_quat('Z', 'Y').to_euler()
        obj.rotation_euler = rot
        assign(obj, M_TOWER)
        objs.append(obj)

    # 横腹杆（4 面各 4 道）
    n_braces = 4
    for c in range(4):
        c2 = (c + 1) % 4
        for b in range(n_braces):
            f0 = b / n_braces
            f1 = (b + 1) / n_braces
            p0 = leg_pos(c, f0)
            p1 = leg_pos(c2, f0)
            p2 = leg_pos(c2, f1)
            p3 = leg_pos(c, f1)
            # 水平杆
            for (a, b_) in [(p0, p1), (p3, p2)]:
                _add_brace(a, b_, objs, f"Tower{index}_horiz_{c}_{b}")
            # 交叉斜杆
            _add_brace(p0, p2, objs, f"Tower{index}_diag1_{c}_{b}")
            _add_brace(p1, p3, objs, f"Tower{index}_diag2_{c}_{b}")

    # 顶部横臂（承载两根索的轮组横梁）
    arm_y_half = GAUGE / 2 + 0.4
    arm_z = top_z
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x_pos, 0, arm_z))
    arm = bpy.context.active_object
    arm.name = f"Tower{index}_arm"
    arm.scale = (0.5, arm_y_half * 2, 0.3)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(arm, M_TOWER)
    objs.append(arm)

    # 托索轮组（每索 2 个轮，用扁圆体）
    for side in (-1, 1):
        for k in range(2):
            wy = side * GAUGE / 2
            wz = arm_z + 0.6 + k * 0.7
            bpy.ops.mesh.primitive_torus_add(
                major_radius=0.45, minor_radius=0.12,
                location=(x_pos + (k - 0.5) * 0.9, wy, wz),
                rotation=(math.pi / 2, 0, 0)
            )
            wheel = bpy.context.active_object
            wheel.name = f"Tower{index}_wheel_{side}_{k}"
            assign(wheel, M_TOWER)
            objs.append(wheel)

    return objs


def _add_brace(p0, p1, objs, name):
    x0, y0, z0 = p0
    x1, y1, z1 = p1
    dx, dy, dz = x1 - x0, y1 - y0, z1 - z0
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    if length < 0.01:
        return
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.06, depth=length,
        location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    )
    obj = bpy.context.active_object
    obj.name = name
    rot = Vector((dx, dy, dz)).to_track_quat('Z', 'Y').to_euler()
    obj.rotation_euler = rot
    assign(obj, M_TOWER)
    objs.append(obj)


def build_towers():
    objs = []
    # 塔架均匀分布（避开站房区）
    for i in range(TOWER_N):
        t = (i + 1) / (TOWER_N + 1)
        x = t * L
        objs += build_tower(i, x)
    return objs


# ============================================================
# 吊厢
# ============================================================
def build_cabin(index, x_pos, side):
    """封闭吊厢：吊杆 + 抱索器 + 厢体 + 环窗带 + 滑橇"""
    z_rope = rope_z(x_pos) - Z0
    y = side * GAUGE / 2
    objs = []

    # 吊杆（从索向下到厢顶）
    hanger_top = z_rope
    hanger_bot = z_rope - HANGER_L
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.04, depth=HANGER_L,
        location=(x_pos, y, (hanger_top + hanger_bot) / 2)
    )
    hanger = bpy.context.active_object
    hanger.name = f"Cabin{index}_hanger"
    assign(hanger, M_TOWER)
    objs.append(hanger)

    # 抱索器夹块
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x_pos, y, hanger_top - 0.05))
    clamp = bpy.context.active_object
    clamp.name = f"Cabin{index}_clamp"
    clamp.scale = (0.3, 0.3, 0.2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(clamp, M_TOWER)
    objs.append(clamp)

    # 厢体（圆角立方体 = cube + bevel）
    cabin_z = hanger_bot - CABIN_H / 2 - 0.1
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x_pos, y, cabin_z))
    body = bpy.context.active_object
    body.name = f"Cabin{index}_body"
    body.scale = (CABIN_L, CABIN_W, CABIN_H)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # bevel 修饰器倒圆角
    bev = body.modifiers.new("Bevel", 'BEVEL')
    bev.width = 0.18
    bev.segments = 3
    assign(body, M_CABIN)
    objs.append(body)

    # 环窗带（深色环绕条）
    window_z = cabin_z + 0.15
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x_pos, y, window_z))
    win = bpy.context.active_object
    win.name = f"Cabin{index}_window"
    win.scale = (CABIN_L * 1.01, CABIN_W * 1.01, 0.5)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(win, M_GLASS)
    objs.append(win)

    # 滑橇（底部）
    sled_z = cabin_z - CABIN_H / 2 - 0.05
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x_pos, y, sled_z))
    sled = bpy.context.active_object
    sled.name = f"Cabin{index}_sled"
    sled.scale = (CABIN_L * 0.7, CABIN_W * 0.6, 0.12)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(sled, M_TOWER)
    objs.append(sled)

    return objs


def build_cabins():
    objs = []
    # 吊厢均匀分布在线路上（含站房段外延）
    x_min = STATION_L * 0.3
    x_max = L - STATION_L * 0.3
    for i in range(CABIN_N):
        t = i / max(CABIN_N - 1, 1)
        x = x_min + t * (x_max - x_min)
        side = -1 if i % 2 == 0 else 1
        objs += build_cabin(i, x, side)
    return objs


# ============================================================
# 站房
# ============================================================
def build_station(name, x_pos, is_upper=False):
    objs = []
    z_ground = terrain_z(x_pos, 0) - Z0

    if is_upper:
        # 上站：嵌岩小平台
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x_pos, 0, z_ground + 0.5))
        plat = bpy.context.active_object
        plat.name = name + "_platform"
        plat.scale = (STATION_L * 0.8, STATION_W * 0.7, 1.0)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        assign(plat, M_ROCK)
        objs.append(plat)
        # 小站房
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x_pos, 0, z_ground + 2.5))
        bldg = bpy.context.active_object
        bldg.name = name + "_bldg"
        bldg.scale = (STATION_L * 0.5, STATION_W * 0.5, 4.0)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        assign(bldg, M_STATION)
        objs.append(bldg)
        # 屋顶
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x_pos, 0, z_ground + 4.6))
        roof = bpy.context.active_object
        roof.name = name + "_roof"
        roof.scale = (STATION_L * 0.55, STATION_W * 0.55, 0.4)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        assign(roof, M_ROOF)
        objs.append(roof)
    else:
        # 下站：大站房 + 红顶
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x_pos, 0, z_ground + STATION_H / 2))
        bldg = bpy.context.active_object
        bldg.name = name + "_bldg"
        bldg.scale = (STATION_L, STATION_W, STATION_H)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        assign(bldg, M_STATION)
        objs.append(bldg)
        # 双坡屋顶（两个斜立方近似）
        for s in (-1, 1):
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x_pos, s * STATION_W * 0.3, z_ground + STATION_H + 0.6))
            roof = bpy.context.active_object
            roof.name = f"{name}_roof_{s}"
            roof.scale = (STATION_L, STATION_W * 0.5, 0.5)
            roof.rotation_euler = (math.radians(s * 8), 0, 0)
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
            assign(roof, M_ROOF)
            objs.append(roof)

    return objs


def build_stations():
    objs = []
    objs += build_station("Lower_Station", -STATION_L * 0.3, is_upper=False)
    objs += build_station("Upper_Station", L + STATION_L * 0.3, is_upper=True)
    return objs


# ============================================================
# 场景光照
# ============================================================
def setup_scene():
    scene = bpy.context.scene
    # 世界背景
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.72, 0.78, 0.88, 1.0)
    bg.inputs[1].default_value = 1.5

    # 太阳
    bpy.ops.object.light_add(type='SUN', location=(L * 0.3, -200, 400))
    sun = bpy.context.active_object
    sun.data.energy = 3.5
    sun.data.angle = 0.02
    sun.rotation_euler = (math.radians(55), math.radians(10), math.radians(-30))

    # 补光
    bpy.ops.object.light_add(type='AREA', location=(L * 0.5, 200, 250))
    fill = bpy.context.active_object
    fill.data.energy = 8000
    fill.data.size = 200


# ============================================================
# 导出
# ============================================================
def export_glb(output_path):
    out = bpy.path.abspath(output_path) if output_path.startswith("//") else output_path
    out_dir = os.path.dirname(out)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        export_materials='EXPORT',
        export_texcoords=True,
        export_normals=True,
    )
    return out


def main():
    parse_args()
    clean_scene()
    init_materials()
    print("=" * 50)
    print("🏔 玉龙雪山大索道建模开始")
    print(f"   线路长度: {L}m, 高差: {DH}m")
    print(f"   塔架数: {TOWER_N}, 吊厢数: {CABIN_N}")
    print("=" * 50)

    parts = []
    parts.append(build_terrain())
    print("  ✓ 雪坡地形")
    parts += build_ropes()
    print("  ✓ 双索线")
    parts += build_towers()
    print("  ✓ 格构塔架")
    parts += build_cabins()
    print("  ✓ 蓝色吊厢")
    parts += build_stations()
    print("  ✓ 站房")

    setup_scene()

    # 统计
    mesh_objs = [o for o in bpy.data.objects if o.type == 'MESH']
    curve_objs = [o for o in bpy.data.objects if o.type == 'CURVE']
    total = len(mesh_objs) + len(curve_objs)
    total_v = sum(len(o.data.vertices) for o in mesh_objs)
    total_f = sum(len(o.data.polygons) for o in mesh_objs)
    print(f"    对象: {total} (mesh {len(mesh_objs)} + curve {len(curve_objs)})")
    print(f"    顶点: {total_v}, 面: {total_f}")

    out = export_glb(params["output_path"])
    size_mb = os.path.getsize(out) / 1024 / 1024
    print(f"🎉 玉龙雪山大索道完成！输出: {out} ({size_mb:.2f} MB)")
    print(f"Created {total} objects")


if __name__ == "__main__":
    main()
