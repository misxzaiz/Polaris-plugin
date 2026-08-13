"""AI 3D Modeling - 真实鱼类建模 v2：低多边形 + 小体积 GLB"""
import bpy, bmesh, sys, os, json, math, struct, zlib
from mathutils import Vector

params = {
    "body_length": 1.2, "body_radius": 0.32, "body_flatten": 0.55,
    "body_color": (0.78, 0.68, 0.32), "belly_color": (0.95, 0.88, 0.6),
    "head_radius": 0.22, "head_flatten": 0.6,
    "eye_size": 0.055, "eye_color": (0.08, 0.08, 0.08),
    "eye_offset_x": 0.42, "eye_offset_y": 0.18,
    "tail_fin_size": 0.22, "tail_fin_length": 0.18, "tail_fin_color": (0.75, 0.55, 0.2),
    "dorsal_fin_height": 0.16, "dorsal_fin_length": 0.35,
    "anal_fin_size": 0.07, "pectoral_fin_size": 0.12, "pelvic_fin_size": 0.09,
    "fin_color": (0.62, 0.48, 0.18),
    "scale_enabled": True, "scale_rings": 5, "scale_per_ring": 8, "scale_size": 0.02,
    "scale_color": (0.85, 0.75, 0.4),
    "texture_size": 128, "texture_seed": 77,
}

def parse_args():
    a = sys.argv
    if '--' not in a: return
    i = a.index('--'); args = a[i+1:]
    for j, arg in enumerate(args):
        if arg.startswith('--') and j+1 < len(args) and not args[j+1].startswith('--'):
            k = arg[2:]; v = args[j+1]
            if k == 'output': params['output_path'] = v
            elif k == 'params':
                try: params.update(json.loads(v))
                except: pass

def clean():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for b in list(bpy.data.meshes): bpy.data.meshes.remove(b)
    for b in list(bpy.data.materials): bpy.data.materials.remove(b)
    for b in list(bpy.data.images): bpy.data.images.remove(b)

def make_mat(name, color, rough=0.4, specular=0.5):
    m = bpy.data.materials.new(name=name); m.use_nodes = True
    for n in m.node_tree.nodes: m.node_tree.nodes.remove(n)
    p = m.node_tree.nodes.new(type='ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = color + (1.0,) if len(color)==3 else color
    p.inputs['Roughness'].default_value = rough
    p.inputs['Specular IOR Level'].default_value = specular
    o = m.node_tree.nodes.new(type='ShaderNodeOutputMaterial')
    m.node_tree.links.new(p.outputs['BSDF'], o.inputs['Surface'])
    return m

def make_fin_mat(name, color):
    m = bpy.data.materials.new(name=name); m.use_nodes = True
    for n in m.node_tree.nodes: m.node_tree.nodes.remove(n)
    p = m.node_tree.nodes.new(type='ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = color + (1.0,) if len(color)==3 else color
    p.inputs['Roughness'].default_value = 0.5
    p.inputs['Transmission Weight'].default_value = 0.7
    p.inputs['IOR'].default_value = 1.35
    o = m.node_tree.nodes.new(type='ShaderNodeOutputMaterial')
    m.node_tree.links.new(p.outputs['BSDF'], o.inputs['Surface'])
    return m

def _hash(x, y, s):
    h = s + x*374761393 + y*668265263; h = (h^(h>>13))*1274126177; return (h^(h>>16))&0xffffffff

def _noise(x, y, s):
    ix,iy=int(math.floor(x)),int(math.floor(y)); fx,fy=x-ix,y-iy
    sx=fx*fx*(3-2*fx); sy=fy*fy*(3-2*fy)
    v00=_hash(ix,iy,s)/0xffffffff; v10=_hash(ix+1,iy,s)/0xffffffff
    v01=_hash(ix,iy+1,s)/0xffffffff; v11=_hash(ix+1,iy+1,s)/0xffffffff
    return v00+(v10-v00)*sx+(v01-v00)*sy+(v11-v10-v01+v00)*sx*sy

def gen_texture(size=128, seed=77):
    px = bytearray()
    for py in range(size):
        for px_i in range(size):
            u = px_i/size; v = py/size
            sx = (u-0.5)*20; sy = (v-0.5)*10
            sp = 0.5+0.5*math.sin(sx*math.pi)*math.sin(sy*math.pi*0.5)
            vert = 1.0-v
            n = _noise(u*16, v*16, seed)*0.1
            val = vert*0.6+sp*0.3+n*0.1
            r=int(max(0,min(255,(0.55+0.25*val)*255)))
            g=int(max(0,min(255,(0.45+0.20*val)*255)))
            b=int(max(0,min(255,(0.15+0.15*val)*255)))
            px.extend([r,g,b,255])
    return bytes(px)

def make_png(px, w, h):
    def chunk(ctype, data):
        c=ctype+data; crc=struct.pack('>I',zlib.crc32(c)&0xffffffff); return struct.pack('>I',len(data))+c+crc
    raw=b'\x89PNG\r\n\x1a\n'
    raw+=chunk(b'IHDR', struct.pack('>IIBBBBB',w,h,8,6,0,0,0))
    rd=b''
    for y in range(h): rd+=b'\x00'+bytes(px[y*w*4:(y+1)*w*4])
    raw+=chunk(b'IDAT', zlib.compress(rd)); raw+=chunk(b'IEND', b'')
    return raw

def make_tex_mat(name, pixels, w, h):
    od = os.path.abspath(os.path.dirname(params.get('output_path','//fish.glb')) or '.')
    pp = os.path.join(od, name+'.png')
    with open(pp,'wb') as f: f.write(make_png(pixels,w,h))
    img = bpy.data.images.load(pp, check_existing=True); img.name = name+'_tex'
    m = bpy.data.materials.new(name=name); m.use_nodes = True
    for n in m.node_tree.nodes: m.node_tree.nodes.remove(n)
    tn = m.node_tree.nodes.new(type='ShaderNodeTexImage'); tn.image=img
    tn.interpolation='Linear'; tn.projection='FLAT'
    pr = m.node_tree.nodes.new(type='ShaderNodeBsdfPrincipled')
    pr.inputs['Roughness'].default_value=0.4
    o = m.node_tree.nodes.new(type='ShaderNodeOutputMaterial')
    m.node_tree.links.new(tn.outputs['Color'], pr.inputs['Base Color'])
    m.node_tree.links.new(pr.outputs['BSDF'], o.inputs['Surface'])
    return m

# Low-poly primitives: no subdivision
def sphere(r, loc, name='m'):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=12, ring_count=8)
    o=bpy.context.active_object; o.name=name
    return o

def cone(r, d, loc, rot=(0,0,0), name='m'):
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=0, depth=d, location=loc, vertices=8)
    o=bpy.context.active_object; o.name=name; o.rotation_euler=rot
    return o

