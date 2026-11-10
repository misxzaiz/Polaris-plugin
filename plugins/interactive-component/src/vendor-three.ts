/**
 * three.js vendored 打包入口（esbuild --format=iife 专用，2026-11-10 spec：
 * plans/interactive-threejs-games-spec.md）
 *
 * 为什么存在：AI 无法手写内联 660KB+ 的 three.js，静态扫描闸又禁 CDN 与动态
 * import()——库的供给必须走插件侧注入。MCP server 把构建产物
 * dist/vendor/three.iife.js 以 <script> 内联进用户 HTML（libs:["three"]）。
 *
 * 为什么 IIFE：sandbox iframe 无 allow-same-origin 且扫描闸拦 `import(`，
 * ESM/动态 import 都不可用；IIFE 挂 window.THREE / window.THREE_ADDONS 全局，
 * 用户代码直接用 `new THREE.WebGLRenderer(...)` 等。
 *
 * POC 实测（2026-11-10）：three 0.187 + OrbitControls + GLTFLoader minify
 * 818KB；沙箱 iframe 内 WebGL2 渲染 / rAF 63fps / OS 级键盘投递 /
 * click-to-pointer-lock 全部通过。升 three 版本后必须重跑真渲染冒烟。
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// 常用 addons 以子命名空间挂载；按需在此追加（体积增量见构建输出）。
const THREE_ADDONS = {
  OrbitControls,
  GLTFLoader,
}

;(window as unknown as { THREE: typeof THREE }).THREE = THREE
;(window as unknown as { THREE_ADDONS: typeof THREE_ADDONS }).THREE_ADDONS = THREE_ADDONS
