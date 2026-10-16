// core/router.js — 视图路由（relay-devkit-api 单视图：仅 API 客户端）。
// 支持面板模式（panelMode）：嵌入 Polaris 等宿主时，用内部状态代替 location.hash，避免与宿主路由冲突。
import { $, $$ } from './dom.js';

const _views=[];          // {id,label,icon,inited}
// 幂等注册：同 id 视图重复 register 时覆盖旧条目，避免面板模式下二次挂载时累积重复 tab。
export function registerView(v){
  const idx=_views.findIndex(x=>x.id===v.id);
  const entry=Object.assign({inited:false}, v);
  if(idx>=0) _views[idx]=entry;
  else _views.push(entry);
}
// 面板卸载时调用：清空注册表与路由状态，避免下一次挂载叠加。
export function resetRouter(){
  _views.length=0;
  _cur=null;
  _panelHash='#/api';
  _panelChangeCb=null;
}

let _cur=null;
let _panelMode=false;     // 面板模式标志
let _panelHash='#/api';   // 面板模式下的内部路由状态
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
function applyRoute(){
  let hash=_panelMode?_panelHash:location.hash;
  let id=(hash.match(/^#\/(\w+)/)||[])[1]||'api';
  if(!_views.some(v=>v.id===id)) id='api';
  _cur=id;
  $$('#view > .view').forEach(x=>x.classList.remove('on'));
  const elx=$(viewElId(id)); if(elx) elx.classList.add('on');
  const v=_views.find(x=>x.id===id);
  if(v&&v.init&&!v.inited){ v.init(); v.inited=true; }
}
export function startRouter(){
  if(!_panelMode){
    window.addEventListener('hashchange',applyRoute);
  }
  applyRoute();
}
