// src/PreviewCard.tsx
import { createElement, useMemo, useCallback, useRef, useState } from "react";
function parseData(data) {
  if (!data || typeof data !== "object") return null;
  if (data.content && Array.isArray(data.content) && data.content[0]?.text) {
    try {
      return JSON.parse(data.content[0].text);
    } catch {
      return null;
    }
  }
  return data;
}
function generatePreviewHtml(glbDataUri, scriptName, parts) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>3D \u6A21\u578B\u9884\u89C8</title>
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
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div><div>\u52A0\u8F7D\u6A21\u578B...</div></div>
<div id="info">\u{1F5B1} \u62D6\u62FD\u65CB\u8F6C \xB7 \u6EDA\u8F6E\u7F29\u653E \xB7 \u53F3\u952E\u5E73\u79FB</div>
<div id="container"></div>
<div id="toolbar">
  <button id="btnReset">\u27F2 \u590D\u4F4D</button>
  <button id="btnWireframe">\u25C7 \u7EBF\u6846</button>
  <button id="btnAutoRotate">\u27F3 \u81EA\u8F6C</button>
  <span style="width:1px;height:24px;background:rgba(255,255,255,0.15);margin:0 4px;"></span>
  <button id="btnFullscreen">\u26F6 \u5168\u5C4F</button>
