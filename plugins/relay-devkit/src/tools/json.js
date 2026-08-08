// tools/json.js — JSON 工具：粘贴即用，格式化/压缩/校验/转义；复用 core/json-view 的对象树/表格/原始与路径下钻。
import { $, $$, el, esc, copy, bytes, setStatus, store } from '../core/dom.js';
import { collectPaths, getByPath, viewRaw, viewObject, viewTable, filterBar } from '../core/json-view.js';

let jstate={ respView:'object', userPickedView:false, respPath:'', respFilter:'', tableSel:null, prettyCells:true, colW:{}, treeOpen:'auto', hiddenCols:{}, sort:{}, data:undefined };
const jstore=store('json');
const JSON_SAMPLE={ ok:true, total:2, generatedAt:1717603200000, users:[
  {id:1,name:'Leanne',role:'admin',active:true,createdAt:1700000000,avatar:'https://i.pravatar.cc/64?img=1'},
  {id:2,name:'Ervin',role:'user',active:false,createdAt:'2024-07-20T13:05:00Z',avatar:'https://i.pravatar.cc/64?img=5'}
], meta:{page:1,size:20,tags:['a','b','c']} };
function typeLabel(v){ if(Array.isArray(v))return '数组 ('+v.length+' 项)'; if(v&&typeof v==='object')return '对象 ('+Object.keys(v).length+' 键)'; return typeof v; }
function jsonErrPos(txt,e){ const m=/position (\d+)/i.exec(e.message); if(m){ const p=Math.min(+m[1],txt.length); const before=txt.slice(0,p); const line=before.split('\n').length; const col=p-before.lastIndexOf('\n'); return {line,col}; } const lc=/line (\d+) column (\d+)/i.exec(e.message); if(lc) return {line:+lc[1],col:+lc[2]}; return null; }

/* 通用路径下拉（与 API 同款交互） */
function pathDropdown(stateObj,paths,onApply){
  const ddWrap=el('div','ti path'); ddWrap.innerHTML='<span class="lbl">路径</span>';
  const dd=el('div','pathdd'); const ddBtn=el('button','pathdd-btn'); ddBtn.type='button';
  const setLbl=()=>{ ddBtn.innerHTML=`<span>${stateObj.respPath?esc(stateObj.respPath):'选择路径'}</span><span class="pcar">▼</span>`; };
  setLbl();
  const menu=el('div','path-menu'); const fbox=el('input','path-filter'); fbox.placeholder='过滤路径 / 回车应用'; fbox.spellcheck=false;
  const list=el('div','path-list');
  const apply=p=>{ stateObj.respPath=p; setLbl(); menu.classList.remove('open'); onApply(); };
  const fill=()=>{ list.innerHTML=''; const kw=fbox.value.toLowerCase().trim(); let n=0;
    paths.forEach(p=>{ if(n>=200)return; const lab=p.path===''?'(根)':p.path; if(kw&&!lab.toLowerCase().includes(kw))return; n++;
      const o=el('button','path-opt'+(p.path===stateObj.respPath?' on':'')); o.type='button';
      o.innerHTML=`<span class="pp">${esc(lab)}</span><span class="pk ${p.kind}">${p.kind==='array'?'[ ] '+p.count:p.kind==='object'?'{ } '+p.count:'·'}</span>`;
      o.onclick=()=>apply(p.path); list.appendChild(o); });
    if(!n) list.innerHTML='<div class="path-empty">无匹配路径。<br>回车可直接应用输入。</div>'; };
  fbox.addEventListener('input',fill);
  fbox.addEventListener('keydown',e=>{ if(e.key==='Enter')apply(fbox.value.trim()); if(e.key==='Escape')menu.classList.remove('open'); });
  ddBtn.onclick=e=>{ e.stopPropagation(); const willOpen=!menu.classList.contains('open'); $$('.path-menu').forEach(x=>x.classList.remove('open')); if(willOpen){ menu.classList.add('open'); fbox.value=''; fill(); setTimeout(()=>fbox.focus(),0); } };
  menu.addEventListener('click',e=>e.stopPropagation());
  menu.append(fbox,list); dd.append(ddBtn,menu); ddWrap.appendChild(dd);
  return ddWrap;
}

