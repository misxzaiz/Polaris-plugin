"""
AI 3D Modeling - 粉笔（Chalk）建模脚本
===========================================
用途：生成尽量真实的粉笔 3D 模型
特点：锥形柱体、不规则截面、表面微纹理、真实粉笔材质
输出：GLB 格式

用法：
  blender --background --python chalk.py -- --output output.glb

AI 可修改的参数：
  - 颜色（白/彩粉笔）
  - 长度、粗细
  - 表面粗糙度、不规则程度
"""

import bpy
import bmesh
import sys
import json
import os
import math
import random
from mathutils import Vector, Euler


# ============================================================
# 参数配置
# ============================================================
params = {
    # ---- 尺寸 ----
    "length": 1.0,                     # 粉笔长度
    "base_radius": 0.12,               # 底部半径（稍粗，手持端）
    "tip_radius": 0.09,                # 顶部半径（稍细，书写端）
    "segments": 24,                    # 截面分段数（越高越圆滑）
    "ring_count": 40,                  # 纵向环数（越高越精细）

    # ---- 颜色 ----
    "color": (0.96, 0.94, 0.90, 1.0), # 基础色（白垩色，微暖）
    "color_variation": 0.03,           # 颜色随机变化幅度

    # ---- 表面不规则 ----
    "irregularity": 0.015,             # 截面不规则度（随机偏移幅度）
    "oval_ratio": 0.97,                # 椭圆度（1.0=正圆，<1.0=椭圆）
    "bend_amount": 0.008,              # 纵向微弯幅度

    # ---- 表面纹理 ----
    "surface_roughness": 0.6,          # 表面粗糙度（位移强度）
    "texture_scale": 0.8,              # 纹理缩放
    "subdivision_levels": 2,           # 细分级别

    # ---- 材质 ----
    "roughness": 0.98,                 # 粗糙度（0~1，粉笔应极高）
    "specular": 0.02,                  # 镜面反射（粉笔几乎没有）
    "subsurface": 0.15,                # 次表面散射（粉笔的微透光）
    "subsurface_color": (0.92, 0.90, 0.85, 1.0),  # 次表面色

    # ---- 粉尘 ----
    "dust_enabled": True,              # 是否生成粉尘粒子
    "dust_amount": 120,                # 粉尘粒子数量
    "dust_radius": 0.003,              # 粉尘粒子大小

    # ---- 书写端磨损 ----
    "wear_enabled": True,              # 是否模拟书写端磨损
    "wear_flatness": 0.4,              # 磨损面平坦度（0~1）
    "wear_angle": 0.3,                 # 磨损面倾斜角度

    # ---- 渲染 ----
    "shade_smooth": True,
}


# ============================================================
# 种子管理（确保每次生成一致，但不同参数产生不同结果）
# ============================================================
_rng = None

def seed_rng(seed=42):
    global _rng
    _rng = random.Random(seed)

def rand_range(a, b):
    return _rng.uniform(a, b)

def rand_gauss(mu=0, sigma=1):
    return _rng.gauss(mu, sigma)


# ============================================================
# 工具函数
# ============================================================

def parse_args():
    """解析命令行参数（--key value 格式）"""
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
                        # 如果传入了 seed，更新随机种子
                        if 'seed' in extra:
                            seed_rng(extra['seed'])
                    except json.JSONDecodeError:
                        print(f"Warning: could not parse params JSON: {val}")


def clean_scene():
    """清理场景"""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    for block in bpy.data.meshes:
        bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)
    for block in bpy.data.textures:
        bpy.data.textures.remove(block)


def assign_material(obj, mat):
    """给对象分配材质"""
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


# ============================================================
# 粉笔材质
# ============================================================

