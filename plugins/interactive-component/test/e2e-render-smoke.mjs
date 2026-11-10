// e2e 冒烟准备：走真实 MCP server 渲染一个 three.js 场景产物，
// 把产物 index.html 复制到冒烟目录，供默认浏览器沙箱 iframe 加载。
// 用法: node test/e2e-render-smoke.mjs <outDir>
'use strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = process.argv[2] || mkdtempSync(join(tmpdir(), 'ic-e2e-'))
const SERVER = resolve(fileURLToPath(new URL('../mcp/server.js', import.meta.url)))

// AI 视角的 three.js 场景（用户 HTML；全局 THREE 来自 libs 注入）
const USER_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>e2e-three</title>
<style>html,body{margin:0;height:100%;background:#101418;color:#e8e8ea;font:12px ui-monospace,monospace;overflow:hidden}
#c{width:100%;height:100%;display:block}
#probe{position:fixed;left:8px;bottom:8px;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:6px;white-space:pre-wrap;max-width:70%}</style>
</head><body>
<canvas id="c"></canvas>
<pre id="probe">booting…</pre>
<script>
// ── 用户代码：three.js 场景 + 探针回报（全局 THREE 由 libs 注入）──
(function(){
  var P = []
  function probe(n, ok, d){ P.push({n:n,ok:!!ok,d:String(d==null?'':d)}); render(); try{parent.postMessage({__p:{n:n,ok:!!ok,d:String(d==null?'':d)}},'*')}catch(e){} }
  function render(){ document.getElementById('probe').textContent = P.map(function(x){return (x.ok?'✅':'❌')+' '+x.n+(x.d?' · '+x.d:'')}).join('\\n') }
  try { localStorage.setItem('x','1'); probe('localStorage', true) } catch(e){ probe('localStorage-blocked', false, e.name) }
  var cnv = document.getElementById('c')
  var gl = cnv.getContext('webgl2')
  probe('webgl2', !!gl, gl && gl.getParameter(gl.VERSION))
  probe('three-global', typeof window.THREE === 'object' && typeof window.THREE.WebGLRenderer === 'function', 'r' + (window.THREE && window.THREE.REVISION))
  probe('addons', !!(window.THREE_ADDONS && window.THREE_ADDONS.OrbitControls))
  var frames = 0
  try {
    var T = window.THREE
    var renderer = new T.WebGLRenderer({ canvas: cnv, antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(innerWidth, innerHeight, false)
    var scene = new T.Scene(); scene.background = new T.Color(0x101418)
    var cam = new T.PerspectiveCamera(55, innerWidth/innerHeight, .1, 100); cam.position.set(2.6,2,3.4)
    var ctl = new window.THREE_ADDONS.OrbitControls(cam, cnv); ctl.enableDamping = true
    scene.add(new T.HemisphereLight(0x8899bb, 0x223322, .9))
    var dl = new T.DirectionalLight(0xffffff, 2.2); dl.position.set(3,5,2); scene.add(dl)
    var cube = new T.Mesh(new T.BoxGeometry(1.2,1.2,1.2), new T.MeshStandardMaterial({color:0x22d3ee, metalness:.4, roughness:.25}))
    scene.add(cube)
    var ground = new T.Mesh(new T.PlaneGeometry(8,8), new T.MeshStandardMaterial({color:0x1f2937, roughness:.9}))
    ground.rotation.x = -Math.PI/2; ground.position.y = -.9; scene.add(ground)
    // click-to-lock（游戏标准交互）
    cnv.addEventListener('click', function(){ try{ var r = cnv.requestPointerLock(); if (r && r.catch) r.catch(function(){}) }catch(e){} })
    document.addEventListener('pointerlockchange', function(){ probe('pointerlock', !!document.pointerLockElement, document.pointerLockElement ? 'locked' : 'unlocked') })
    ;(function tick(){ cube.rotation.y += .01; ctl.update(); renderer.render(scene, cam); frames++; if (frames < 600) requestAnimationFrame(tick) })()
    probe('scene-ok', true)
  } catch (e) { probe('scene-err', false, e.name + ': ' + e.message) }
  setTimeout(function(){
    try { var du = cnv.toDataURL('image/png'); probe('canvas-content', du.length > 9000, 'len=' + du.length) } catch(e){ probe('canvas-content', false, e.name) }
    probe('raf-frames', frames > 30, 'frames=' + frames)
    try { parent.postMessage({__done:true},'*') } catch(e){}
  }, 1800)
})()
</script>
</body></html>`

const req = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'render_component', arguments: { title: 'e2e-three', html: USER_HTML, libs: ['three'] } } })

const p = spawn('node', [SERVER, mkdtempSync(join(tmpdir(), 'ic-e2e-cfg-')), ''], { stdio: ['pipe', 'pipe', 'pipe'] })
let out = ''
p.stdout.on('data', (d) => (out += d))
p.stderr.on('data', (d) => console.error('[server]', String(d)))
p.stdin.write(req + '\n')
p.stdin.end()
p.on('exit', (code) => {
  const line = out.split('\n').find((l) => l.includes('"id":1'))
  if (!line) { console.error('no response'); process.exit(1) }
  const res = JSON.parse(line).result
  if (res.isError) { console.error('MCP error:', res.content[0].text); process.exit(1) }
  const artifact = res.structuredContent
  console.log('previewId:', artifact.previewId)
  console.log('libs:', JSON.stringify(artifact.libs))
  console.log('html bytes:', Buffer.byteLength(artifact.html))
  mkdirSync(outDir, { recursive: true })
  // 产物原样落冒烟目录（这就是 AI 交付的最终 html——端到端对象）
  writeFileSync(join(outDir, 'artifact.html'), artifact.html)
  console.log('written:', join(outDir, 'artifact.html'))
  console.log('OUTDIR=' + outDir)
})
