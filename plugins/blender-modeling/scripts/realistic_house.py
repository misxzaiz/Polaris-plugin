"""
老房子程序化建模（Realistic Old House）— 阶段1 几何骨架（白模）
================================================================
按 plans/realistic-modeling-plugin-v1.md 定稿方案：
  - 台基：砖石条基
  - 墙体：清水砖下段 + 抹灰上段，预切面法开洞（inset_region + extrude 内推，零 boolean）
  - 屋顶：双坡硬山顶，椽条 Array → 望板 Solidify → 挂瓦条 → 小青瓦 bmesh 逐片铺设（随机抖动/缺瓦）
  - 屋脊：正脊条 + 两端收头
  - 木构件：门框/窗框/窗棂格栅/檐檩/挑檐
  - 附件：台阶/门槛/烟囱
  - 地面：泥土地坪

阶段1 = 白模验证结构（无纹理），材质与 bake 在阶段1.5。

用法：
  blender --background --python realistic_house.py -- --output house.glb [--params '{"seed":7}']

CLI:
  --output <path>          GLB 输出路径
  --params <json>          参数覆盖（见 params_schema）
"""

import bpy
import bmesh
import sys
import os
import json
import math
import random
from mathutils import Vector, Matrix, Euler

# ============================================================
# 参数 schema 与默认值（MCP 自动读取 params_schema 生成工具参数）
# ============================================================
params_schema = {
    "type": "object",
    "properties": {
        "bays": {"type": "integer", "minimum": 1, "maximum": 7, "description": "开间数"},
        "bay_width": {"type": "number", "minimum": 2.4, "maximum": 4.5, "description": "明间开间宽(m)"},
        "depth": {"type": "number", "minimum": 3.0, "maximum": 8.0, "description": "进深(m)"},
        "eave_height": {"type": "number", "minimum": 2.2, "maximum": 3.6, "description": "檐柱高(m)"},
        "roof_angle": {"type": "number", "minimum": 20, "maximum": 40, "description": "屋面坡度(度)"},
        "eave_overhang": {"type": "number", "minimum": 0.3, "maximum": 1.2, "description": "出檐(m)"},
        "seed": {"type": "integer", "description": "随机种子（瓦片抖动/缺瓦/污渍可复现）"},
        "missing_tile_ratio": {"type": "number", "minimum": 0, "maximum": 0.1, "description": "缺瓦比例"},
        "white_model": {"type": "boolean", "description": "仅白模（跳过材质）"},
        "output_path": {"type": "string", "description": "GLB 输出路径（MCP 会用 --output 覆盖）"},
    },
    "additionalProperties": True,
}

params = {
    "bays": 3,
    "bay_width": 3.6,
    "depth": 4.8,
    "eave_height": 2.8,
    "roof_angle": 27.0,
    "eave_overhang": 0.6,
    "seed": 7,
    "missing_tile_ratio": 0.02,
    "white_model": True,     # 阶段1 默认白模；阶段1.5 改 False
    "output_path": "//realistic_house.glb",
}

# ============================================================
# CLI 参数解析
# ============================================================


def parse_args():
    args = sys.argv
    if '--' not in args:
        return
    idx = args.index('--')
    custom_args = args[idx + 1:]
    i = 0
    while i < len(custom_args):
        arg = custom_args[i]
        if arg.startswith('--'):
            key = arg[2:]
            if key == 'output':
                params['output_path'] = custom_args[i + 1]
                i += 2
                continue
            if key == 'params':
                try:
                    params.update(json.loads(custom_args[i + 1]))
                except (json.JSONDecodeError, IndexError):
                    print("Warning: could not parse params JSON")
                i += 2
                continue
        i += 1


parse_args()

# ============================================================
# 派生尺寸（§1.5-C 参数表）
# ============================================================

W = params["bays"] * params["bay_width"]          # 总面阔
D = params["depth"]                                # 进深
H = params["eave_height"]                          # 檐口高
ANG = math.radians(params["roof_angle"])
OVER = params["eave_overhang"]
WALL_T = 0.24                                      # 墙厚（砖长 240）
BRICK_L, BRICK_W, BRICK_H = 0.24, 0.115, 0.053     # 标准砖
JOINT = 0.010                                      # 灰缝
SKIRT_H = 0.9                                      # 清水砖裙墙高
PLINTH_H = 0.30                                    # 台基高
RAFTER_R = 0.025                                   # 椽半径
RAFTER_STEP = 0.24                                 # 椽档
BOARD_T = 0.018                                    # 望板厚
BATTEN_STEP = 0.15                                 # 挂瓦条间距 = 瓦露明长
TILE_L, TILE_W, TILE_T = 0.20, 0.165, 0.010        # 小青瓦
ROOF_HALF_SPAN = D / 2 + OVER                      # 屋面半跨（含出檐，前后坡向）
RIDGE_Z = H + math.tan(ANG) * ROOF_HALF_SPAN       # 屋脊高
FACADE_W = W                                       # 硬山：屋面与山墙齐平不出际

