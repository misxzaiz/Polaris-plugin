// core/router.js — 视图注册表 + hash 路由 + 顶栏导航 + 首页卡片。
// 通过 registerView 注册，使路由不依赖任何具体工具（main.js 负责把工具注册进来）。
// 支持面板模式（panelMode）：嵌入 Polaris 等宿主时，用内部状态代替 location.hash，避免与宿主路由冲突。
import { $, $$, el, esc } from './dom.js';

const _views=[];          // {id,label,icon,card?,init?,inited}
// 幂等注册：同 id 视图重复 register 时覆盖旧条目，避免面板模式下二次挂载时累积重复 tab。
export function registerView(v){
  const idx=_views.findIndex(x=>x.id===v.id);
  const entry=Object.assign({inited:false}, v);
  if(idx>=0) _views[idx]=entry;
  else _views.push(entry);
}
export function getViews(){ return _views; }
// 面板卸载时调用：清空注册表与路由状态，避免下一次挂载叠加。
export function resetRouter(){
  _views.length=0;
  _cur=null;
  _panelHash='#/home';
  _panelChangeCb=null;
}

let _cur=null;
let _panelMode=false;     // 面板模式标志
let _panelHash='#/home';  // 面板模式下的内部路由状态
let _panelChangeCb=null;  // 面板模式下的路由变化回调

export function currentView(){ return _cur; }
export function setPanelMode(on,onChange){
  _panelMode=!!on;
  _panelChangeCb=onChange||null;
}
export function goView(id){
  if(_panelMode){
    _panelHash='#/'+id;
    applyRoute();
    if(_panelChangeCb) _panelChangeCb(id);
  } else {
    location.hash='#/'+id;
  }
}

function viewElId(id){ return '#view'+id.charAt(0).toUpperCase()+id.slice(1); }
function renderNav(){
  const tabs=$('#navTabs'); if(!tabs) return; tabs.innerHTML='';
  _views.forEach(v=>{ const b=el('button','nav-tab'+(v.id===_cur?' on':''),`<span class="tcn">${v.icon}</span>${esc(v.label)}`); b.onclick=()=>goView(v.id); tabs.appendChild(b); });
}
function renderHome(){
  const h=$('#viewHome');
  h.innerHTML=`<div class="home"><div class="home-inner"><div class="home-hero"><div class="eyebrow">RELAY DEVKIT</div><h1>开发者工具箱</h1><p>零依赖、纯前端、可离线运行的一组接口与数据小工具。挑一个开始：</p></div><div class="tool-grid" id="toolGrid"></div></div></div>`;
  const g=$('#toolGrid');
  _views.filter(v=>v.card).forEach(c=>{ const card=el('button','tool-card'); card.style.setProperty('--accent',c.card.accent); card.innerHTML=`<div class="ic">${c.card.icon||c.icon}</div><div class="nm">${esc(c.card.name||c.label)}</div><div class="ds">${esc(c.card.desc)}</div><div class="go">打开 →</div>`; card.onclick=()=>goView(c.id); g.appendChild(card); });
}
function applyRoute(){
  let hash=_panelMode?_panelHash:location.hash;
  let id=(hash.match(/^#\/(\w+)/)||[])[1]||'home';
  if(!_views.some(v=>v.id===id)) id='home';
  _cur=id;
  $$('#view > .view').forEach(x=>x.classList.remove('on'));
  const elx=$(viewElId(id)); if(elx) elx.classList.add('on');
  renderNav();
  const v=_views.find(x=>x.id===id);
  if(id==='home') renderHome();
  else if(v&&v.init&&!v.inited){ v.init(); v.inited=true; }
}
export function startRouter(){
  if(!_panelMode){
    window.addEventListener('hashchange',applyRoute);
  }
  const nb=$('#navBrand'); if(nb) nb.onclick=()=>goView('home');
  renderNav();
  applyRoute();
}
