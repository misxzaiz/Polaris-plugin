// core/dom.js — DOM 查询、HTML 转义、通用格式化、状态栏/吐司/复制、localStorage 命名空间、日期格式化
// 无依赖。被所有模块复用。

// 面板模式：宿主 React 容器传入根元素，所有 DOM 查询作用域限定在容器内，避免与宿主页面冲突。
let _root = document;
export function setRoot(el) { _root = el || document; }
export function getRoot() { return _root; }
export const $  = (s,r=_root)=>r.querySelector(s);
export const $$ = (s,r=_root)=>[...r.querySelectorAll(s)];
export const uid = ()=> 'id'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
export const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const el = (tag,cls,html)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(html!=null)n.innerHTML=html;return n;};
export const METHODS=['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'];
export const bytes = n => n<1024 ? n+' B' : n<1048576 ? (n/1024).toFixed(1)+' KB' : (n/1048576).toFixed(2)+' MB';
export const ms = n => n<1000 ? Math.round(n)+' ms' : (n/1000).toFixed(2)+' s';
export const methodColor = m => 'm-'+m;

let statusTimer=null;
export function setStatus(msg,kind){
  const m=$('#statusMsg'); if(!m)return; m.textContent=msg; m.className='msg'+(kind?' '+kind:'');
  clearTimeout(statusTimer);
  if(kind) statusTimer=setTimeout(()=>{m.className='msg';m.textContent='就绪 · 纯前端运行，跨域请求受浏览器 CORS 策略限制';},4500);
}
export function toast(html){ const t=$('#toast'); if(!t)return; t.innerHTML=html; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),1500); }
export async function copy(text,label){
  try{ await navigator.clipboard.writeText(text); }
  catch(e){ const ta=el('textarea');ta.value=text;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(_){} ta.remove(); }
  toast((label||'已复制')+' <b>✓</b>');
}

// 工具命名空间持久化：每个工具自管自己的 localStorage 键
export function store(ns){ const key='relay.tool.'+ns; return { get(){ try{return JSON.parse(localStorage.getItem(key)||'null');}catch(e){return null;} }, set(v){ try{localStorage.setItem(key,JSON.stringify(v));}catch(e){} } }; }

export function fmtDate(d){ const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()); }