rng = random.Random(params["seed"])

# ============================================================
# 通用工具
# ============================================================


def clean_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block_list in (bpy.data.meshes, bpy.data.materials, bpy.data.images,
                       bpy.data.curves, bpy.data.lights, bpy.data.cameras):
        for block in list(block_list):
            if block.users == 0:
                block_list.remove(block)


def new_object(name, mesh):
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def box(name, size, location, rot=(0, 0, 0)):
    """单位盒体 helper：size=(sx,sy,sz)，location=中心。"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    # 应用 scale，避免 boolean/法线问题（§1.5-A boolean 坑规避，虽然白模不走 boolean）
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def make_material(name, color, rough=0.8, metal=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return mat


# 白模临时配色（阶段1.5 替换为 PolyHaven PBR）
# 注意：必须在 clean_scene() 之后创建（clean_scene 会移除 0 用户材质）
MAT = {}


def init_materials():
    MAT.update({
        "plinth": make_material("plinth", (0.28, 0.26, 0.24), 0.9),
        "brick": make_material("brick", (0.45, 0.22, 0.15), 0.85),
        "plaster": make_material("plaster", (0.82, 0.79, 0.72), 0.9),
        "tile": make_material("tile", (0.09, 0.10, 0.11), 0.75),
        "wood_dark": make_material("wood_dark", (0.13, 0.09, 0.06), 0.75),
        "wood_light": make_material("wood_light", (0.42, 0.30, 0.18), 0.8),
        "wood_frame": make_material("wood_frame", (0.30, 0.20, 0.12), 0.75),
        "earth": make_material("earth", (0.30, 0.24, 0.18), 0.95),
    })


def join_objects(objs, name):
    """合并 objs 为一个 object（空列表返回 None）。"""
    objs = [o for o in objs if o]
    if not objs:
        return None
    if len(objs) == 1:
        objs[0].name = name
        return objs[0]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    merged = bpy.context.active_object
    merged.name = name
    return merged


# ============================================================
# 1. 台基
# ============================================================


def build_plinth():
    """砖石条基：略出挑于墙面。"""
    obj = box("plinth", (W + 0.24, D + 0.24, PLINTH_H), (0, 0, PLINTH_H / 2))
    obj.data.materials.append(MAT["plinth"])
    # 台基顶面退台（压顶石）
    cap = box("plinth_cap", (W + 0.30, D + 0.30, 0.04), (0, 0, PLINTH_H + 0.02))
    cap.data.materials.append(MAT["plinth"])
    return [obj, cap]


# ============================================================
# 2. 墙体（预切面开洞：bmesh 网格拆分删面 + Solidify 成实体，零 boolean）
# ============================================================

# 洞口尺寸（§1.5-C 参数表通例）
DOOR_W, DOOR_H = 1.05, 2.20          # 明间门洞
WIN_W, WIN_H = 1.20, 1.35            # 窗洞
WIN_SILL = 0.95                      # 窗台高
LINTEL_H = 0.20                      # 木过梁截面高


def build_wall_panel(name, length, openings, wall_axis, side_sign, z0, z1):
    """单面墙：bmesh 网格按洞口拆分 → 删洞面 → Solidify 成 WALL_T 实体。

    局部坐标系：x=沿墙展开, z=高度。wall_axis='y' 墙沿 X 展开（前后墙，置于 ±D/2）；
    wall_axis='x' 墙沿 Y 展开（侧墙，先绕 Z 转 90°，置于 ±W/2）。
    openings: [(center_along, width, sill_z, top_z), ...]
    """
    x0, x1 = -length / 2, length / 2
    # 竖向切割线（所有洞口的 sill/top）+ 横向切割线（所有洞口的左右边）
    zs = sorted({z0, z1} | {o[2] for o in openings} | {o[3] for o in openings})
    us = sorted({x0, x1} | {o[0] - o[1] / 2 for o in openings} | {o[0] + o[1] / 2 for o in openings})

    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = {}
    for zi, z in enumerate(zs):
        for ui, u in enumerate(us):
            verts[(zi, ui)] = bm.verts.new((u, 0.0, z))
    bm.verts.ensure_lookup_table()
    for zi in range(len(zs) - 1):
        for ui in range(len(us) - 1):
            bm.faces.new((verts[(zi, ui)], verts[(zi, ui + 1)],
                          verts[(zi + 1, ui + 1)], verts[(zi + 1, ui)]))
    bm.faces.ensure_lookup_table()

    # 删洞面：洞口矩形内的 quad 整格删除
    to_del = []
    for f in bm.faces:
        fu = [v.co.x for v in f.verts]
        fz = [v.co.z for v in f.verts]
        for (cu, cw, sz, tz) in openings:
            if (min(fu) > cu - cw / 2 - 1e-6 and max(fu) < cu + cw / 2 + 1e-6
                    and min(fz) > sz - 1e-6 and max(fz) < tz + 1e-6):
                to_del.append(f)
                break
    bmesh.ops.delete(bm, geom=to_del, context='FACES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = new_object(name, mesh)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if wall_axis == 'x':
        obj.rotation_euler = Euler((0, 0, math.pi / 2))
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    obj.location = (0, side_sign * D / 2, 0) if wall_axis == 'y' else (side_sign * W / 2, 0, 0)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    sol = obj.modifiers.new("Solidify", 'SOLIDIFY')
    sol.thickness = WALL_T
    sol.offset = 0.0
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="Solidify")
    return obj


def build_gable(name, side_sign):
    """硬山山尖：侧墙上部的三角形（坡度与屋面一致，尖顶在正脊中央）。

    三角形沿进深 Y 展开（底边长 D，在檐口高 H），置于 x=±W/2。
    """
    verts_local = [(0, -D / 2, H), (0, D / 2, H), (0, 0, RIDGE_Z)]
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bv = [bm.verts.new(v) for v in verts_local]
    bm.faces.new(tuple(bv))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = new_object(name, mesh)
    obj.location = (side_sign * W / 2, 0, 0)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    sol = obj.modifiers.new("Solidify", 'SOLIDIFY')
    sol.thickness = WALL_T
    sol.offset = 0.0
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="Solidify")
    return obj


def build_walls():
    """四面墙 + 两侧山尖。明间开门，次间开窗；背面对称开窗；侧墙实墙。"""
    objs = []
    door_w = min(DOOR_W, params["bay_width"] * 0.6)
    win_w = min(WIN_W, params["bay_width"] * 0.55)
    # 前墙：明间(中间开间)门，其余窗
    front_openings = []
    n = params["bays"]
    bay = params["bay_width"]
    half_w = W / 2
    for i in range(n):
        c = -half_w + bay * (i + 0.5)
        if i == n // 2:
            front_openings.append((c, door_w, PLINTH_H, PLINTH_H + DOOR_H))
        else:
            front_openings.append((c, win_w, PLINTH_H + WIN_SILL, PLINTH_H + WIN_SILL + WIN_H))
    # 后墙：全部窗
    back_openings = [(-half_w + bay * (i + 0.5), win_w, PLINTH_H + WIN_SILL, PLINTH_H + WIN_SILL + WIN_H)
                     for i in range(n)]
    fw = build_wall_panel("wall_front", W, front_openings, 'y', 1, PLINTH_H, H)
    fw.data.materials.append(MAT["brick"])
    bw = build_wall_panel("wall_back", W, back_openings, 'y', -1, PLINTH_H, H)
    bw.data.materials.append(MAT["brick"])
    for sgn in (1, -1):
        sw = build_wall_panel(f"wall_side_{sgn}", D, [], 'x', sgn, PLINTH_H, H)
        sw.data.materials.append(MAT["brick"])
        g = build_gable(f"gable_{sgn}", sgn)
        g.data.materials.append(MAT["plaster"])
        objs += [sw, g]
    objs += [fw, bw]
    return objs


# ============================================================
# 3. 分层屋顶：椽条 Array → 望板 → 挂瓦条 → 小青瓦逐片 bmesh 铺设
# ============================================================


def roof_plane_z(d_eave):
    """屋面高度：d_eave = 距屋脊的水平距离（0=屋脊，ROOF_HALF_SPAN=檐口）。
    屋脊在 y=0 中线，两坡向 y=±半跨 降到檐口高 H。"""
    return RIDGE_Z - math.tan(ANG) * d_eave


def build_roof_frame():
    """椽条（每坡沿坡向贴屋面下方）+ 望板（坡向板 Solidify）+ 挂瓦条（方料）。"""
    objs = []
    rafter_len = ROOF_HALF_SPAN / math.cos(ANG)   # 坡长
    rafter_w, rafter_h = 0.05, 0.07
    n_rafters = max(2, int(FACADE_W / RAFTER_STEP))
    for sgn in (1, -1):
        # 椽：绕 X 转 -sgn*ANG（+Y 端沿坡下降），顶面贴望板底
        rot_x = -sgn * ANG
        for i in range(n_rafters + 1):
            x = -FACADE_W / 2 + i * (FACADE_W / n_rafters)
            y_mid = sgn * (ROOF_HALF_SPAN / 2)
            z_mid = roof_plane_z(ROOF_HALF_SPAN / 2) - BOARD_T - rafter_h / 2
            r = box(f"rafter_{sgn}_{i}", (rafter_w, rafter_len, rafter_h),
                    (x, y_mid, z_mid), rot=(rot_x, 0, 0))
            r.data.materials.append(MAT["wood_light"])
            objs.append(r)

    # 望板：坡向剖面（脊高檐低）沿 X 挤出，向屋面下方偏移 BOARD_T
    for sgn in (1, -1):
        mesh = bpy.data.meshes.new(f"deck_{sgn}")
        bm = bmesh.new()
        d0, d1 = 0.0, ROOF_HALF_SPAN              # 距脊水平距离
        p = [(-FACADE_W / 2, 0, roof_plane_z(d0)), (FACADE_W / 2, 0, roof_plane_z(d0)),
             (FACADE_W / 2, sgn * d1, roof_plane_z(d1)), (-FACADE_W / 2, sgn * d1, roof_plane_z(d1))]
        bv = [bm.verts.new(v) for v in p]
        f = bm.faces.new(tuple(bv))
        ret = bmesh.ops.extrude_face_region(bm, geom=[f])
        verts_new = [e for e in ret['geom'] if isinstance(e, bmesh.types.BMVert)]
        n_dir = Vector((0, sgn * math.sin(ANG), math.cos(ANG)))   # 坡外法线
        bmesh.ops.translate(bm, vec=-n_dir * BOARD_T, verts=verts_new)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(mesh)
        bm.free()
        deck = new_object(f"roof_deck_{sgn}", mesh)
        deck.data.materials.append(MAT["wood_dark"])
        objs.append(deck)

    # 挂瓦条：每坡沿坡向阵列，间距 = 瓦露明；顶面贴坡
    batten_h = 0.025
    for sgn in (1, -1):
        n_battens = int(ROOF_HALF_SPAN / BATTEN_STEP)
        for j in range(n_battens + 1):
            d = j * BATTEN_STEP
            y = sgn * d
            z = roof_plane_z(d) + batten_h / 2
            b = box(f"batten_{sgn}_{j}", (FACADE_W, 0.03, batten_h),
                    (0, y, z), rot=(-sgn * ANG, 0, 0))
            b.data.materials.append(MAT["wood_dark"])
            objs.append(b)
    return objs


def build_roof_tiles():
    """小青瓦 bmesh 逐片铺设：每坡从檐口(距脊 ROOF_HALF_SPAN)铺到屋脊(d=0)，
    行距=瓦露明，列距=垄步距；随机 ±2° 转角 / ±5mm 高差 / 缺瓦（rng 可复现）。"""
    half = FACADE_W / 2
    mesh = bpy.data.meshes.new("tiles")
    bm = bmesh.new()
    n_rows = int((ROOF_HALF_SPAN - 0.05) / BATTEN_STEP)
    n_cols = max(2, int(FACADE_W / 0.20))
    placed = 0
    for sgn in (1, -1):
        for i in range(n_rows):
            d = ROOF_HALF_SPAN - 0.10 - i * BATTEN_STEP   # 距脊：檐口→脊
            for j in range(n_cols):
                if rng.random() < params["missing_tile_ratio"]:
                    continue  # 缺瓦
                x = -half + 0.10 + j * (FACADE_W - 0.20) / (n_cols - 1)
                y = sgn * d
                z = roof_plane_z(d) + TILE_T / 2
                # 随机抖动：±5mm 高差 + ±2° 平面内转角；瓦局部 y 轴沿坡下降方向
                jitter_z = rng.uniform(-0.005, 0.005)
                rot_z = math.radians(rng.uniform(-2, 2))
                m = (Matrix.Translation((x, y, z + jitter_z))
                     @ Matrix.Rotation(rot_z, 4, 'Z')
                     @ Matrix.Rotation(-sgn * ANG, 4, 'X'))
                _make_tile_geom(bm, m)
                placed += 1
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = new_object("roof_tiles", mesh)
    obj.data.materials.append(MAT["tile"])
    print(f"    Roof tiles placed: {placed}")
    return obj


def _make_tile_geom(bm, mat):
    """在 bm 中按矩阵 mat 放置一块小青瓦：拱形截面沿瓦长拉伸（低模 ~28 tri）。

    瓦局部坐标：y=瓦长方向(坡向)，x=瓦宽方向，z=拱高方向；拱开口朝下扣在挂瓦条上。
    """
    w = TILE_W / 2
    L = TILE_L
    t = TILE_T
    secs = 6
    # 截面轮廓（x, z）：外弧 up 拱 + 壁厚内收
    prof = []
    for k in range(secs + 1):
        a = math.pi * k / secs
        prof.append((-w * math.cos(a), w * math.sin(a)))
    inner = [(x, max(z - t, 0.0)) for (x, z) in prof[1:-1]]
    prof += inner[::-1]
    n = len(prof)
    rings = []
    for li in (-1, 1):
        ly = li * L / 2
        rings.append([bm.verts.new(mat @ Vector((px, ly, pz + t / 2))) for (px, pz) in prof])
    for k in range(n):
        a0, a1 = rings[0][k], rings[0][(k + 1) % n]
        b0, b1 = rings[1][k], rings[1][(k + 1) % n]
        bm.faces.new((a0, a1, b1, b0))
    # 两端盖
    bmesh.ops.contextual_create(bm, geom=rings[0])
    bmesh.ops.contextual_create(bm, geom=rings[1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


def build_ridge():
    """正脊条 + 两端收头：屋脊处覆瓦条。"""
    objs = []
    z = RIDGE_Z
    ridge = box("ridge", (FACADE_W, 0.22, 0.12), (0, 0, z + 0.10))
    ridge.data.materials.append(MAT["tile"])
    objs.append(ridge)
    for sgn in (1, -1):
        cap = box(f"ridge_cap_{sgn}", (0.30, 0.30, 0.20), (sgn * (FACADE_W / 2 - 0.15), 0, z + 0.14))
        cap.data.materials.append(MAT["tile"])
        objs.append(cap)
    return objs


# ============================================================
# 4. 木构件：檐柱 / 檐檩 / 门框窗框 / 窗棂格栅
# ============================================================


def build_woodwork():
    objs = []
    bay = params["bay_width"]
    n = params["bays"]
    half_w = W / 2
    # 檐柱：前后各 n+1 根（贴墙面内侧），柱径 0.24
    r_col = 0.12
    for sgn in (1, -1):
        for i in range(n + 1):
            x = -half_w + bay * i
            col = box(f"column_{sgn}_{i}", (2 * r_col, 2 * r_col, H - PLINTH_H),
                      (x, sgn * (D / 2 - WALL_T / 2 - r_col - 0.02), PLINTH_H + (H - PLINTH_H) / 2))
            col.data.materials.append(MAT["wood_frame"])
            objs.append(col)
    # 檐檩：沿前后墙顶的圆木
    for sgn in (1, -1):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.09, depth=FACADE_W,
                                            location=(0, sgn * (D / 2 - WALL_T / 2 - 0.12), H + 0.02),
                                            rotation=(0, math.pi / 2, 0))
        purlin = bpy.context.active_object
        purlin.name = f"purlin_{sgn}"
        purlin.data.materials.append(MAT["wood_dark"])
        objs.append(purlin)
    # 门框 / 窗框 + 窗棂格栅（前墙）
    frame_t = 0.06
    frame_d = 0.08
    door_w = min(DOOR_W, params["bay_width"] * 0.6)
    win_w = min(WIN_W, params["bay_width"] * 0.55)
    for i in range(n):
        c = -half_w + bay * (i + 0.5)
        if i == n // 2:
            add_frame(objs, c, PLINTH_H, DOOR_H, door_w, door=True)
        else:
            add_frame(objs, c, PLINTH_H + WIN_SILL, WIN_H, win_w, door=False)
    return objs


def add_frame(objs, cx, z0, h, w, door):
    """门/窗框（两竖一边）+ 窗棂格栅。框贴前墙外皮。"""
    y = D / 2 + WALL_T / 2 + 0.01
    t = 0.06
    for sgn in (1, -1):
        jamb = box(f"jamb_{cx:.1f}_{sgn}", (t, frame_d_size(), h),
                   (cx + sgn * (w / 2 + t / 2), y, z0 + h / 2))
        jamb.data.materials.append(MAT["wood_frame"])
        objs.append(jamb)
    lintel = box(f"lintel_{cx:.1f}", (w + 2 * t, frame_d_size(), LINTEL_H),
                 (cx, y, z0 + h + LINTEL_H / 2))
    lintel.data.materials.append(MAT["wood_frame"])
    objs.append(lintel)
    if not door:
        # 窗棂格栅：竖条 4 根 + 横条 2 根
        n_v, n_h = 4, 2
        for k in range(1, n_v + 1):
            x = cx - w / 2 + w * k / (n_v + 1)
            bar = box(f"mullion_{cx:.1f}_{k}", (0.025, 0.04, h), (x, y, z0 + h / 2))
            bar.data.materials.append(MAT["wood_frame"])
            objs.append(bar)
        for k in range(1, n_h + 1):
            z = z0 + h * k / (n_h + 1)
            bar = box(f"transom_{cx:.1f}_{k}", (w, 0.04, 0.025), (cx, y, z))
            bar.data.materials.append(MAT["wood_frame"])
            objs.append(bar)


def frame_d_size():
    return 0.08


# ============================================================
# 5. 附件：台阶 / 门槛 / 烟囱；地面泥土地坪
# ============================================================


def build_attachments():
    objs = []
    # 台阶（前门处两级）
    cx = 0.0
    s1 = box("step_1", (DOOR_W + 0.5, 0.35, 0.12), (cx, D / 2 + PLINTH_H_cap_off() + 0.35 / 2, 0.06))
    s1.data.materials.append(MAT["plinth"])
    s2 = box("step_2", (DOOR_W + 0.5, 0.35, 0.12), (cx, D / 2 + PLINTH_H_cap_off() + 0.35 + 0.35 / 2, 0.06))
    s2.data.materials.append(MAT["plinth"])
    objs += [s1, s2]
    # 门槛
    thr = box("threshold", (DOOR_W, 0.10, 0.08), (0, D / 2 + WALL_T / 2, PLINTH_H + 0.04))
    thr.data.materials.append(MAT["wood_dark"])
    objs.append(thr)
    # 烟囱（后坡侧，砖砌方筒）
    ch_x = W / 4
    ch_h = RIDGE_Z + 0.5
    chimney = box("chimney", (0.45, 0.45, ch_h), (ch_x, -D / 6, ch_h / 2))
    chimney.data.materials.append(MAT["brick"])
    objs.append(chimney)
    chcap = box("chimney_cap", (0.55, 0.55, 0.10), (ch_x, -D / 6, ch_h + 0.05))
    chcap.data.materials.append(MAT["plinth"])
    objs.append(chcap)
    return objs


def PLINTH_H_cap_off():
    return 0.30  # 台阶起步离墙面的偏移基准


def build_ground():
    g = box("ground", (W + 6.0, D + 6.0, 0.05), (0, 0, -0.025))
    g.data.materials.append(MAT["earth"])
    return [g]


# ============================================================
# 组装与导出
# ============================================================


def count_stats():
    tris = 0
    verts = 0
    for o in bpy.data.objects:
        if o.type == 'MESH':
            me = o.data
            verts += len(me.vertices)
            for p in me.polygons:
                tris += max(0, len(p.vertices) - 2)
    return verts, tris


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
    clean_scene()
    init_materials()
    print("🏠 老房子白模建模开始")
    parts = []
    parts += build_plinth()
    print("  ✓ 台基")
    parts += build_walls()
    print("  ✓ 墙体 + 山尖（预切面开洞）")
    parts += build_roof_frame()
    print("  ✓ 屋顶骨架（椽/望板/挂瓦条）")
    parts += [build_roof_tiles()]
    print("  ✓ 小青瓦铺设")
    parts += build_ridge()
    print("  ✓ 正脊")
    parts += build_woodwork()
    print("  ✓ 木构件")
    parts += build_attachments()
    print("  ✓ 附件")
    parts += build_ground()
    print("  ✓ 地面")

    v, t = count_stats()
    print(f"    总对象: {len([o for o in bpy.data.objects if o.type == 'MESH'])}")
    print(f"    顶点: {v}, 三角面: {t}")
    out = export_glb(params["output_path"])
    size_mb = os.path.getsize(out) / 1024 / 1024
    print(f"🎉 老房子白模完成！输出: {out} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
