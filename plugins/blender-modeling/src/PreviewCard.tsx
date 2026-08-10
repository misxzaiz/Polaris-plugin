/**
 * Blender 3D 建模聊天卡片
 *
 * 渲染 MCP 工具结果：
 * - blender_generate_3d：模型生成结果 → 自包含 HTML 预览（侧通道异步加载 GLB）
 * - blender_list_models：列出可用建模脚本
 *
 * 核心架构（v3）：
 * - 侧通道加载：MCP 只返回 token（~200B），前端异步 fetch GLB base64
 * - AI 上下文不读 1.3MB base64，仅见 token
 * - 自包含 HTML（srcDoc）：对话结束仍可查看
 * - 全屏按钮（sandbox allow-popups）
 * - GLB 下载
 * - CDN 加载失败 fallback
 * - 远程模式降级提示
 *
 * data 格式：MCP server 返回的 content[0].text 是 JSON 字符串
 */

import { createElement, useMemo, useCallback, useRef, useEffect, useState } from 'react'

function parseData(data) {
  if (!data || typeof data !== 'object') return null
  if (data.content && Array.isArray(data.content) && data.content[0]?.text) {
    try {
      return JSON.parse(data.content[0].text)
    } catch {
      return null
    }
  }
  return data
}

/**
 * 生成自包含的 3D 预览 HTML
 * 内嵌 Three.js（CDN）+ GLB base64 数据 + CDN fallback
 */
function generatePreviewHtml(glbDataUri, scriptName, parts) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>3D 模型预览</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #eee; overflow: hidden; }
  #container { width: 100vw; height: 100vh; display: block; }
  #toolbar {
    position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 8px; align-items: center;
    background: rgba(0,0,0,0.6); backdrop-filter: blur(12px);
    padding: 10px 18px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);
  }
  #toolbar button {
    background: rgba(255,255,255,0.1); border: none; color: #fff;
    padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all 0.2s;
  }
  #toolbar button:hover { background: rgba(255,255,255,0.2); }
  #toolbar button.active { background: #4a9eff; }
  #toolbar button.fullscreen { background: #4a9eff33; }
  #info {
    position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.5); backdrop-filter: blur(8px);
    padding: 8px 20px; border-radius: 20px; font-size: 13px; color: #aaa; pointer-events: none;
  }
  #loading {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    text-align: center; color: #888;
  }
  #loading .spinner {
    width: 40px; height: 40px; margin: 0 auto 16px;
    border: 3px solid rgba(255,255,255,0.1); border-top-color: #4a9eff; border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  #loading.hidden { display: none; }
  #loading.error { color: #f66; }
  #loading.error .spinner { display: none; }
  @media (max-width: 480px) {
    #toolbar { padding: 6px 10px; gap: 4px; }
    #toolbar button { padding: 6px 10px; font-size: 11px; }
    #info { font-size: 11px; padding: 4px 12px; }
  }
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div><div>加载模型...</div></div>
<div id="info">🖱 拖拽旋转 · 滚轮缩放 · 右键平移</div>
<div id="container"></div>
<div id="toolbar">
  <button id="btnReset">⟲ 复位</button>
  <button id="btnWireframe">◇ 线框</button>
  <button id="btnAutoRotate">⟳ 自转</button>
  <span style="width:1px;height:24px;background:rgba(255,255,255,0.15);margin:0 4px;"></span>
  <button id="btnFullscreen" class="fullscreen">⛶ 全屏</button>
</div>
<script>
// CDN 加载失败 fallback
window.__THREE_LOAD_FAILED = false;
</script>
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  }
}
</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loadingEl = document.getElementById('loading');
const container = document.getElementById('container');