def cyl(r, d, loc, rot=(0,0,0), name='m'):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d, location=loc, vertices=8)
    o=bpy.context.active_object; o.name=name; o.rotation_euler=rot
    return o

def assign(o, m):
    if o.data.materials: o.data.materials[0]=m
    else: o.data.materials.append(m)

def flatten(o, axis='z', f=0.5):
    idx='xyz'.index(axis); bm=bmesh.new(); bm.from_mesh(o.data)
    for v in bm.verts: v.co[idx]*=f
    bm.to_mesh(o.data); bm.free()

def build_fish():
    p=params; print("="*50)
    print("Building 真实鱼类 v2 (low-poly)...")
    print("="*50)

    print("  Generating scale texture...")
    ts=p['texture_size']; tex=gen_texture(ts, p['texture_seed'])
    print(f"    Done: {ts}x{ts}")

    body_mat=make_tex_mat("BodyMat", tex, ts, ts)
    belly_mat=make_mat("BellyMat", p['belly_color'], 0.5, 0.6)
    fin_mat=make_fin_mat("FinMat", p['fin_color'])
    tail_mat=make_fin_mat("TailFinMat", p['tail_fin_color'])
    eye_mat=make_mat("EyeMat", p['eye_color'], 0.1, 1.0)
    scale_mat=make_mat("ScaleMat", p['scale_color'], 0.5, 0.6)

    bl=p['body_length']; br=p['body_radius']; hr=p['head_radius']; hl=bl/2
    parts=[]

    # Body
    body=sphere(br, (0,0,0), "Fish_Body")
    body.scale=(bl/(2*br), 1.0, p['body_flatten']); assign(body, body_mat); parts.append(body)

    # Belly
    belly=sphere(br*0.7, (0,0,-br*0.4*p['body_flatten']), "Fish_Belly")
    belly.scale=(bl/(3*br*0.7), 1.0, 0.3)
    bm=bmesh.new(); bm.from_mesh(belly.data)
    rm=[f for f in bm.faces if all(v.co.z>0 for v in f.verts)]
    bmesh.ops.delete(bm, geom=rm, context='FACES'); bm.to_mesh(belly.data); bm.free()
    assign(belly, belly_mat); parts.append(belly)

    # Head
    hx=hl*0.55
    head=cone(hr, hr*1.2, (hx,0,0), (0,math.radians(90),0), "Fish_Head")
    flatten(head, 'z', p['head_flatten']); assign(head, body_mat); parts.append(head)

    # Mouth
    mx=hl*0.55+hr*0.9
    mouth=cyl(0.02, 0.06, (mx,0,-0.02), (math.radians(45),0,0), "Fish_Mouth")
    mouth.scale=(0.5,1,1); assign(mouth, belly_mat); parts.append(mouth)

    # Eyes
    for s in [-1,1]:
        eye=sphere(p['eye_size'], (hx*0.7+p['eye_offset_x']*0.4, s*p['eye_offset_y'], br*0.35), f"Fish_Eye_{s}")
        assign(eye, eye_mat); parts.append(eye)

    # Tail (forked)
    for s in [-1,1]:
        tail=cone(p['tail_fin_size'], 0.01, (-hl,0,0), (0,0,0), f"Fish_Tail_{s}")
        flatten(tail, 'z', 0.05); tail.scale=(p['tail_fin_length'],1,1)
        tail.rotation_euler=(math.radians(90), math.radians(20), math.radians(s*25))
        assign(tail, tail_mat); parts.append(tail)

    # Dorsal fin
    dorsal=cone(p['dorsal_fin_length']*0.4, p['dorsal_fin_height'],
                (-bl*0.05, 0, br*p['body_flatten']), (0,0,0), "Fish_Dorsal")
    dorsal.scale=(p['dorsal_fin_length'],1,1); dorsal.rotation_euler=(0,math.radians(30),0)
    assign(dorsal, fin_mat); parts.append(dorsal)

    # Anal fin
    anal=cone(p['anal_fin_size']*0.5, p['anal_fin_size'],
              (-bl*0.2, 0, -br*0.4*p['body_flatten']), (0,0,0), "Fish_Anal")
    anal.scale=(p['anal_fin_size']*1.5,1,1); anal.rotation_euler=(0,math.radians(-30),0)
    assign(anal, fin_mat); parts.append(anal)

    # Pectoral fins (pair)
    for s in [-1,1]:
        pec=cone(p['pectoral_fin_size']*0.5, p['pectoral_fin_size']*0.8,
                 (hl*0.25, s*br*0.4, -br*0.1*p['body_flatten']), (0,0,0), f"Fish_Pec_{s}")
        pec.scale=(p['pectoral_fin_size'],1,1); pec.rotation_euler=(math.radians(90),0,math.radians(s*30))
        assign(pec, fin_mat); parts.append(pec)

    # Pelvic fins (pair)
    for s in [-1,1]:
        pel=cone(p['pelvic_fin_size']*0.5, p['pelvic_fin_size']*0.7,
                 (hl*0.05, s*br*0.35, -br*0.5*p['body_flatten']), (0,0,0), f"Fish_Pel_{s}")
        pel.scale=(p['pelvic_fin_size'],1,1); pel.rotation_euler=(0,math.radians(-20),0)
        assign(pel, fin_mat); parts.append(pel)

    # Scales - use flat cones (discs) instead of spheres, no subdivision
    if p['scale_enabled']:
        for ring in range(1, p['scale_rings']+1):
            theta=math.radians(10+ring*14); st,ct=math.sin(theta),math.cos(theta)
            for k in range(p['scale_per_ring']):
                phi=2*math.pi*k/p['scale_per_ring']
                lx=hl*0.8*st; ly=br*st*math.cos(phi); lz=br*st*math.sin(phi)*p['body_flatten']
                if lz < br*0.05*p['body_flatten']: continue
                norm=Vector((st/(hl*0.8), math.cos(phi)/br, math.sin(phi)/(br/p['body_flatten']))).normalized()
                sc=cone(p['scale_size']*1.5, p['scale_size']*0.3, (lx,ly,lz), (0,0,0), f"Scale_{ring}_{k}")
                flatten(sc, 'z', 0.1)
                if norm.z!=0: sc.rotation_euler=(math.atan2(-norm.x,norm.z),0,-math.atan2(-norm.x,norm.y))
                else: sc.rotation_euler=(0,0,-math.atan2(norm.x,norm.y))
                assign(sc, scale_mat); parts.append(sc)

    print(f"  Created {len(parts)} parts")
    return parts

def setup():
    sc=bpy.context.scene; sc.render.resolution_x=1920; sc.render.resolution_y=1920
    sc.render.resolution_percentage=100; sc.render.film_transparent=True
    sc.world.use_nodes=False; sc.world.color=(0.85,0.92,1.0)

def export(op):
    if not op: op="//fish.glb"
    od=os.path.dirname(op)
    if od and not os.path.exists(od): os.makedirs(od)
    bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
    bpy.ops.export_scene.gltf(filepath=op, export_format='GLB', export_materials='EXPORT',
        export_image_format='JPEG', export_texcoords=True, export_normals=True,
        export_draco_mesh_compression_enable=False, export_animations=True, export_skins=True)
    print(f"\nExported to: {op}")

if __name__=="__main__":
    parse_args(); clean()
    parts=build_fish(); setup()
    op=params.get('output_path','//fish.glb'); export(op)
    print(f"\nFish modeling done! Total parts: {len(parts)}")