// tcp-final.mjs — 最终验证：最小建模（不重置场景）→ 截图
// 关键：不用 read_factory_settings（会把 addon server 搞崩），在当前场景直接加元素
import net from 'node:net';
import fs from 'node:fs';

function sendCmd(type, params = {}) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: '127.0.0.1', port: 9876 });
    let data = '';
    sock.on('error', (e) => reject(new Error(type + ' connect err: ' + e.message)));
    sock.on('data', (c) => {
      data += c.toString();
      try { const j = JSON.parse(data); sock.destroy(); resolve(j); } catch {}
    });
    sock.write(JSON.stringify({ type, params }) + '\n');
    setTimeout(() => { sock.destroy(); reject(new Error('timeout ' + type)); }, 45_000);
  });
}

async function main() {
  // 1. ping 确认 server 活着
  try {
    const p = await sendCmd('ping', {});
    console.log('[ping]', p.status, p.result ? JSON.stringify(p.result) : p.message);
  } catch (e) { console.error('[ping ERR]', e.message); }

  // 2. 建模：直接加猴子头（不清空场景，避免 read_factory_settings 崩 server）
  const code = `import bpy
# 先清掉默认 Cube（选择性删除，不用 read_factory_settings）
if "Cube" in bpy.data.objects:
    bpy.data.objects.remove(bpy.data.objects["Cube"], do_unlink=True)
bpy.ops.mesh.primitive_monkey_add(size=2, location=(0,0,0))
bpy.ops.object.shade_smooth()
mat = bpy.data.materials.new("M"); mat.diffuse_color=(0.8,0.45,0.2,1)
bpy.context.object.data.materials.append(mat)
bpy.ops.mesh.primitive_plane_add(size=10, location=(0,0,-2))
g=bpy.context.object; gm=bpy.data.materials.new("G"); gm.diffuse_color=(0.5,0.5,0.58,1); g.data.materials.append(gm)
# 相机
bpy.ops.object.camera_add(location=(6,-6,4)); cam=bpy.context.object; cam.rotation_euler=(1.05,0,0.785); bpy.context.scene.camera=cam
# 光
bpy.ops.object.light_add(type='SUN', location=(0,0,10)); bpy.context.object.data.energy=3
print("SUZANNE_READY")`;
  try {
    const b = await sendCmd('execute_code', { code });
    if (b.status === 'success') console.log('[build] OK:', JSON.stringify(b.result).slice(0, 120));
    else console.log('[build] ERR:', b.message);
  } catch (e) { console.error('[build ERR]', e.message); }

  // 3. 截图（get_viewport_screenshot）
  try {
    const shot = await sendCmd('get_viewport_screenshot', { filepath: 'D:/space/base/Polaris-plugin/plugins/animation-3d/out/mcp_look_suzanne.png', max_size: 800, format: 'png' });
    const r = shot.result || {};
    const b64 = null; // 现在截图直接落盘，不需要 base64
    if (b64) {
      fs.writeFileSync('out/mcp_look_suzanne.png', Buffer.from(b64, 'base64'));
      console.log('[screenshot] saved out/mcp_look_suzanne.png (' + Math.round(b64.length/1024) + 'KB)');
    } else {
      console.log('[screenshot] raw keys:', Object.keys(r), JSON.stringify(shot).slice(0, 200));
    }
  } catch (e) { console.error('[shot ERR]', e.message); }
  process.exit(0);
}
main();