if (typeof THREE === 'undefined') {
  loadingEl.innerHTML = '<div class="error">⚠️ 预览组件加载失败，请检查网络连接后重试</div>';
  throw new Error('Three.js 加载失败');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(0, 1.5, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.5, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.5;
controls.maxDistance = 10;
controls.enablePan = true;
controls.touchRotate = true;
controls.touchZoom = true;
controls.touchPan = true;

const ambient = new THREE.AmbientLight(0x404060, 0.5);
scene.add(ambient);
const mainLight = new THREE.DirectionalLight(0xffeedd, 2.5);
mainLight.position.set(4, 6, 3);
mainLight.castShadow = true;
scene.add(mainLight);
const fillLight = new THREE.DirectionalLight(0x8888ff, 0.8);
fillLight.position.set(-3, 2, -2);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
rimLight.position.set(0, 1, -5);
scene.add(rimLight);
const hemiLight = new THREE.HemisphereLight(0x8888ff, 0x444422, 0.6);
scene.add(hemiLight);

const groundGeo = new THREE.PlaneGeometry(8, 8);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.3;
ground.receiveShadow = true;
scene.add(ground);

const gridHelper = new THREE.GridHelper(4, 8, 0x6666aa, 0x444466);
gridHelper.position.y = -0.3;
scene.add(gridHelper);

let model = null;
let autoRotate = false;

const loader = new GLTFLoader();
loader.load('${glbDataUri}', (gltf) => {
  model = gltf.scene;
  scene.add(model);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const minY = box.min.y;
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= minY;
  if (maxDim > 3) model.scale.setScalar(3 / maxDim);
  controls.target.set(0, size.y / 2, 0);
  camera.position.set(0, size.y * 0.7, maxDim * 2.2);
  controls.update();
  model.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
  if (gltf.animations && gltf.animations.length > 0) {
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(gltf.animations[0]);
    action.play();
    const clock = new THREE.Clock();
    const origAnimate = animate;
    animate = function() { const d = clock.getDelta(); mixer.update(d); origAnimate(); };
  }
  loadingEl.classList.add('hidden');
}, (xhr) => {
  if (xhr.total) { const pct = Math.round((xhr.loaded / xhr.total) * 100); loadingEl.innerHTML = '<div class=\"spinner\"></div><div>加载中 ' + pct + '%</div>'; }
}, (error) => {
  loadingEl.innerHTML = '<div class="error">⚠️ 模型加载失败</div>';
});

function animate() {
  requestAnimationFrame(animate);
  if (autoRotate) {
    const pivot = controls.target;
    const radius = camera.position.distanceTo(pivot);
    const angle = performance.now() / 10000;
    camera.position.x = pivot.x + radius * Math.sin(angle);
    camera.position.z = pivot.z + radius * Math.cos(angle);
    camera.lookAt(pivot);
  }
  controls.update();
  renderer.render(scene, camera);
}
animate();

document.getElementById('btnReset').addEventListener('click', () => { camera.position.set(0, 1.5, 4); controls.target.set(0, 0.5, 0); controls.update(); });
document.getElementById('btnWireframe').addEventListener('click', () => {
  const btn = document.getElementById('btnWireframe');
  const isWire = btn.classList.toggle('active');
  if (model) model.traverse(child => { if (child.isMesh) child.material.wireframe = isWire; });
});
document.getElementById('btnAutoRotate').addEventListener('click', () => {
  autoRotate = !autoRotate;
  document.getElementById('btnAutoRotate').classList.toggle('active', autoRotate);
});
document.getElementById('btnFullscreen').addEventListener('click', () => {
  if (document.fullscreenElement) { document.exitFullscreen(); } else { document.documentElement.requestFullscreen(); }
});

window.addEventListener('resize', () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});
</script>
</body>
</html>`
}

/**
 * 自包含模型预览组件
 * 接收 token，通过异步 fetch 加载 GLB base64
 */
function ModelPreview({ token, modelUrl, parts, script }) {
  const [glbData, setGlbData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 侧通道：异步加载 GLB base64
  useEffect(() => {
    if (!token || !modelUrl) {
      setLoading(false)
      setError('no_data')
      return
    }

    let cancelled = false
    const baseUrl = modelUrl.substring(0, modelUrl.lastIndexOf('/generated/'))
    const apiUrl = `${baseUrl}/api/glb-base64/${encodeURIComponent(token)}`

    fetch(apiUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (cancelled) return
        setGlbData(`data:model/gltf-binary;base64,${data.base64}`)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.warn('[blender-card] 侧通道加载失败, 回退到本地模式:', err.message)
        setError('remote')
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [token, modelUrl])

  // 生成自包含 HTML
  const previewHtml = useMemo(() => {
    if (!glbData) return null
    return generatePreviewHtml(glbData, script, parts)
  }, [glbData, script, parts])

  // 打开新标签页全屏预览
  const openFullscreen = useCallback(() => {
    if (!previewHtml) return
    const blob = new Blob([previewHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) {
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.rel = 'noopener'
      a.click()
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 30000)
  }, [previewHtml])

  // 下载 GLB 文件
  const downloadGlb = useCallback(() => {
    if (!modelUrl) return
    const a = document.createElement('a')
    a.href = modelUrl
    a.download = token || 'model.glb'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [modelUrl, token])

  // 加载中
  if (loading) {
    return createElement('div', {
      className: 'my-2 rounded-lg border border-border bg-background-elevated overflow-hidden'
    },
      createElement('div', {
        className: 'px-3 py-2 border-b border-border flex items-center gap-2'
      },
        createElement('span', { className: 'text-xs font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent' }, script),
        parts ? createElement('span', { className: 'text-[11px] text-text-muted' }, `${parts} 个部件`) : null,
        createElement('span', { className: 'ml-auto text-[11px] text-text-muted' }, '加载预览中...'),
      ),
      createElement('div', {
        className: 'flex items-center justify-center h-[420px] text-text-muted text-xs',
        style: { background: '#1a1a2e' }
      },
        createElement('div', { className: 'text-center' },
          createElement('div', {
            className: 'mx-auto mb-2 w-8 h-8 border-2 border-text-muted border-t-transparent rounded-full',
            style: { animation: 'spin 0.8s linear infinite' },
          }),
          '加载 3D 数据...',
        ),
      ),
    )
  }

  // 远程模式（侧通道 fetch 失败）
  if (error === 'remote') {
    return createElement('div', {
      className: 'my-2 rounded-lg border border-border bg-background-elevated overflow-hidden'
    },
      createElement('div', {
        className: 'px-3 py-2 border-b border-border flex items-center justify-between'
      },
        createElement('div', { className: 'flex items-center gap-2' },
          createElement('span', { className: 'text-xs font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent' }, script),
          parts ? createElement('span', { className: 'text-[11px] text-text-muted' }, `${parts} 个部件`) : null,
        ),
        createElement('button', {
          onClick: downloadGlb,
          className: 'inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors',
        }, '⬇ 下载 GLB'),
      ),
      createElement('div', {
        className: 'px-3 py-4 text-center text-xs text-text-muted'
      },
        createElement('div', { className: 'text-lg mb-2' }, '📱'),
        createElement('p', {}, '3D 预览需要连接到桌面端生成环境。'),
        createElement('p', { className: 'mt-1' }, modelUrl
          ? `模型已保存，可在桌面端打开查看。`
          : ''),
        modelUrl ? createElement('a', {
          href: modelUrl,
          target: '_blank',
          className: 'inline-block mt-2 text-accent hover:underline',
        }, '点击打开 GLB 模型') : null,
      ),
    )
  }

  // 正常渲染
  return createElement('div', {
    className: 'my-2 rounded-lg border border-border bg-background-elevated overflow-hidden'
  },
    // 模型信息头部
    createElement('div', {
      className: 'px-3 py-2 border-b border-border flex items-center justify-between'
    },
      createElement('div', { className: 'flex items-center gap-2' },
        createElement('span', { className: 'text-xs font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent' }, script),
        parts ? createElement('span', { className: 'text-[11px] text-text-muted' }, `${parts} 个部件`) : null,
      ),
      createElement('div', { className: 'flex items-center gap-1' },
        createElement('button', {
          onClick: downloadGlb,
          title: '下载 GLB 文件',
          className: 'inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded text-text-muted hover:text-text hover:bg-background-hover transition-colors',
        }, '⬇ 下载'),
        createElement('button', {
          onClick: openFullscreen,
          className: 'inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors',
        }, '⛶ 全屏预览'),
      ),
    ),
    // 3D 预览 iframe
    createElement('div', {
      className: 'relative w-full',
      style: { height: '420px', background: '#1a1a2e' }
    },
      previewHtml
        ? createElement('iframe', {
          srcDoc: previewHtml,
          className: 'w-full h-full border-0',
          style: { background: '#1a1a2e' },
          allow: 'autoplay; fullscreen',
          sandbox: 'allow-scripts allow-same-origin allow-popups',
          loading: 'lazy',
        })
        : createElement('div', {
          className: 'flex items-center justify-center h-full text-text-muted text-xs'
        }, '加载预览...'),
    ),
    // 提示文字
    createElement('div', {
      className: 'px-3 py-1.5 text-[10px] text-text-muted border-t border-border'
    }, '🖱 拖拽/滚轮查看 · ⛶ 全屏预览在桌面端获得最佳体验 · 预览已持久化在聊天中'),
  )
}

export default function BlenderPreviewCard(props) {
  const d = parseData(props.data)
  if (!d || typeof d !== 'object') {
    return createElement('div', {
      className: 'my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted'
    }, '3D 建模结果加载中...')
  }

  // 错误
  if (d.type === 'error') {
    return createElement('div', {
      className: 'my-1 rounded border border-border bg-background-elevated px-3 py-2 text-[11px] font-mono'
    },
      createElement('div', { className: 'text-red-400 font-bold mb-1' }, '⚠️ 建模出错'),
      createElement('div', { className: 'text-text-secondary whitespace-pre-wrap' }, d.message || '未知错误'),
    )
  }

  // 模型列表
  if (d.type === 'model_list') {
    const models = d.models || []
    if (models.length === 0) {
      return createElement('div', {
        className: 'my-1 rounded border border-border bg-background-elevated px-3 py-2 text-[11px] font-mono text-text-muted'
      }, '暂无可用建模脚本')
    }

    return createElement('div', {
      className: 'my-1 rounded border border-border bg-background-elevated overflow-hidden'
    },
      createElement('div', {
        className: 'px-3 py-1.5 border-b border-border text-xs font-medium text-text'
      }, `📐 可用建模脚本 (${models.length})`),
      createElement('div', { className: 'divide-y divide-border' },
        ...models.map((m, i) =>
          createElement('div', {
            key: i,
            className: 'px-3 py-2 text-[11px] font-mono'
          },
            createElement('div', { className: 'flex items-center gap-2' },
              createElement('span', { className: 'text-text font-medium' }, m.name),
              m.isRegistered ? createElement('span', { className: 'px-1 py-0.5 rounded bg-accent/10 text-accent text-[9px]' }, '已注册') : null,
            ),
            m.description ? createElement('div', { className: 'text-text-muted mt-0.5 text-[10px]' }, m.description.slice(0, 150)) : null,
            m.params_schema
              ? createElement('div', { className: 'text-text-muted text-[10px] mt-0.5' }, `参数: ${m.params} 个（含验证规则）`)
              : m.params ? createElement('div', { className: 'text-text-muted text-[10px] mt-0.5' }, `参数: ${m.params} 个`) : null,
          )
        )
      ),
      // 提示注册入口
      createElement('div', { className: 'px-3 py-1.5 text-[10px] text-text-muted border-t border-border' },
        '💡 可通过 blender_register_script 上传自定义建模脚本'
      )
    )
  }

  // 模型生成结果
  if (d.type === 'model_generated') {
    return createElement('div', {},
      createElement('div', {
        className: 'my-1 text-xs text-text-secondary'
      }, `✅ 模型已生成${d.parts ? ` (${d.parts} 个部件)` : ''}`),
      createElement(ModelPreview, {
        token: d.token,
        modelUrl: d.modelUrl,
        parts: d.parts,
        script: d.script,
      }),
    )
  }

  return createElement('div', {
    className: 'my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted'
  }, '未知的 3D 建模结果')
}