</div>
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  }
}
<\/script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.getElementById('container');
const loadingEl = document.getElementById('loading');
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
  // \u52A8\u753B
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
  if (xhr.total) { const pct = Math.round((xhr.loaded / xhr.total) * 100); loadingEl.innerHTML = '<div class="spinner"></div><div>\u52A0\u8F7D\u4E2D ' + pct + '%</div>'; }
}, (error) => {
  loadingEl.innerHTML = '<div style="color:#f66">\u274C \u52A0\u8F7D\u5931\u8D25</div>';
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
<\/script>
</body>
</html>`;
}
function ModelPreview({ glbData, parts, script, onOpenFullscreen }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const iframeRef = useRef(null);
  const previewHtml = useMemo(() => {
    if (!glbData) return null;
    return generatePreviewHtml(glbData, script, parts);
  }, [glbData, script, parts]);
  const openFullscreen = useCallback(() => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 3e4);
  }, [previewHtml]);
  return createElement(
    "div",
    {
      className: "my-2 rounded-lg border border-border bg-background-elevated overflow-hidden"
    },
    // 模型信息头部
    createElement(
      "div",
      {
        className: "px-3 py-2 border-b border-border flex items-center justify-between"
      },
      createElement(
        "div",
        { className: "flex items-center gap-2" },
        createElement("span", { className: "text-xs font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent" }, script),
        parts ? createElement("span", { className: "text-[11px] text-text-muted" }, `${parts} \u4E2A\u90E8\u4EF6`) : null
      ),
      createElement("button", {
        onClick: openFullscreen,
        className: "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
      }, "\u26F6 \u5168\u5C4F\u9884\u89C8")
    ),
    // 3D 预览 iframe（自包含 HTML）
    createElement(
      "div",
      {
        className: "relative w-full",
        style: { height: "420px", background: "#1a1a2e" }
      },
      previewHtml ? createElement("iframe", {
        ref: iframeRef,
        srcDoc: previewHtml,
        className: "w-full h-full border-0",
        style: { background: "#1a1a2e" },
        allow: "autoplay; fullscreen",
        sandbox: "allow-scripts allow-same-origin",
        loading: "lazy"
      }) : createElement("div", {
        className: "flex items-center justify-center h-full text-text-muted text-xs"
      }, "\u52A0\u8F7D\u9884\u89C8...")
    ),
    // 提示文字
    createElement("div", {
      className: "px-3 py-1.5 text-[10px] text-text-muted border-t border-border"
    }, "\u{1F4A1} \u70B9\u51FB\u300C\u5168\u5C4F\u9884\u89C8\u300D\u5728\u65B0\u6807\u7B7E\u9875\u6253\u5F00\uFF0C\u652F\u6301\u5168\u5C4F\u67E5\u770B\u3002\u9884\u89C8\u5DF2\u5185\u5D4C\u5728\u804A\u5929\u4E2D\uFF0C\u5173\u95ED\u6B64\u5BF9\u8BDD\u540E\u4ECD\u53EF\u67E5\u770B\u3002")
  );
}
function BlenderPreviewCard(props) {
  const d = parseData(props.data);
  if (!d || typeof d !== "object") {
    return createElement("div", {
      className: "my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted"
    }, "3D \u5EFA\u6A21\u7ED3\u679C\u52A0\u8F7D\u4E2D...");
  }
  if (d.type === "error") {
    return createElement(
      "div",
      {
        className: "my-1 rounded border border-border bg-background-elevated px-3 py-2 text-[11px] font-mono"
      },
      createElement("div", { className: "text-red-400 font-bold mb-1" }, "\u26A0\uFE0F \u5EFA\u6A21\u51FA\u9519"),
      createElement("div", { className: "text-text-secondary whitespace-pre-wrap" }, d.message || "\u672A\u77E5\u9519\u8BEF")
    );
  }
  if (d.type === "model_list") {
    const models = d.models || [];
    if (models.length === 0) {
      return createElement("div", {
        className: "my-1 rounded border border-border bg-background-elevated px-3 py-2 text-[11px] font-mono text-text-muted"
      }, "\u6682\u65E0\u53EF\u7528\u5EFA\u6A21\u811A\u672C");
    }
    return createElement(
      "div",
      {
        className: "my-1 rounded border border-border bg-background-elevated overflow-hidden"
      },
      createElement("div", {
        className: "px-3 py-1.5 border-b border-border text-xs font-medium text-text"
      }, `\u{1F4D0} \u53EF\u7528\u5EFA\u6A21\u811A\u672C (${models.length})`),
      createElement(
        "div",
        { className: "divide-y divide-border" },
        ...models.map(
          (m, i) => createElement(
            "div",
            {
              key: i,
              className: "px-3 py-2 text-[11px] font-mono"
            },
            createElement("div", { className: "text-text font-medium" }, m.name),
            m.description ? createElement("div", { className: "text-text-muted mt-0.5 text-[10px]" }, m.description) : null,
            m.params ? createElement("div", {
              className: "text-text-muted text-[10px] mt-0.5"
            }, `\u53C2\u6570: ${Object.keys(m.params).length} \u4E2A`) : null
          )
        )
      )
    );
  }
  if (d.type === "model_generated") {
    return createElement(
      "div",
      {},
      // 简短文本提示
      createElement("div", {
        className: "my-1 text-xs text-text-secondary"
      }, `\u2705 \u6A21\u578B\u5DF2\u751F\u6210${d.parts ? ` (${d.parts} \u4E2A\u90E8\u4EF6)` : ""}`),
      // 3D 预览（自包含，不依赖 HTTP 服务）
      d.glbData ? createElement(ModelPreview, {
        glbData: d.glbData,
        parts: d.parts,
        script: d.script
      }) : d.previewUrl ? createElement(
        "div",
        {
          className: "my-1 rounded border border-border bg-background-elevated px-3 py-2 text-[11px] font-mono"
        },
        createElement("div", { className: "text-text-muted mb-1" }, "\u26A0\uFE0F \u9884\u89C8\u6570\u636E\u52A0\u8F7D\u4E2D\uFF0C\u652F\u6301\u5217\u8868\u6A21\u5F0F\uFF1A"),
        createElement("a", { href: d.previewUrl, target: "_blank", className: "text-accent hover:underline" }, "\u6253\u5F00 3D \u9884\u89C8")
      ) : null
    );
  }
  return createElement("div", {
    className: "my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted"
  }, "\u672A\u77E5\u7684 3D \u5EFA\u6A21\u7ED3\u679C");
}
export {
  BlenderPreviewCard as default
};