export function initJsonTool(){
  const v=$('#viewJson');
  v.innerHTML=`
  <div class="tool-pane">
    <div class="t-bar">
      <span class="t-title"><span class="tg">{ }</span> JSON 工具</span>
      <button class="t-btn primary" data-ja="format">✦ 格式化</button>
      <button class="t-btn" data-ja="min">压缩</button>
      <button class="t-btn" data-ja="validate">校验</button>
      <button class="t-btn" data-ja="escape">转义</button>
      <button class="t-btn" data-ja="unescape">去转义</button>
      <button class="t-btn" data-ja="sample">示例</button>
      <button class="t-btn" data-ja="clear">清空</button>
      <span class="sp"></span>
      <span class="t-status" id="jsonStatus">等待输入…</span>
    </div>
    <div class="jsplit">
      <div class="jspane-l"><textarea id="jsonInput" spellcheck="false" placeholder='在此粘贴 JSON，例如：&#10;{&#10;  "name": "relay",&#10;  "items": [1, 2, 3]&#10;}'></textarea></div>
      <div class="jdiv" id="jsonDiv"></div>
      <div class="jspane-r">
        <div class="subtabs" id="jsonSubtabs">
          <button class="subtab active" data-jv="object">对象</button>
          <button class="subtab" data-jv="table">表格</button>
          <button class="subtab" data-jv="raw">原始</button>
          <span class="sp"></span>
          <button class="tool" data-ja="pretty" id="jsonPretty" title="美化单元格：图片缩略图 + 时间戳转可读时间">✦ 美化</button>
          <button class="tool" data-ja="expand" id="jsonExpand">⊞ 展开</button>
          <button class="tool" data-ja="collapse" id="jsonCollapse">⊟ 折叠</button>
          <button class="tool" data-ja="copy">⧉ 复制</button>
        </div>
        <div class="res-tools" id="jsonTools" style="display:none"></div>
        <div class="pane" id="jsonPane"><div class="res-idle"><div class="big">粘贴 JSON</div>左侧输入，右侧自动渲染为对象树 / 表格 / 原始。<br>支持路径下钻、字段筛选、列宽拖拽、图片与时间戳识别。</div></div>
      </div>
    </div>
  </div>`;
  const ta=$('#jsonInput');
  const saved=jstore.get(); if(saved&&saved.text) ta.value=saved.text;
  ta.addEventListener('input',()=>{ jstore.set({text:ta.value}); jsonRender(); });
  ta.addEventListener('keydown',e=>{ if(e.key==='Tab'){ e.preventDefault(); const s=ta.selectionStart,en=ta.selectionEnd; ta.value=ta.value.slice(0,s)+'  '+ta.value.slice(en); ta.selectionStart=ta.selectionEnd=s+2; jstore.set({text:ta.value}); jsonRender(); } if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){ e.preventDefault(); jsonAction('format'); } });
  v.querySelectorAll('[data-ja]').forEach(b=>b.onclick=()=>jsonAction(b.dataset.ja));
  $$('#jsonSubtabs .subtab').forEach(b=>b.onclick=()=>{ if(b.classList.contains('disabled'))return; jstate.respView=b.dataset.jv; jstate.userPickedView=true; jsonRenderBody(); });
  (function(){ const d=$('#jsonDiv'),sp=d.parentElement,l=v.querySelector('.jspane-l'); let drag=false;
    d.addEventListener('mousedown',e=>{ drag=true; document.body.style.cursor='col-resize'; document.body.style.userSelect='none'; e.preventDefault(); });
    document.addEventListener('mousemove',e=>{ if(!drag)return; const r=sp.getBoundingClientRect(); const w=Math.max(200,Math.min(r.width-260,e.clientX-r.left)); l.style.width=w+'px'; });
    document.addEventListener('mouseup',()=>{ if(drag){ drag=false; document.body.style.cursor=''; document.body.style.userSelect=''; } });
  })();
  jstate.rerender=jsonRenderBody;
  jsonRender();
}
function jsonAction(a){
  const ta=$('#jsonInput'); if(!ta)return;
  if(a==='clear'){ ta.value=''; jstate.respPath=''; jstate.tableSel=null; jstore.set({text:''}); jsonRender(); ta.focus(); return; }
  if(a==='sample'){ ta.value=JSON.stringify(JSON_SAMPLE,null,2); jstate.respPath=''; jstate.tableSel=null; jstate.userPickedView=false; jstore.set({text:ta.value}); jsonRender(); return; }
  if(a==='format'||a==='min'){ try{ const val=JSON.parse(ta.value); ta.value=JSON.stringify(val,null,a==='format'?2:0); jstore.set({text:ta.value}); jsonRender(); setStatus(a==='format'?'JSON 已格式化':'JSON 已压缩','ok'); }catch(e){ jsonRender(); setStatus('JSON 无效：'+e.message,'err'); } return; }
  if(a==='validate'){ jsonRender(); return; }
  if(a==='escape'){ ta.value=JSON.stringify(ta.value); jstate.respPath=''; jstore.set({text:ta.value}); jsonRender(); return; }
  if(a==='unescape'){ try{ const val=JSON.parse(ta.value); if(typeof val==='string'){ ta.value=val; jstate.respPath=''; jstore.set({text:ta.value}); jsonRender(); } else setStatus('当前不是 JSON 字符串，无法去转义','warn'); }catch(e){ setStatus('去转义失败：'+e.message,'err'); } return; }
  if(a==='copy'){ const d=jsonDrilled(); copy(d!==undefined?JSON.stringify(d,null,2):ta.value,'已复制'); return; }
  if(a==='pretty'){ jstate.prettyCells=!jstate.prettyCells; jsonRenderBody(); return; }
  if(a==='expand'){ jstate.treeOpen='all'; jsonRenderBody(); return; }
  if(a==='collapse'){ jstate.treeOpen='none'; jsonRenderBody(); return; }
}
function jsonRender(){
  const ta=$('#jsonInput'),st=$('#jsonStatus'),tools=$('#jsonTools'),pane=$('#jsonPane'); if(!ta)return;
  const txt=ta.value;
  if(!txt.trim()){ jstate.data=undefined; st.textContent='等待输入…'; st.className='t-status'; tools.style.display='none'; pane.innerHTML='<div class="res-idle"><div class="big">粘贴 JSON</div>左侧输入，右侧自动渲染。</div>'; return; }
  let val; try{ val=JSON.parse(txt); }catch(e){ jstate.data=undefined; const p=jsonErrPos(txt,e); st.textContent='✗ 非法 JSON'+(p?(' · 行 '+p.line+' 列 '+p.col):''); st.className='t-status err'; tools.style.display='none'; pane.innerHTML='<div class="res-err"><div class="ti">⚠ JSON 解析失败</div><div>'+esc(e.message)+'</div>'+(p?('<div class="hintbox">定位：第 '+p.line+' 行，第 '+p.col+' 列</div>'):'')+'</div>'; return; }
  jstate.data=val;
  st.textContent='✓ 合法 · '+typeLabel(val)+' · '+bytes(new Blob([txt]).size); st.className='t-status ok';
  if(!jstate.userPickedView) jstate.respView=Array.isArray(val)?'table':(val&&typeof val==='object'?'object':'raw');
  jsonRenderTools(); jsonRenderBody();
}
function jsonRenderTools(){
  const tools=$('#jsonTools'); tools.style.display='flex'; tools.innerHTML='';
  const paths=collectPaths(jstate.data);
  tools.appendChild(pathDropdown(jstate,paths,()=>jsonRenderBody()));
  // 收集当前数据的字段名（用于过滤栏提示）
  const fields=jsonFields(jstate.data,jstate.respPath);
  tools.appendChild(filterBar(jstate,()=>jsonRenderBody(),fields));
}
/** 收集当前钻取数据的顶层字段名 */
function jsonFields(data,path){
  if(!data) return [];
  let d=data;
  if(path){ const g=getByPath(data,path); if(g.ok) d=g.value; }
  if(Array.isArray(d)&&d.length&&d[0]&&typeof d[0]==='object'&&!Array.isArray(d[0])) return Object.keys(d[0]);
  if(d&&typeof d==='object'&&!Array.isArray(d)) return Object.keys(d);
  return [];
}
function jsonDrilled(){ const data=jstate.data; if(data===undefined)return undefined; if(jstate.respPath){ const g=getByPath(data,jstate.respPath); return g.ok?g.value:undefined; } return data; }
function jsonRenderBody(){
  const pane=$('#jsonPane'); if(!pane)return; const data=jstate.data;
  let d=data, drillErr=false;
  if(jstate.respPath && data!==undefined){ const g=getByPath(data,jstate.respPath); if(g.ok)d=g.value; else { drillErr=true; d=undefined; } }
  const hasJSON=d!==undefined; const canTable=hasJSON&&(Array.isArray(d)||(d&&typeof d==='object'));
  const caps={object:hasJSON,table:canTable,raw:true};
  if(!caps[jstate.respView]) jstate.respView=hasJSON?'object':'raw';
  const isT=jstate.respView==='table',isO=jstate.respView==='object',isR=jstate.respView==='raw';
  $$('#jsonSubtabs .subtab').forEach(b=>{ const x=b.dataset.jv; b.classList.toggle('active',x===jstate.respView); b.classList.toggle('disabled',!caps[x]); });
  const pBtn=$('#jsonPretty'); pBtn.style.display=(isT||isO)?'':'none'; pBtn.style.color=jstate.prettyCells?'var(--brand)':''; pBtn.innerHTML=jstate.prettyCells?'✦ 美化':'✦ 原始';
  $('#jsonExpand').style.display=isO?'':'none'; $('#jsonCollapse').style.display=isO?'':'none';
  pane.innerHTML='';
  if(drillErr){ pane.innerHTML='<div class="prev-none">路径 <b>'+esc(jstate.respPath)+'</b> 不存在。</div>'; return; }
  if(isR) pane.appendChild(viewRaw({},d));
  else if(isO) pane.appendChild(viewObject(d,jstate));
  else pane.appendChild(viewTable(d,jstate));
}