def make_chalk_material(name, color, roughness, specular, subsurface, subsurface_color):
    """创建真实粉笔材质

    粉笔材质特点：
    - 极高粗糙度（近乎完全漫反射）
    - 极低镜面反射
    - 轻微次表面散射（粉笔有一定透光性）
    - 表面有细微颜色变化
    """
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    # 清除默认节点
    for node in nodes:
        nodes.remove(node)

    # ---- 节点树 ----
    # 原理：Principled BSDF 为基础，加 Noise Texture 做颜色微变化

    # 1. 纹理坐标 + 映射
    tex_coord = nodes.new(type='ShaderNodeTexCoord')

    mapping = nodes.new(type='ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (0.5, 0.5, 2.0)
    links.new(tex_coord.outputs['Object'], mapping.inputs['Vector'])

    # 2. 噪声纹理（颜色微变化）
    noise = nodes.new(type='ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 8.0
    noise.inputs['Detail'].default_value = 2.0
    noise.inputs['Roughness'].default_value = 0.5
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    # 3. 颜色渐变（将噪声映射到颜色范围）
    ramp = nodes.new(type='ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.4
    ramp.color_ramp.elements[0].color = (
        max(0, color[0] - params['color_variation']),
        max(0, color[1] - params['color_variation']),
        max(0, color[2] - params['color_variation']),
        1.0
    )
    ramp.color_ramp.elements[1].position = 0.6
    ramp.color_ramp.elements[1].color = (
        min(1, color[0] + params['color_variation'] * 0.5),
        min(1, color[1] + params['color_variation'] * 0.5),
        min(1, color[2] + params['color_variation'] * 0.5),
        1.0
    )
    links.new(noise.outputs['Fac'], ramp.inputs['Fac'])

    # 4. 粗糙度噪声（表面微观不平）
    rough_noise = nodes.new(type='ShaderNodeTexNoise')
    rough_noise.inputs['Scale'].default_value = 15.0
    rough_noise.inputs['Detail'].default_value = 3.0
    rough_noise.inputs['Roughness'].default_value = 0.7
    links.new(mapping.outputs['Vector'], rough_noise.inputs['Vector'])

    # 5. 粗糙度映射
    rough_ramp = nodes.new(type='ShaderNodeValToRGB')
    rough_ramp.color_ramp.elements[0].position = 0.3
    rough_ramp.color_ramp.elements[0].color = (roughness, roughness, roughness, 1.0)
    rough_ramp.color_ramp.elements[1].position = 0.8
    rough_ramp.color_ramp.elements[1].color = (min(1, roughness * 1.05),) * 3 + (1.0,)
    links.new(rough_noise.outputs['Fac'], rough_ramp.inputs['Fac'])

    # 6. Principled BSDF (Blender 4.5 compatible)
    principled = nodes.new(type='ShaderNodeBsdfPrincipled')
    links.new(ramp.outputs['Color'], principled.inputs['Base Color'])
    links.new(rough_ramp.outputs['Color'], principled.inputs['Roughness'])

    # Blender 4.5 renamed inputs — use try/except for compatibility
    try:
        principled.inputs['Specular IOR Level'].default_value = specular
    except KeyError:
        try:
            principled.inputs['Specular'].default_value = specular
        except KeyError:
            pass
    try:
        principled.inputs['Subsurface Weight'].default_value = subsurface
        principled.inputs['Subsurface Radius'].default_value = (0.1, 0.1, 0.1)
    except KeyError:
        try:
            principled.inputs['Subsurface'].default_value = subsurface
            principled.inputs['Subsurface Radius'].default_value = (0.1, 0.1, 0.1)
        except KeyError:
            pass
    principled.inputs['IOR'].default_value = 1.45

    # 7. 输出
    output = nodes.new(type='ShaderNodeOutputMaterial')
    links.new(principled.outputs['BSDF'], output.inputs['Surface'])

    # 保存颜色到材质属性（用于预览）
    mat.diffuse_color = color

    return mat


# ============================================================
# 几何体构建 - 程序化生成粉笔网格
# ============================================================

def build_chalk_mesh(p):
    """使用 bmesh 程序化构建粉笔网格

    网格结构：
    - 沿 Z 轴分布 ring_count 圈顶点
    - 每圈 segments 个顶点，半径沿 Z 轴从 base_radius 渐变到 tip_radius
    - 每圈加入随机偏移（不规则截面）
    - 整体有轻微椭圆度和微弯
    """
    length = p['length']
    base_r = p['base_radius']
    tip_r = p['tip_radius']
    segs = p['segments']
    rings = p['ring_count']
    irregularity = p['irregularity']
    oval_ratio = p['oval_ratio']
    bend = p['bend_amount']

    # 创建 BMesh
    bm = bmesh.new()

    # 预先计算每圈的半径、偏移、弯曲
    verts = []
    for ring_idx in range(rings + 1):
        t = ring_idx / rings  # 0~1，从底部到顶部

        # 半径插值（使用缓动曲线，更自然）
        # 底部稍鼓，顶部稍收缩
        radius_t = t ** 0.85  # 非线性收缩
        r = base_r * (1 - radius_t) + tip_r * radius_t

        # 在每个环上增加一点随机的半径变化（模拟不均匀的挤压成型）
        r *= 1.0 + rand_gauss(0, irregularity * 0.3)

        # 纵向微弯（沿 Y 轴方向的一个小弧线，在中间最大）
        bend_offset = math.sin(t * math.pi) * bend

        for seg_idx in range(segs):
            theta = 2 * math.pi * seg_idx / segs

            # 椭圆截面：X 方向稍长，Y 方向稍短
            # 加上随机偏移使截面不规则
            noise_r = rand_gauss(0, irregularity)
            rx = r * (1.0 / math.sqrt(oval_ratio)) + noise_r
            ry = r * math.sqrt(oval_ratio) + rand_gauss(0, irregularity * 0.7)

            x = rx * math.cos(theta)
            y = ry * math.sin(theta) + bend_offset * (1 + 0.3 * math.cos(theta * 2))
            z = t * length - length * 0.5  # 居中

            # 轻微螺旋扭曲（模拟自然扭曲）
            twist_angle = t * 0.03
            cx = x * math.cos(twist_angle) - y * math.sin(twist_angle)
            cy = x * math.sin(twist_angle) + y * math.cos(twist_angle)
            x, y = cx, cy

            vert = bm.verts.new((x, y, z))
            verts.append(vert)

    # 构建面
    for ring_idx in range(rings):
        for seg_idx in range(segs):
            i0 = ring_idx * segs + seg_idx
            i1 = ring_idx * segs + (seg_idx + 1) % segs
            i2 = (ring_idx + 1) * segs + (seg_idx + 1) % segs
            i3 = (ring_idx + 1) * segs + seg_idx

            try:
                face = bm.faces.new((
                    verts[i0], verts[i1], verts[i2], verts[i3]
                ))
                face.smooth = True
            except ValueError:
                # 可能已存在面，跳过
                pass

    # 封底（底部）
    bottom_verts = [verts[i] for i in range(segs)]
    # 底部中心点稍微凹陷（模拟挤压痕迹）
    center_bottom = bm.verts.new((0, 0, -length * 0.5))
    # 反转法线方向（朝下）
    try:
        bottom_face = bm.faces.new(bottom_verts + [center_bottom])
        bottom_face.normal_flip()
        bottom_face.smooth = True
    except ValueError:
        pass

    # 封顶（顶部 - 书写端）
    top_verts = [verts[rings * segs + i] for i in range(segs)]
    center_top = bm.verts.new((0, 0, length * 0.5))
    try:
        top_face = bm.faces.new(top_verts + [center_top])
        top_face.smooth = True
    except ValueError:
        pass

    # 完成网格
    bm.normal_update()
    mesh = bpy.data.meshes.new("Chalk")
    bm.to_mesh(mesh)
    bm.free()

    return mesh


def build_wear_tip(p, chalk_obj):
    """在书写端模拟磨损面

    通过切割顶部的一部分来模拟使用过的粉笔
    """
    if not p['wear_enabled']:
        return

    wear_angle = p['wear_angle']
    wear_flatness = p['wear_flatness']
    length = p['length']

    # 进入编辑模式
    bpy.context.view_layer.objects.active = chalk_obj
    bpy.ops.object.mode_set(mode='EDIT')

    # 用 BMesh 进行布尔切割
    mesh = bpy.context.edit_object.data
    bm = bmesh.from_edit_mesh(mesh)

    # 创建切割平面：在顶部附近倾斜切割
    # 平面法向量：稍微偏离 Z 轴
    cut_z = length * 0.5 - length * 0.12 * wear_flatness  # 切掉顶部一小部分
    tilt_x = math.sin(wear_angle) * 0.3
    tilt_y = math.cos(wear_angle) * 0.2

    # 使用 bisect 平面切割
    # 平面经过点 (0, 0, cut_z)，法向量 (tilt_x, tilt_y, 1)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    result = bmesh.ops.bisect_plane(
        bm,
        geom=geom,
        plane_co=(0, 0, cut_z),
        plane_no=(tilt_x, tilt_y, 1.0),
        clear_outer=True,  # 删除切割平面以上的部分
        clear_inner=False,
    )

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    # 封口（用切割产生的新边生成面）
    # 收集切割产生的边
    cut_edges = [e for e in bm.edges if e.is_boundary and e.select]
    if cut_edges:
        bmesh.ops.edgeloop_fill(bm, edges=cut_edges)

    bmesh.update_edit_mesh(mesh)
    bpy.ops.object.mode_set(mode='OBJECT')


def add_dust_particles(p, chalk_obj):
    """在粉笔表面添加粉尘粒子"""
    if not p['dust_enabled']:
        return

    dust_amount = p['dust_amount']
    dust_radius = p['dust_radius']
    length = p['length']
    base_r = p['base_radius']
    tip_r = p['tip_radius']

    # 创建粉尘粒子集合
    dust_parts = []
    for i in range(dust_amount):
        # 随机位置：在粉笔表面附近
        t = _rng.random()  # 0~1 沿长度
        # 更多粉尘在书写端
        if _rng.random() < 0.6:
            t = 0.6 + _rng.random() * 0.4  # 集中在顶部 40%

        # 计算该位置的粉笔半径
        radius_t = t ** 0.85
        r = base_r * (1 - radius_t) + tip_r * radius_t
        r *= 1.0 + rand_gauss(0, p['irregularity'] * 0.3)

        # 角度
        theta = _rng.random() * 2 * math.pi
        # 粉尘略微突出表面
        dist = r + rand_range(0, dust_radius * 2)
        x = dist * math.cos(theta)
        y = dist * math.sin(theta) + math.sin(t * math.pi) * p['bend_amount']
        z = t * length - length * 0.5

        # 小粉尘粒子用极小立方体或球体
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=dust_radius * rand_range(0.5, 1.5),
            location=(x, y, z),
            segments=4,
            ring_count=4
        )
        dust = bpy.context.active_object
        dust.name = f"Dust_{i:03d}"

        # 轻微随机缩放
        scale = rand_range(0.5, 1.8)
        dust.scale = (scale, scale, scale)

        dust_parts.append(dust)

    # 合并所有粉尘粒子为一个对象
    if dust_parts:
        for obj in dust_parts:
            obj.select_set(True)
        chalk_obj.select_set(False)
        bpy.context.view_layer.objects.active = dust_parts[0]
        bpy.ops.object.join()
        dust_mesh = bpy.context.active_object
        dust_mesh.name = "ChalkDust"
        return dust_mesh

    return None


def add_surface_displacement(p, chalk_obj):
    """添加表面位移修饰器（粉笔的微观凹凸纹理）"""
    # 创建纹理 - 使用云絮纹理模拟粉笔表面
    tex = bpy.data.textures.new(name="ChalkSurface", type='CLOUDS')
    tex.noise_scale = p['texture_scale'] * 0.5
    tex.noise_depth = 2

    # 添加位移修饰器
    disp = chalk_obj.modifiers.new(name="ChalkDisplacement", type='DISPLACE')
    disp.texture = tex
    disp.texture_coords = 'OBJECT'
    disp.strength = p['surface_roughness'] * 0.003
    disp.mid_level = 0.5

    return disp


# ============================================================
# 主构建函数
# ============================================================

def build_chalk():
    """构建粉笔模型"""
    p = params

    print("=" * 50)
    print("Building 粉笔 (Chalk)...")
    print(f"  Length: {p['length']}, Base R: {p['base_radius']}, Tip R: {p['tip_radius']}")
    print(f"  Color: {p['color']}")
    print(f"  Irregularity: {p['irregularity']}, Bend: {p['bend_amount']}")
    print("=" * 50)

    # 初始化随机种子
    seed_rng(42)

    # ---- 主网格 ----
    mesh = build_chalk_mesh(p)
    chalk_obj = bpy.data.objects.new("Chalk", mesh)
    bpy.context.collection.objects.link(chalk_obj)
    chalk_obj.select_set(True)
    bpy.context.view_layer.objects.active = chalk_obj

    # ---- 细分修饰器 ----
    subdiv = chalk_obj.modifiers.new(name="Subdivision", type='SUBSURF')
    subdiv.levels = p['subdivision_levels']
    subdiv.render_levels = p['subdivision_levels']
    subdiv.quality = 3
    subdiv.uv_smooth = 'PRESERVE_CORNERS'

    # ---- 表面位移 ----
    add_surface_displacement(p, chalk_obj)

    # ---- 书写端磨损 ----
    # 先应用细分，再做磨损切割（否则细分后切割面不平整）
    # 更可靠的方式：在细分后做切割
    # 让用户选择是否应用修饰器
    # 我们用一种更简单的方式：直接在原始网格上切割，然后加细分
    bpy.context.view_layer.objects.active = chalk_obj
    bpy.ops.object.modifier_apply(modifier="Subdivision")
    build_wear_tip(p, chalk_obj)

    # ---- 再细分一次（切割后平滑） ----
    # 磨损切割后，边缘可能不平滑，加一个细分
    subdiv2 = chalk_obj.modifiers.new(name="Subdivision", type='SUBSURF')
    subdiv2.levels = 1
    subdiv2.render_levels = 1
    subdiv2.quality = 2

    # ---- 材质 ----
    color = p['color']
    chalk_mat = make_chalk_material(
        "ChalkMat",
        color,
        p['roughness'],
        p['specular'],
        p['subsurface'],
        p['subsurface_color'],
    )
    assign_material(chalk_obj, chalk_mat)

    # …… 应用细分让切割面平滑
    bpy.ops.object.modifier_apply(modifier="Subdivision")

    # ---- 平滑着色 ----
    if p['shade_smooth']:
        bpy.ops.object.shade_smooth()

    all_parts = [chalk_obj]

    # ---- 粉尘 ----
    dust_obj = add_dust_particles(p, chalk_obj)
    if dust_obj:
        # 给粉尘也分配同样的材质
        assign_material(dust_obj, chalk_mat)
        all_parts.append(dust_obj)

    parts_count = len(all_parts) + (1 if dust_obj else 0)
    # 重复计数，修正
    parts_count = len(all_parts)

    print(f"  Created {parts_count} objects")
    print(f"  Vertices: {len(mesh.vertices)}")
    print(f"  Faces: {len(mesh.polygons)}")

    return all_parts


# ============================================================
# 场景设置
# ============================================================

def setup_scene():
    """设置场景"""
    scene = bpy.context.scene
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1920
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True

    # 背景色
    scene.world.use_nodes = False
    scene.world.color = (0.92, 0.92, 0.95)

    # 添加环境光
    bpy.ops.object.light_add(type='AREA', location=(5, -5, 8))
    area_light = bpy.context.active_object
    area_light.data.energy = 300
    area_light.data.color = (1.0, 0.98, 0.95)

    # 补充背光
    bpy.ops.object.light_add(type='AREA', location=(-3, 4, 3))
    back_light = bpy.context.active_object
    back_light.data.energy = 100
    back_light.data.color = (0.9, 0.92, 1.0)

    # 主光
    bpy.ops.object.light_add(type='SUN', location=(5, 3, 10))
    sun = bpy.context.active_object
    sun.data.energy = 1.5
    sun.data.angle = 0.05


# ============================================================
# 导出
# ============================================================

def export_glb(output_path):
    """导出 GLB 文件"""
    if not output_path:
        output_path = "//chalk.glb"

    # 确保输出目录存在
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # 启用 glTF 导出插件
    bpy.ops.preferences.addon_enable(module='io_scene_gltf2')

    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        export_materials='EXPORT',
        export_image_format='JPEG',
        export_texcoords=True,
        export_normals=True,
        export_draco_mesh_compression_enable=False,
    )

    print(f"\n✅ Exported to: {output_path}")


# ============================================================
# 入口
# ============================================================

if __name__ == "__main__":
    parse_args()

    clean_scene()

    parts = build_chalk()

    setup_scene()

    output = params.get('output_path', '//chalk.glb')
    export_glb(output)

    print(f"\n🎉 粉笔建模完成！")
    print(f"   对象数: {len(parts)}")
    print(f"   输出文件: {output}")