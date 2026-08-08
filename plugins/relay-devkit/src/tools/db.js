// tools/db.js — 统一数据库工具：MySQL（经 /__db 后端桥接）+ Supabase（浏览器原生 PostgREST）。
// 读直接执行；写（增/改/删）走「预览 → 确认 → 执行」，UPDATE/DELETE 强制主键条件。
// 密码可由用户选择「记住」（Base64 编码存 localStorage），否则仅内存。
import { $, $$, el, esc, copy, setStatus, store } from '../core/dom.js';
import { viewTable } from '../core/json-view.js';

const dbstore = store('db');
const connStore = store('db.conns');
const historyStore = store('db.history');
const COLORS = ['#3fb950','#4493f8','#a371f7','#d29922','#f85149','#8b949e'];
const MAX_HISTORY = 100;
// 面板模式：后端 URL 改为绝对地址（插件面板无同源后端）
let _panelMode=false, _dbBase='http://127.0.0.1:9860';
export function setDbPanelMode(on,base){ _panelMode=!!on; if(base)_dbBase=base; }
// 获取可用高度：面板模式取容器高度，独立模式取视口高度
function availH(){ return _panelMode ? ($('#viewDb')||document.body).clientHeight : window.innerHeight; }
function availW(){ return _panelMode ? ($('#viewDb')||document.body).clientWidth : window.innerWidth; }
// SQL 关键字列表（用于自动补全）
const SQL_KW_LIST = 'SELECT FROM WHERE AND OR NOT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP JOIN LEFT RIGHT INNER OUTER FULL CROSS ON GROUP BY ORDER LIMIT OFFSET HAVING AS IN IS NULL LIKE BETWEEN DISTINCT COUNT SUM AVG MIN MAX ASC DESC UNION ALL EXISTS CASE WHEN THEN ELSE END TRUE FALSE'.split(' ');
let dbstate = {
  driver: 'mysql',
  my: { host:'127.0.0.1', port:'3306', user:'root', password:'', database:'', dbToken:'', token:null, version:null, columns:{}, tables:[] },
  sb: { url:'', key:'', proxy:false, connected:false, schema:{}, tables:[] },
  curTable: null,
  result: null,
  activeConnId: null,
  sideTab: 'tables',
  sqlText: null,
  view: { respView:'table', tableSel:null, respFilter:'', prettyCells:true, colW:{}, treeOpen:'auto', colOrder:{}, rerender:null },
};

function save(){ dbstore.set({ driver:dbstate.driver,
  my:{ host:dbstate.my.host, port:dbstate.my.port, user:dbstate.my.user, database:dbstate.my.database, dbToken:dbstate.my.dbToken },
  sb:{ url:dbstate.sb.url, proxy:dbstate.sb.proxy },
  activeConnId:dbstate.activeConnId,
  curTable:dbstate.curTable }); }

/* ===================== 连接列表管理 ===================== */
function loadConns(){ return connStore.get()||[]; }
function saveConns(conns){ connStore.set(conns); }
function getConn(id){ return loadConns().find(c=>c.id===id)||null; }
function upsertConn(c){
  const conns=loadConns();
  const idx=conns.findIndex(x=>x.id===c.id);
  if(idx>=0) conns[idx]=c; else conns.push(c);
  saveConns(conns);
}
function removeConn(id){ saveConns(loadConns().filter(c=>c.id!==id)); }

function connected(){ return dbstate.driver==='mysql' ? !!dbstate.my.token : dbstate.sb.connected; }
function coerce(v){ const s=String(v); if(s==='')return ''; if(/^null$/i.test(s))return null; if(/^true$/i.test(s))return true; if(/^false$/i.test(s))return false; if(/^-?\d+(\.\d+)?$/.test(s))return Number(s); return s; }
/* 保存编辑器内容到状态（在 DOM 重建前调用） */
function saveEditorContent(){ const ta=$('#dbSql'); if(ta) dbstate.sqlText=ta.value; }

/* ===================== SQL 历史记录 ===================== */
function pushHistory(sql, rows, ms, affected){
  if(!sql||dbstate.driver!=='mysql')return;
  const hist=historyStore.get()||[];
  hist.unshift({sql,ts:Date.now(),rows:rows||0,ms:ms||0,affected:affected||null});
  if(hist.length>MAX_HISTORY) hist.length=MAX_HISTORY;
  historyStore.set(hist);
}
function loadHistory(){ return historyStore.get()||[]; }
function relTime(ts){
  const d=Date.now()-ts;
  if(d<60000) return '刚刚';
  if(d<3600000) return Math.floor(d/60000)+'分钟前';
  if(d<86400000) return Math.floor(d/3600000)+'小时前';
  const dt=new Date(ts);
  return (dt.getMonth()+1)+'/'+dt.getDate()+' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0');
}

/* ===================== 后端 / REST 请求 ===================== */
async function dbReq(route, payload){
  let res; const headers={'Content-Type':'application/json'};
  if(dbstate.my.dbToken) headers['X-Relay-DB-Token']=dbstate.my.dbToken;
  const base=_panelMode?_dbBase:'';
  try{ res=await fetch(base+'/__db/'+route,{method:'POST',headers,body:JSON.stringify(payload)}); }
  catch(e){ return {ok:false,error:'无法连接本地后端：'+e.message,hint:'确认本地后端正在运行：npm start（node server.js），或 bash serve.sh'}; }
  try{ return await res.json(); }
  catch(e){ return {ok:false,error:'后端返回非 JSON（HTTP '+res.status+'）'}; }
}
async function sbFetch(pathQuery, opts={}){
  const b=dbstate.sb; const full=b.url.replace(/\/+$/,'')+pathQuery;
  const headers=Object.assign({apikey:b.key,Authorization:'Bearer '+b.key}, opts.headers||{});
  let url=full;
  if(b.proxy){ headers['X-Relay-Target']=full; url=(_panelMode?_dbBase:'')+'/__proxy'; }
  return fetch(url,{method:opts.method||'GET',headers,body:opts.body});
}

/* ===================== 初始化 + 外壳 ===================== */
export function initDbTool(){
  const sv=dbstore.get();
  if(sv){ if(sv.driver)dbstate.driver=sv.driver;
    if(sv.my)Object.assign(dbstate.my,{host:sv.my.host??dbstate.my.host,port:sv.my.port??dbstate.my.port,user:sv.my.user??dbstate.my.user,database:sv.my.database??dbstate.my.database,dbToken:sv.my.dbToken??''});
    if(sv.sb)Object.assign(dbstate.sb,{url:sv.sb.url??'',proxy:!!sv.sb.proxy});
    if(sv.activeConnId) dbstate.activeConnId=sv.activeConnId;
    if(sv.curTable) dbstate.curTable=sv.curTable;
  }
  // 恢复活跃连接的记住密码
  if(dbstate.activeConnId){
    const c=getConn(dbstate.activeConnId);
    if(c&&c.rememberPwd&&c.encPwd) dbstate.my.password=atob(c.encPwd);
  }
  dbstate.view.rerender=()=>renderResult(dbstate.result);
  const v=$('#viewDb');
  v.innerHTML=`
  <div class="tool-pane">
    <div class="t-bar">
      <span class="t-title"><span class="tg">⛁</span> 数据库</span>
      <div class="t-seg" id="dbSeg"><button data-d="mysql">MySQL</button><button data-d="supabase">Supabase</button></div>
      <span class="db-chip" id="dbStatus" style="display:none"></span>
      <span class="sp"></span>
      <span class="t-status" id="dbMsg"></span>
      <button class="t-btn" id="dbDisc" style="display:none">断开</button>
    </div>
    <div id="dbBody" style="position:relative;flex:1;min-height:0;display:flex;flex-direction:column"></div>
  </div>`;
  $$('#dbSeg button').forEach(b=>b.onclick=()=>{ if(connected())return; setDriver(b.dataset.d); });
  $('#dbDisc').onclick=disconnect;
  $$('#dbSeg button').forEach(x=>x.classList.toggle('on',x.dataset.d===dbstate.driver));
  // 尝试自动恢复 MySQL 连接（需满足：activeConnId + rememberPwd + encPwd）
  if(dbstate.driver==='mysql' && dbstate.activeConnId){
    const c=getConn(dbstate.activeConnId);
    if(c && c.rememberPwd && c.encPwd){ tryAutoReconnect(c); return; }
  }
  setDriver(dbstate.driver);
}
function setDriver(d){ dbstate.driver=d; save(); $$('#dbSeg button').forEach(x=>x.classList.toggle('on',x.dataset.d===d)); renderBody(); }
function dbMsg(t,kind){ const m=$('#dbMsg'); if(!m)return; m.textContent=t||''; m.className='t-status'+(kind?' '+kind:''); }

function renderBody(){
  const seg=$$('#dbSeg button'); seg.forEach(x=>{ x.disabled=connected(); x.style.opacity=connected()?'.5':''; });
  if(connected()) renderWorkspace(); else renderConn();
}

/* ===================== 连接管理器 ===================== */
function renderConn(){
  $('#dbStatus').style.display='none'; $('#dbDisc').style.display='none';
  const body=$('#dbBody');
  if(dbstate.driver==='mysql'){
    const conns=loadConns().filter(c=>c.driver==='mysql');
    body.innerHTML=`<div class="db-conn"><div class="cm">
      <div class="cm-list">
        <div class="cm-list-h">已保存的连接</div>
        <div class="cm-list-items" id="cmList"></div>
        <button class="cm-add" id="cmAdd">+ 新增连接</button>
      </div>
      <div class="cm-form" id="cmForm"></div>
    </div></div>`;
    renderConnList(conns);
    $('#cmAdd').onclick=()=>{
      const id='c'+Date.now();
      const c={id,name:'新连接',driver:'mysql',host:'127.0.0.1',port:'3306',user:'root',database:'',color:COLORS[conns.length%COLORS.length],rememberPwd:false,encPwd:''};
      upsertConn(c); dbstate.activeConnId=id; save();
      renderConn();
    };
  } else {
    const b=dbstate.sb;
    body.innerHTML=`<div class="db-conn"><div class="db-card">
      <h3>连接 Supabase</h3>
      <div class="sub">Supabase 提供浏览器原生的 <b>PostgREST</b> 接口，前端直接以 <b>apikey</b> 调用。CORS 受限时可勾选「经本地代理」走 /__proxy 转发。Key 只在内存、不保存。</div>
      <div class="db-row"><label>Project URL</label><input class="t-in" id="sbUrl" spellcheck="false" value="${esc(b.url)}" placeholder="https://xxxx.supabase.co"></div>
      <div class="db-row"><label>API Key</label><input class="t-in" id="sbKey" type="password" spellcheck="false" value="" placeholder="anon 或 service_role key"></div>
      <div class="db-row inline"><label></label><label class="ckbox"><input type="checkbox" id="sbProxy" ${b.proxy?'checked':''}> 经本地代理 /__proxy（绕过 CORS）</label></div>
      <div class="db-acts"><button class="t-btn primary" id="sbConn">连接</button></div>
    </div></div>`;
    $('#sbConn').onclick=async()=>{ const b2=dbstate.sb; b2.url=$('#sbUrl').value.trim(); b2.key=$('#sbKey').value.trim(); b2.proxy=$('#sbProxy').checked; save();
      if(!b2.url||!b2.key){ dbMsg('请填写 URL 与 API Key','err'); return; }
      dbMsg('连接中…'); const r=await loadTablesSupabase();
      if(!r.ok){ dbMsg('✗ '+r.error,'err'); setStatus('Supabase 连接失败：'+r.error,'err'); return; }
      dbstate.sb.connected=true; renderBody(); setStatus('已连接 Supabase · '+dbstate.sb.tables.length+' 张表/视图','ok'); };
  }
}
function renderConnList(conns){
  const list=$('#cmList'); if(!list)return;
  const aid=dbstate.activeConnId;
  list.innerHTML=conns.map(c=>`
    <div class="cm-item${c.id===aid?' on':''}" data-id="${c.id}">
      <span class="cm-dot" style="background:${c.color}"></span>
      <span class="cm-item-name">${esc(c.name)}</span>
      <span class="cm-item-host">${esc(c.host)}</span>
      <span class="cm-item-del" data-del="${c.id}" title="删除">×</span>
    </div>`).join('');
  list.querySelectorAll('.cm-item').forEach(el=>{
    el.onclick=e=>{
      if(e.target.dataset.del){
        const c=getConn(e.target.dataset.del);
        if(c&&confirm('确定删除「'+c.name+'」？')){ removeConn(e.target.dataset.del); if(dbstate.activeConnId===e.target.dataset.del) dbstate.activeConnId=null; save(); renderConn(); }
        return;
      }
      dbstate.activeConnId=el.dataset.id; save(); renderConnForm();
      list.querySelectorAll('.cm-item').forEach(x=>x.classList.toggle('on',x.dataset.id===el.dataset.id));
    };
  });
  renderConnForm();
}
function renderConnForm(){
  const form=$('#cmForm'); if(!form)return;
  const c=dbstate.activeConnId?getConn(dbstate.activeConnId):null;
  if(!c){ form.innerHTML='<h3>选择或新增连接</h3><div style="color:var(--dim);font-size:12px;margin-top:8px">点击左侧连接项编辑，或点击「+ 新增连接」</div>'; return; }
  form.innerHTML=`
    <h3>${esc(c.name)}</h3>
    <div class="db-row"><label>名称</label><input class="t-in" id="cmName" spellcheck="false" value="${esc(c.name)}"></div>
    <div class="db-row"><label>颜色</label>
      <div class="cm-colors">${COLORS.map(cl=>`<div class="cm-color${cl===c.color?' on':''}" style="background:${cl}" data-color="${cl}"></div>`).join('')}</div>
    </div>
    <div class="db-row"><label>主机 host</label><input class="t-in" id="cmHost" spellcheck="false" value="${esc(c.host)}"></div>
    <div class="db-row"><label>端口 port</label><input class="t-in" id="cmPort" spellcheck="false" value="${esc(c.port)}"></div>
    <div class="db-row"><label>用户 user</label><input class="t-in" id="cmUser" spellcheck="false" value="${esc(c.user)}"></div>
    <div class="db-row"><label>密码 password</label><input class="t-in" id="cmPwd" type="password" spellcheck="false" value="${c.rememberPwd&&c.encPwd?atob(c.encPwd):''}"></div>
    <div class="cm-remember"><input type="checkbox" id="cmRemember" ${c.rememberPwd?'checked':''}> 记住密码（Base64 编码存储到本地）</div>
    <div class="db-row"><label>数据库</label><input class="t-in" id="cmDb" spellcheck="false" value="${esc(c.database)}" placeholder="可留空（连接后再选库）"></div>
    <div class="db-row"><label>访问令牌</label><input class="t-in" id="cmToken" type="password" spellcheck="false" value="" placeholder="仅当后端设置了 RELAY_DB_TOKEN 时填写"></div>
    <div class="cm-sec">⚠ 记住的密码为 Base64 编码（非加密），仅适用于本机开发环境</div>
    <div class="cm-acts">
      <button class="t-btn cm-btn-danger" id="cmDel">删除连接</button>
      <span style="flex:1"></span>
      <button class="t-btn" id="cmTest">测试连接</button>
      <button class="t-btn primary" id="cmConn">连接</button>
    </div>`;
  // 颜色选择
  form.querySelectorAll('.cm-color').forEach(el=>{
    el.onclick=()=>{ c.color=el.dataset.color; upsertConn(c); renderConnForm(); };
  });
  // 实时保存表单
  const fields={cmName:'name',cmHost:'host',cmPort:'port',cmUser:'user',cmDb:'database'};
  Object.entries(fields).forEach(([elId,key])=>{
    const inp=$('#'+elId); if(!inp)return;
    inp.oninput=()=>{ c[key]=inp.value; upsertConn(c); if(key==='name') form.querySelector('h3').textContent=inp.value; };
  });
  // 记住密码
  $('#cmRemember').onchange=e=>{ c.rememberPwd=e.target.checked; upsertConn(c); };
  // 删除
  $('#cmDel').onclick=()=>{
    if(confirm('确定删除「'+c.name+'」？')){ removeConn(c.id); dbstate.activeConnId=null; save(); renderConn(); }
  };
  // 测试/连接
  const grab=()=>{
    c.name=$('#cmName').value.trim(); c.host=$('#cmHost').value.trim(); c.port=$('#cmPort').value.trim();
    c.user=$('#cmUser').value.trim(); c.database=$('#cmDb').value.trim(); c.rememberPwd=$('#cmRemember').checked;
    const pwd=$('#cmPwd').value; c.encPwd=(c.rememberPwd&&pwd)?btoa(pwd):''; upsertConn(c);
    Object.assign(dbstate.my,{host:c.host,port:c.port,user:c.user,password:pwd,database:c.database,dbToken:$('#cmToken').value});
    save();
  };
  $('#cmTest').onclick=async()=>{ grab(); dbMsg('测试中…'); const r=await dbReq('test',{driver:'mysql',conn:connMysql()}); if(r.ok){ dbMsg('✓ 可连接 · MySQL '+(r.serverVersion||''),'ok'); setStatus('MySQL 连接测试成功','ok'); } else { dbMsg('✗ '+r.error,'err'); setStatus('MySQL 测试失败：'+r.error+(r.hint?'（'+r.hint+'）':''),'err'); } };
  $('#cmConn').onclick=async()=>{ grab(); dbMsg('连接中…'); const r=await dbReq('connect',{driver:'mysql',conn:connMysql()}); if(!r.ok){ dbMsg('✗ '+r.error,'err'); setStatus('连接失败：'+r.error+(r.hint?'（'+r.hint+'）':''),'err'); return; } dbstate.my.token=r.token; dbstate.my.version=r.serverVersion; dbstate.my.database=r.database||dbstate.my.database; dbstate.activeConnId=c.id; save(); await loadSchemaMysql(); renderBody(); setStatus('已连接 MySQL '+(r.serverVersion||''),'ok'); };
}
function connMysql(){ const m=dbstate.my; return {host:m.host,port:m.port,user:m.user,password:m.password,database:m.database}; }

/* ===================== schema / database 加载 ===================== */
async function loadSchemaMysql(){
  const r=await dbReq('schema',{token:dbstate.my.token,database:dbstate.my.database});
  if(r.ok){ dbstate.my.tables=r.tables||[]; dbstate.my.columns=r.columns||{}; if(r.database)dbstate.my.database=r.database; }
  else setStatus('读取表结构失败：'+r.error,'err');
}
async function loadDatabasesMysql(){
  const r=await dbReq('databases',{token:dbstate.my.token});
  if(r.ok) return r.databases||[];
  setStatus('读取数据库列表失败：'+r.error,'err');
  return [];
}
async function useDatabase(name){
  const r=await dbReq('use',{token:dbstate.my.token,database:name});
  if(!r.ok){ setStatus('切换数据库失败：'+r.error,'err'); return; }
  dbstate.my.database=name;
  await loadSchemaMysql();
  dbstate.curTable=null; dbstate.result=null;
  save();
  renderWorkspace();
  setStatus('已切换到 '+name,'ok');
}
async function loadTablesSupabase(){
  let res;
  try{ res=await sbFetch('/rest/v1/'); }
  catch(e){ return {ok:false,error:'请求失败：'+e.message+'（CORS？可勾选经本地代理）'}; }
  let spec; try{ spec=await res.json(); }catch(e){ return {ok:false,error:'返回非 JSON（HTTP '+res.status+'）'}; }
  if(!res.ok) return {ok:false,error:(spec&&(spec.message||spec.error))||('HTTP '+res.status)};
  const defs=spec.definitions||(spec.components&&spec.components.schemas)||{};
  const schema={};
  Object.keys(defs).forEach(name=>{ const props=(defs[name]&&defs[name].properties)||{};
    schema[name]=Object.keys(props).map(c=>({name:c,type:(props[c].format||props[c].type||''),pk:/primary key/i.test(props[c].description||'')})); });
  dbstate.sb.schema=schema; dbstate.sb.tables=Object.keys(schema);
  return {ok:true};
}

/* ===================== 工作区 ===================== */
function disconnect(){
  if(dbstate.driver==='mysql'&&dbstate.my.token){ dbReq('disconnect',{token:dbstate.my.token}); dbstate.my.token=null; }
  dbstate.sb.connected=false; dbstate.sb.key=''; dbstate.my.password='';
  dbstate.curTable=null; dbstate.result=null; save(); dbMsg(''); renderBody(); setStatus('已断开数据库连接','ok');
}
/* 自动恢复上次 MySQL 连接（页面刷新 / 重新进入工具时） */
async function tryAutoReconnect(c){
  const password=atob(c.encPwd);
  Object.assign(dbstate.my,{host:c.host,port:c.port,user:c.user,password});
  // database：优先用已保存的（可能是手动选择的库），其次用连接配置的
  if(!dbstate.my.database && c.database) dbstate.my.database=c.database;
  const body=$('#dbBody');
  body.innerHTML='<div class="res-loading" style="flex:1;display:flex;align-items:center;justify-content:center"><span class="spin"></span> <span style="margin-left:8px">正在恢复连接…</span></div>';
  dbMsg('恢复连接中…');
  try{
    const r=await dbReq('connect',{driver:'mysql',conn:connMysql()});
    if(!r.ok) throw new Error(r.error);
    dbstate.my.token=r.token;
    dbstate.my.version=r.serverVersion;
    dbstate.my.database=r.database||dbstate.my.database;
    save();
    await loadSchemaMysql();
    renderBody();
    // 恢复上次选中的表（表仍存在时才选中）
    if(dbstate.curTable){
      if(curTables().includes(dbstate.curTable)){
        selectTable(dbstate.curTable);
      } else {
        dbstate.curTable=null; save();
      }
    }
    setStatus('已恢复连接 · MySQL '+(r.serverVersion||''),'ok');
  }catch(e){
    // 恢复失败：清空 token，回落到连接管理器
    dbstate.my.token=null;
    renderBody();
    dbMsg('自动恢复失败，请手动连接','warn');
  }
}
function curTables(){ return dbstate.driver==='mysql'?dbstate.my.tables:dbstate.sb.tables; }
function curCols(table){ return (dbstate.driver==='mysql'?dbstate.my.columns:dbstate.sb.schema)[table]||[]; }
function pkOf(table){ const c=curCols(table).find(x=>x.pk); return c?c.name:(curCols(table)[0]&&curCols(table)[0].name)||'id'; }

function renderWorkspace(){
  saveEditorContent();
  const chip=$('#dbStatus'); chip.style.display='inline-flex'; $('#dbDisc').style.display='';
  const conn=dbstate.activeConnId?getConn(dbstate.activeConnId):null;
  const connColor=conn?conn.color:'';
  const colorDot=connColor?`<span class="cm-dot" style="background:${connColor};width:8px;height:8px;border-radius:50%;flex:none"></span>`:'';
  chip.innerHTML=`<span class="dotc"></span>${colorDot}`+(dbstate.driver==='mysql'
    ? 'MySQL '+esc(dbstate.my.version||'')+(dbstate.my.database?' · '+esc(dbstate.my.database):'')
    : 'Supabase'+(dbstate.sb.proxy?' · 代理':''));
  const sideLabel=dbstate.driver==='mysql'&&dbstate.my.database
    ? esc(dbstate.my.database)+' · 表 / 视图 · '+curTables().length
    : '表 / 视图 · '+curTables().length;
  const switchBtn=dbstate.driver==='mysql'
    ? '<button class="db-sel-btn" id="dbSelBtn" title="切换数据库">⛁</button>' : '';
  $('#dbBody').innerHTML=`<div class="db-main">
      <div class="db-side">
        <div class="db-side-h"><span id="dbSideLabel">${sideLabel}</span>${switchBtn}</div>
        ${dbstate.driver==='mysql'?'<div class="db-side-tabs"><button class="db-side-tab on" id="tabTables">表</button><button class="db-side-tab" id="tabHistory">历史</button></div>':''}
        <div class="db-side-search"><input class="t-in" id="dbTableSearch" placeholder="搜索表名…" spellcheck="false"></div>
        <div class="db-side-scroll"><div id="dbTables"></div><div id="dbHistory" style="display:none"></div></div>
      </div>
      <div class="db-right">
        <div class="db-toolbar" id="dbToolbar"></div>
        <div class="db-editor" id="dbEditor"></div>
        <div class="db-splitter" id="dbSplitter"></div>
        <div class="db-result" id="dbResult"><div class="res-idle"><div class="big">选择一张表</div>左侧点选表名查看数据，或在上方编辑查询。</div></div>
      </div>
    </div>`;
  renderTables(); renderToolbar(); renderEditor();
  // 绑定搜索
  const searchIn=$('#dbTableSearch');
  if(searchIn) searchIn.oninput=dbstate.sideTab==='history'?filterHistory:filterTables;
  // 绑定侧边栏 tab
  const tabT=$('#tabTables'), tabH=$('#tabHistory');
  if(tabT) tabT.onclick=()=>switchSideTab('tables');
  if(tabH) tabH.onclick=()=>switchSideTab('history');
  if(dbstate.sideTab==='history') switchSideTab('history');
  // 绑定数据库切换按钮
  const selBtn=$('#dbSelBtn');
  if(selBtn) selBtn.onclick=()=>{ dbstate.my.database=''; dbstate.curTable=null; dbstate.result=null; renderWorkspace(); };
  // 绑定分割条拖拽
  initSplitter();
}
function renderTables(){
  const host=$('#dbTables'); host.innerHTML='';
  // MySQL 未选数据库：显示数据库列表
  if(dbstate.driver==='mysql'&&!dbstate.my.database){
    host.innerHTML='<div class="res-loading"><span class="spin"></span> 加载中…</div>';
    loadDatabasesMysql().then(dbs=>{
      host.innerHTML='';
      if(!dbs.length){ host.innerHTML='<div class="path-empty">未找到数据库</div>'; return; }
      dbs.forEach(db=>{
        const b=el('button','dbt dbt-db');
        b.innerHTML='<span class="dbt-icon">🗄</span><span class="dbt-n">'+esc(db)+'</span>';
        b.onclick=()=>useDatabase(db);
        host.appendChild(b);
      });
    });
    return;
  }
  filterTables();
}
function filterTables(){
  const host=$('#dbTables'); if(!host)return;
  // 数据库选择模式下不过滤
  if(dbstate.driver==='mysql'&&!dbstate.my.database) return;
  const q=($('#dbTableSearch')?$('#dbTableSearch').value:'').trim().toLowerCase();
  const tbls=curTables();
  const filtered=q?tbls.filter(t=>t.toLowerCase().includes(q)):tbls;
  host.innerHTML='';
  if(!filtered.length){ host.innerHTML='<div class="path-empty">'+(q?'没有匹配的表':'无表。')+'</div>'; return; }
  filtered.forEach(t=>{ const cols=curCols(t); const pk=cols.some(c=>c.pk); const b=el('button','dbt'+(t===dbstate.curTable?' on':''));
    b.title=t+' · '+cols.length+' 列'; b.innerHTML=`<span class="dbt-n">${esc(t)}</span>`+(cols.length?`<span class="dbt-cols">${cols.length}</span>`:'')+(pk?'<span class="dbt-pk">PK</span>':''); b.onclick=()=>selectTable(t);
    b.oncontextmenu=e=>{ e.preventDefault(); tableContextMenu(t,e.clientX,e.clientY); };
    host.appendChild(b); });
}
function renderToolbar(){
  const bar=$('#dbToolbar'); if(!bar)return; bar.innerHTML='';
  const left=el('div','db-toolbar-left');
  const center=el('div','db-toolbar-center');
  const right=el('div','db-toolbar-right');

  if(dbstate.driver==='mysql'){
    const run=el('button','t-btn primary','▶ 运行'); run.onclick=runRead;
    left.appendChild(run);
    if(dbstate.my.database){
      const sel=el('span','db-schema-sel','🗄 '+esc(dbstate.my.database)+' ▾');
      sel.title='点击切换数据库'; sel.style.cursor='pointer';
      sel.onclick=()=>{ dbstate.my.database=''; dbstate.curTable=null; dbstate.result=null; renderWorkspace(); };
      left.appendChild(sel);
    }
  } else {
    const run=el('button','t-btn primary','▶ 查询'); run.onclick=runRead;
    left.appendChild(run);
  }

  const add=el('button','t-btn','＋ 新增'); add.onclick=()=>{ if(!dbstate.curTable){ setStatus('请先选择一张表','warn'); return; } openCrud('insert'); };
  const edt=el('button','t-btn','✎ 改'); edt.onclick=()=>{ if(!dbstate.curTable){ setStatus('请先选择一张表','warn'); return; } openCrud('update'); };
  const del=el('button','t-btn danger','🗑 删'); del.onclick=()=>{ if(!dbstate.curTable){ setStatus('请先选择一张表','warn'); return; } openCrud('delete'); };
  right.append(add,edt,del);

  bar.append(left,center,right);
}
function renderEditor(){
  const wrap=$('#dbEditor'); if(!wrap)return; wrap.innerHTML='';
  if(dbstate.driver==='mysql'){
    // ---- 容器结构：行号区 | 高亮叠加层+textarea ----
    const gutter=el('pre','db-gutter');
    const overlay=el('pre','db-overlay');
    const ta=el('textarea',''); ta.id='dbSql'; ta.spellcheck=false;
    ta.placeholder='SELECT … （参数用 %s；Ctrl+Enter 执行）';
    ta.value=dbstate.sqlText!=null?dbstate.sqlText:(dbstate.curTable?'SELECT * FROM `'+dbstate.curTable+'` LIMIT 20':'');
    dbstate.sqlText=null;

    // ---- 行号 ----
    const updateGutter=()=>{
      const lines=ta.value.split('\n').length;
      const cur=ta.value.substring(0,ta.selectionStart).split('\n').length;
      let html='';
      for(let i=1;i<=lines;i++){
        html+=(i===cur?'<b>':'')+i+(i===cur?'':'')+'\n';
      }
      gutter.innerHTML=html;
    };

    // ---- SQL 语法高亮（叠加层） ----
    // 复用 hlSQL 逻辑，额外支持反引号标识符和注释
    const SQL_KW_SET=new Set('SELECT FROM WHERE AND OR NOT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP JOIN LEFT RIGHT INNER OUTER FULL CROSS ON GROUP BY ORDER LIMIT OFFSET HAVING AS IN IS NULL LIKE BETWEEN DISTINCT COUNT SUM AVG MIN MAX ASC DESC UNION ALL EXISTS CASE WHEN THEN ELSE END TRUE FALSE'.split(' '));
    function hlSQL(sql){
      let out='',i=0;
      const push=(cls,txt)=>{ out+= cls?'<span class="'+cls+'">'+esc(txt)+'</span>':esc(txt); };
      while(i<sql.length){ const c=sql[i];
        if(c==="'"){ let j=i+1,s="'"; while(j<sql.length){ s+=sql[j]; if(sql[j]==="'"){ if(sql[j+1]==="'"){ s+="'"; j+=2; continue; } j++; break; } j++; } push('tok-str',s); i=j; continue; }
        if(c==='`'){ let j=i+1,s='`'; while(j<sql.length&&sql[j]!=='`'){ s+=sql[j]; j++; } if(j<sql.length){ s+='`'; j++; } push('tok-id',s); i=j; continue; }
        if(/[0-9]/.test(c) && !/[A-Za-z_]/.test(sql[i-1]||'')){ let j=i,s=''; while(j<sql.length&&/[0-9.]/.test(sql[j])){ s+=sql[j]; j++; } push('tok-num',s); i=j; continue; }
        if(/[A-Za-z_]/.test(c)){ let j=i,s=''; while(j<sql.length&&/[A-Za-z_0-9]/.test(sql[j])){ s+=sql[j]; j++; } push(SQL_KW_SET.has(s.toUpperCase())?'tok-key':'',s); i=j; continue; }
        // -- 行注释
        if(c==='-' && sql[i+1]==='-'){ let j=i; while(j<sql.length&&sql[j]!=='\n'){ j++; } push('',sql.substring(i,j)); i=j; continue; }
        // /* */ 块注释
        if(c==='/' && sql[i+1]==='*'){ let j=i+2; while(j<sql.length&&!(sql[j]==='*'&&sql[j+1]==='/')){ j++; } j+=2; push('',sql.substring(i,j)); i=j; continue; }
        push('',c); i++;
      }
      return out;
    }
    const updateHighlight=()=>{ overlay.innerHTML=hlSQL(ta.value)+'\n'; };

    // ---- 事件绑定 ----
    const autoResize=()=>{
      ta.style.height='auto';
      const contentH=ta.scrollHeight;
      ta.style.height='';
      const desiredH=Math.max(200,contentH+4);
      const curH=wrap.offsetHeight||0;
      if(!wrap.style.height||desiredH>curH){
        wrap.style.height=Math.min(availH()*0.6,desiredH)+'px';
      }
    };
    const update=()=>{ updateGutter(); updateHighlight(); autoResize(); };
    ta.addEventListener('input',update);
    ta.addEventListener('scroll',()=>{ gutter.scrollTop=ta.scrollTop; overlay.scrollTop=ta.scrollTop; });
    ta.addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&(e.key==='Enter'||e.key==='r')){ e.preventDefault(); runRead(); closeAutocomplete(); return; }
      // Tab 键插入两个空格
      if(e.key==='Tab'&&!e.shiftKey){ e.preventDefault(); const s=ta.selectionStart, en=ta.selectionEnd; ta.value=ta.value.substring(0,s)+'  '+ta.value.substring(en); ta.selectionStart=ta.selectionEnd=s+2; update(); closeAutocomplete(); return; }
      // 括号自动补全（仅无选区时）
      const pairs={'(':')','{':'}','[':']'};
      if(pairs[e.key]&&ta.selectionStart===ta.selectionEnd){ e.preventDefault(); const s=ta.selectionStart; ta.value=ta.value.substring(0,s)+e.key+pairs[e.key]+ta.value.substring(s); ta.selectionStart=ta.selectionEnd=s+1; update(); closeAutocomplete(); return; }
      // 自动补全键盘导航：↑↓ 在补全打开时由 renderAutocomplete 处理
      if(_acOpen && e.key==='ArrowDown'){ e.preventDefault(); _acSelected=Math.min(_acSelected+1,_acList.length-1); updateAcSelection(); return; }
      if(_acOpen && e.key==='ArrowUp'){ e.preventDefault(); _acSelected=Math.max(_acSelected-1,0); updateAcSelection(); return; }
      if(_acOpen && e.key==='Enter'){ e.preventDefault(); acceptAc(_acSelected); return; }
      if(e.key==='Escape'){ closeAutocomplete(); return; }
      // 其他输入键：关闭补全并在 keyup 重新触发
      if(_acOpen && !['Backspace','Delete'].includes(e.key) && e.key.length===1 && !e.ctrlKey && !e.metaKey){
        // 字符键输入后会在 keyup 时重新触发补全
      } else if(_acOpen && ['Backspace','Delete'].includes(e.key)){
        // 删除键：保留补全，keyup 重新刷新
      } else {
        closeAutocomplete();
      }
    });
    ta.addEventListener('keyup',e=>{
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','Shift','Control','Meta','Alt','Tab','Escape','Enter'].includes(e.key)) return;
      renderAutocomplete();
    });

    // ---- 初始渲染 ----
    requestAnimationFrame(()=>{
      ta.style.height='auto';
      const contentH=ta.scrollHeight;
      ta.style.height='';
      const desiredH=Math.max(200,contentH+4);
      wrap.style.height=Math.min(window.innerHeight*0.6,desiredH)+'px';
      updateGutter();
      updateHighlight();
      // autoResize already done above
    });

    // 组合 DOM
    const editorInner=el('div','db-editor-inner');
    editorInner.appendChild(gutter);
    const editorText=el('div','db-editor-text');
    editorText.appendChild(overlay);
    editorText.appendChild(ta);
    editorInner.appendChild(editorText);
    wrap.appendChild(editorInner);
    // Supabase mode
  } else {
    // Supabase: filter + limit 在工具栏样式中
    const row=el('div','db-sb-row');
    const flt=el('input','t-in'); flt.id='sbFilter'; flt.spellcheck=false; flt.placeholder='PostgREST 过滤，如 id=eq.1（可空）'; flt.style.flex='1';
    const lim=el('input','t-in'); lim.id='sbLimit'; lim.style.width='80px'; lim.value='20'; lim.title='limit';
    row.append(flt,lim);
    wrap.appendChild(row);
  }
}

// ============================================================
// 自动补全（Auto-Complete）
// ============================================================
let _acOpen=false, _acSelected=-1, _acList=[];
let _acEl=null;  // 当前浮层 DOM
let _acDocClick=null, _acDocKey=null; // document 级监听器引用（方便移除）

function closeAutocomplete(){
  if(_acEl){ _acEl.remove(); _acEl=null; }
  // 清理 document 级监听器
  if(_acDocClick){ document.removeEventListener('click',_acDocClick); _acDocClick=null; }
  if(_acDocKey){ document.removeEventListener('keydown',_acDocKey); _acDocKey=null; }
  _acOpen=false; _acList=[]; _acSelected=-1;
}

function renderAutocomplete(){
  if(!connected()||dbstate.driver!=='mysql') return;
  const ta=$('#dbSql'); if(!ta) return;

  const pos=ta.selectionStart;
  const text=ta.value;
  // 提取光标前的 token（支持 table.column 模式）
  let tokenStart=pos-1;
  while(tokenStart>=0 && /[\w`.]/.test(text[tokenStart])) tokenStart--;
  tokenStart++;
  const token=text.substring(tokenStart,pos);

  // 空 token → 不弹窗
  if(!token || /^\s*$/.test(token)) { closeAutocomplete(); return; }

  // token 已经是一个完整关键字且后跟空格 → 不弹窗
  const charAfter=text[pos]||'';
  if(/[\s\n]/.test(charAfter) && SQL_KW_LIST.some(k=>k===token.toUpperCase())) { closeAutocomplete(); return; }

  // ---- 解析上下文：确定优先展示什么 ----
  const textBefore=text.substring(0,tokenStart);
  // 向前找到最近的非空白关键字
  let ctxWord='';
  const ctxMatch=textBefore.match(/(\w+)\s*$/);
  if(ctxMatch) ctxWord=ctxMatch[1].toUpperCase();

  // 判断优先级
  const wantTables=/^(FROM|JOIN|INNER|LEFT|RIGHT|OUTER|CROSS|FULL|INTO)$/i.test(ctxWord);
  const wantColumns=/^(SELECT|WHERE|AND|OR|NOT|ON|SET|ORDER|GROUP|BY|HAVING|LIKE|BETWEEN|IN|AS|DISTINCT)$/i.test(ctxWord) || /\.$/.test(token);

  // ---- 解析 table.column 模式 ----
  // 如 "user.id" → tablePart="user", columnPrefix="id"
  let tablePart='', columnPrefix='';
  if(token.includes('.')){
    const dotIdx=token.lastIndexOf('.');
    tablePart=token.substring(0,dotIdx).replace(/^`|`$/g,''); // 去反引号
    columnPrefix=token.substring(dotIdx+1).replace(/^`|`$/g,'');
  }
  // 反引号开头 → 去掉用于匹配
  const tokenLower=token.toLowerCase().replace(/^`|`$/g,'');
  // 如果 token 是 "table." 则匹配前缀是空（展示该表所有列）
  const matchPrefix=tablePart ? columnPrefix : tokenLower;

  // 构建候选列表
  const candidates=[];
  const seen=new Set();

  // ---- table.column 模式：只展示该表的列名 ----
  if(tablePart){
    const tableCols=dbstate.my.columns[tablePart]||[];
    tableCols.forEach(c=>{
      if(c.name.toLowerCase().startsWith(matchPrefix.toLowerCase())){
        seen.add(c.name.toUpperCase());
        candidates.push({label:c.name, type:'column', detail:c.type+(c.pk?' PK':'')});
      }
    });
    // 也没找到列 → 也尝试表名作为 . 的左半部分
    if(!candidates.length){
      (dbstate.my.tables||[]).forEach(t=>{
        if(t.toLowerCase().startsWith(tokenLower)){
          seen.add(t.toUpperCase());
          candidates.push({label:'`'+t+'`', type:'table'});
        }
      });
    }
  } else {
    // ---- 普通模式：按上下文优先级展示 ----

    // 1) 如果上下文暗示要列名 → 列名优先，关键字放后面
    // 2) 如果上下文暗示要表名 → 表名优先
    // 3) 默认：关键字 > 表名 > 列名

    if(wantColumns && dbstate.curTable){
      // 列名优先
      (dbstate.my.columns[dbstate.curTable]||[]).forEach(c=>{
        if(c.name.toLowerCase().startsWith(matchPrefix.toLowerCase()) && !seen.has(c.name.toUpperCase())){
          seen.add(c.name.toUpperCase()); candidates.push({label:c.name, type:'column', detail:c.type+(c.pk?' PK':'')});
        }
      });
    }

    if(wantTables){
      // 表名优先
      (dbstate.my.tables||[]).forEach(t=>{
        if(t.toLowerCase().startsWith(matchPrefix.toLowerCase()) && !seen.has(t.toUpperCase())){
          seen.add(t.toUpperCase()); candidates.push({label:'`'+t+'`', type:'table'});
        }
      });
    }

    // 关键字（非 table.column 模式时始终展示）
    if(!tablePart){
      SQL_KW_LIST.forEach(kw=>{
        if(kw.toLowerCase().startsWith(matchPrefix.toLowerCase()) && !seen.has(kw.toUpperCase())){
          seen.add(kw.toUpperCase()); candidates.push({label:kw, type:'keyword'});
        }
      });
    }

    // 补充：未在 wantTables 上下文中的表名
    if(!wantTables){
      (dbstate.my.tables||[]).forEach(t=>{
        if(t.toLowerCase().startsWith(matchPrefix.toLowerCase()) && !seen.has(t.toUpperCase())){
          seen.add(t.toUpperCase()); candidates.push({label:'`'+t+'`', type:'table'});
        }
      });
    }

    // 补充：未在 wantColumns 上下文中的列名
    if(!wantColumns && dbstate.curTable){
      (dbstate.my.columns[dbstate.curTable]||[]).forEach(c=>{
        if(c.name.toLowerCase().startsWith(matchPrefix.toLowerCase()) && !seen.has(c.name.toUpperCase())){
          seen.add(c.name.toUpperCase()); candidates.push({label:c.name, type:'column', detail:c.type+(c.pk?' PK':'')});
        }
      });
    }

    // 反引号开头 → 补全所有表的列名
    if(token.startsWith('`') && !tablePart){
      const afterBt=token.slice(1).replace(/`$/,'');
      (dbstate.my.tables||[]).forEach(t=>{
        (dbstate.my.columns[t]||[]).forEach(c=>{
          if(c.name.toLowerCase().startsWith(afterBt.toLowerCase()) && !seen.has(c.name.toUpperCase())){
            seen.add(c.name.toUpperCase()); candidates.push({label:c.name, type:'column', detail:c.type+' ('+t+')'});
          }
        });
      });
    }
  }

  if(!candidates.length){ closeAutocomplete(); return; }

  // 先关闭旧的，再创建新的
  closeAutocomplete();
  _acList=candidates; _acSelected=0; _acOpen=true;

  // 创建浮层 DOM
  const ac=document.createElement('div');
  ac.className='db-ac';
  ac.innerHTML=candidates.slice(0,20).map((c,i)=>{
    const badge=c.type==='keyword'?'KW':c.type==='table'?'TB':'CL';
    return `<button class="db-ac-item${i===0?' on':''}" data-idx="${i}"><span class="db-ac-badge db-ac-${c.type}">${badge}</span>${esc(c.label)}${c.detail?' <small>'+esc(c.detail)+'</small>':''}</button>`;
  }).join('');
  document.body.appendChild(ac);
  _acEl=ac;

  // 定位到光标像素坐标
  const rect=ta.getBoundingClientRect();
  const cursorText=text.substring(0,pos);
  const lineNum=(cursorText.match(/\n/g)||[]).length;
  const lastNL=cursorText.lastIndexOf('\n');
  const lineText=cursorText.substring(lastNL+1);

  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  ctx.font=getComputedStyle(ta).font;
  const lh=parseFloat(getComputedStyle(ta).lineHeight)||20;

  // 水平：gutter 42px + textarea padding 12px + 文本宽度
  const cursorX=42+12+ctx.measureText(lineText).width;
  const cursorY=8+lineNum*lh - ta.scrollTop;

  let left=rect.left+cursorX;
  let top=rect.top+cursorY+lh; // 光标下方一行
  // 视口边界翻转
  requestAnimationFrame(()=>{
    const mw=ac.offsetWidth, mh=ac.offsetHeight;
    const vw=availW(), vh=availH();
    if(left+mw>vw-8) left=Math.max(8,vw-mw-8);
    if(top+mh>vh-8) top=Math.max(8,rect.top+cursorY-mh); // 翻到光标上方
    ac.style.left=left+'px';
    ac.style.top=Math.max(0,top)+'px';
  });

  // 点击选择
  ac.addEventListener('mousedown',e=>{
    e.preventDefault(); // 阻止 textarea 失焦
    const btn=e.target.closest('.db-ac-item');
    if(btn){ _acSelected=+btn.dataset.idx; acceptAc(_acSelected); }
  });

  // 点击浮层外部 → 关闭
  _acDocClick=e=>{
    if(_acEl && !_acEl.contains(e.target) && e.target!==ta) closeAutocomplete();
  };
  document.addEventListener('click',_acDocClick);
}

function updateAcSelection(){
  if(!_acEl) return;
  const items=_acEl.querySelectorAll('.db-ac-item');
  items.forEach((el,i)=> el.classList.toggle('on', i===_acSelected));
  if(_acSelected>=0 && items[_acSelected]) items[_acSelected].scrollIntoView({block:'nearest'});
}

function acceptAc(idx){
  if(idx<0||idx>=_acList.length) return;
  const ta=$('#dbSql'); if(!ta) return;
  const item=_acList[idx];
  const pos=ta.selectionStart;
  // 找到 token 的起止位置（含 . 号以支持 table.column）
  let start=pos-1;
  while(start>=0 && /[\w`.]/.test(ta.value[start])) start--;
  start++;
  let end=pos;
  while(end<ta.value.length && /[\w`.]/.test(ta.value[end])) end++;
  // table.column 模式：如果选的是列名，只替换 . 后面的部分，保留表名前缀
  const fullToken=ta.value.substring(start,end);
  if(item.type==='column' && fullToken.includes('.')){
    const dotIdx=fullToken.lastIndexOf('.');
    const tablePrefix=fullToken.substring(0,dotIdx+1); // 保留 "user."
    ta.value=ta.value.substring(0,start)+tablePrefix+item.label+ta.value.substring(end);
    ta.selectionStart=ta.selectionEnd=start+tablePrefix.length+item.label.length;
  } else {
    ta.value=ta.value.substring(0,start)+item.label+ta.value.substring(end);
    ta.selectionStart=ta.selectionEnd=start+item.label.length;
  }
  closeAutocomplete();
  ta.dispatchEvent(new Event('input'));
  ta.focus();
}
function initSplitter(){
  const splitter=$('#dbSplitter'); if(!splitter)return;
  const editor=$('#dbEditor'); if(!editor)return;
  splitter.onmousedown=function(e){
    e.preventDefault();
    splitter.classList.add('active');
    document.body.style.userSelect='none';
    const startY=e.clientY;
    const startH=editor.offsetHeight;
    document.onmousemove=function(e){
      const dy=e.clientY-startY;
      const newH=Math.max(60,Math.min(availH()*0.6,startH+dy));
      editor.style.height=newH+'px';
    };
    document.onmouseup=function(){
      document.onmousemove=null; document.onmouseup=null;
      splitter.classList.remove('active');
      document.body.style.userSelect='';
    };
  };
}
function exportCSV(rows){
  if(!rows||!rows.length)return '';
  const keys=Object.keys(rows[0]);
  const header=keys.map(k=>'"'+k.replace(/"/g,'""')+'"').join(',');
  const body=rows.map(r=>keys.map(k=>{ const v=r[k]; if(v==null)return ''; const s=String(v); return '"'+s.replace(/"/g,'""')+'"'; }).join(',')).join('\n');
  return header+'\n'+body;
}

/* ===================== 右键上下文菜单 ===================== */
let _activeCtx=null;  // 当前打开的菜单引用（用于关闭）
function closeCtxMenu(){ if(_activeCtx){ _activeCtx.remove(); _activeCtx=null; } document.removeEventListener('click',closeCtxMenu); document.removeEventListener('keydown',ctxEsc); }
function ctxEsc(e){ if(e.key==='Escape') closeCtxMenu(); }

function tableContextMenu(table,x,y){
  closeCtxMenu();
  const menu=el('div','db-ctx'); _activeCtx=menu;
  // 关闭时机：下次 click 或 Escape
  requestAnimationFrame(()=>{ document.addEventListener('click',closeCtxMenu); document.addEventListener('keydown',ctxEsc); });

  function item(label,action){
    const b=el('button','db-ctx-item',label);
    b.onclick=e=>{ e.stopPropagation(); closeCtxMenu(); action(); };
    menu.appendChild(b);
  }
  function sep(){ menu.appendChild(el('div','db-ctx-sep')); }

  item('▶ SELECT * 查询',()=>{
    selectTable(table);
  });
  item('⌗ 查看结构',()=>showTableStruct(table));
  if(dbstate.driver==='mysql'){
    item('⬡ 建表语句',()=>showCreateTable(table));
  }
  sep();
  item('📋 复制表名',()=>copy(table,'已复制表名'));

  document.body.appendChild(menu);
  // 定位：先放到 DOM 里测量尺寸，再调整
  const mw=menu.offsetWidth, mh=menu.offsetHeight, vw=innerWidth, vh=innerHeight, pad=6;
  const left=x+mw+pad>vw ? Math.max(pad,x-mw-pad) : x+pad;
  const top=y+mh+pad>vh ? Math.max(pad,y-mh-pad) : y+pad;
  menu.style.left=left+'px'; menu.style.top=top+'px';
  menu.addEventListener('click',e=>e.stopPropagation());
}

/* ===================== 查看表结构 / 建表语句 ===================== */
async function showTableStruct(table){
  if(dbstate.driver==='mysql'){
    renderLoading();
    const r=await dbReq('query',{token:dbstate.my.token,sql:'SHOW FULL COLUMNS FROM `'+table+'`',maxRows:200});
    if(!r.ok){ renderResult({error:r.error,hint:r.hint}); setStatus('查看表结构失败：'+r.error,'err'); return; }
    const rows=(r.rows||[]).map(r=>({
      列名:r.Field, 类型:r.Type, 排序规则:r.Collation||'',
      可空:r.Null==='YES'?'✓':'', 键:r.Key||'—',
      默认值:r.Default!=null?String(r.Default):'NULL',
      Extra:r.Extra||'', 注释:r.Comment||''
    }));
    renderResult({rows,note:'SHOW FULL COLUMNS FROM `'+table+'` · '+rows.length+' 列 · '+r.elapsedMs+' ms'});
    setStatus('表结构 · '+table+' · '+rows.length+' 列','ok');
  } else {
    const cols=curCols(table);
    if(!cols.length){ setStatus('无该表的列信息，请先刷新','warn'); return; }
    const rows=cols.map(c=>({ 列名:c.name, 类型:c.type||'—', 主键:c.pk?'✓':'' }));
    renderResult({rows,note:table+' · '+rows.length+' 列（来自 OpenAPI schema）'});
    setStatus('表结构 · '+table+' · '+rows.length+' 列','ok');
  }
}
async function showCreateTable(table){
  renderLoading();
  const r=await dbReq('query',{token:dbstate.my.token,sql:'SHOW CREATE TABLE `'+table+'`',maxRows:1});
  if(!r.ok){ renderResult({error:r.error,hint:r.hint}); setStatus('查看建表语句失败：'+r.error,'err'); return; }
  const row=(r.rows||[])[0];
  if(!row){ renderResult({error:'无结果'}); return; }
  // MySQL 返回列名因表名而异（Table / Create Table 或其他大小写），取第二个字段
  const ddl=Object.values(row).find((_,i)=>i===1)||'';
  const note='SHOW CREATE TABLE `'+table+'` · '+r.elapsedMs+' ms';
  renderResult({rows:[{'建表语句':ddl}],note});
  setStatus('建表语句 · '+table,'ok');
}

function selectTable(t){
  const prevTable=dbstate.curTable;
  dbstate.curTable=t; save();
  renderTables(); renderToolbar();
  const ta=$('#dbSql');
  if(ta){
    const prevTpl=prevTable?'SELECT * FROM `'+prevTable+'` LIMIT 20':'';
    if(!ta.value.trim()||ta.value===prevTpl){
      ta.value='SELECT * FROM `'+t+'` LIMIT 20';
      ta.dispatchEvent(new Event('input'));
      runRead();
    }
  }
}

/* ===================== 侧边栏 Tab 切换 ===================== */
function switchSideTab(tab){
  dbstate.sideTab=tab;
  const tEl=$('#tabTables'), hEl=$('#tabHistory');
  const tables=$('#dbTables'), hist=$('#dbHistory');
  const search=$('#dbTableSearch');
  if(tEl) tEl.classList.toggle('on',tab==='tables');
  if(hEl) hEl.classList.toggle('on',tab==='history');
  if(tables) tables.style.display=tab==='tables'?'':'none';
  if(hist) hist.style.display=tab==='history'?'':'none';
  if(search){
    search.placeholder=tab==='history'?'搜索历史 SQL…':'搜索表名…';
    search.value='';
    search.oninput=tab==='history'?filterHistory:filterTables;
  }
  if(tab==='history') renderHistory();
}
function renderHistory(){
  const host=$('#dbHistory'); if(!host)return;
  const hist=loadHistory();
  const q=($('#dbTableSearch')?$('#dbTableSearch').value:'').trim().toLowerCase();
  const filtered=q?hist.filter(h=>h.sql.toLowerCase().includes(q)):hist;
  if(!filtered.length){ host.innerHTML='<div class="hist-empty">'+(q?'没有匹配的历史':'暂无执行记录')+'</div>'; return; }
  host.innerHTML=filtered.map((h,i)=>`
    <div class="dbt dbt-hist" data-idx="${i}">
      <span class="dbt-sql">${esc(h.sql.replace(/\n/g,' '))}</span>
      <span class="dbt-meta">${relTime(h.ts)} · ${h.ms}ms${h.affected!=null?' · '+h.affected+'行':' · '+h.rows+'行'}</span>
      <span class="dbt-acts">
        <span class="dbt-hist-act" data-act="copy" title="复制 SQL">📋</span>
        <span class="dbt-hist-act" data-act="use" title="切入编辑器">↗</span>
        <span class="dbt-hist-act" data-act="del" title="删除">✕</span>
      </span>
    </div>`).join('');
  host.querySelectorAll('.dbt-hist').forEach(el=>{
    const idx=+el.dataset.idx;
    const h=filtered[idx]; if(!h)return;
    el.onclick=e=>{
      const act=e.target.dataset.act;
      if(act==='copy'){ copy(h.sql,'SQL'); return; }
      if(act==='del'){
        const all=loadHistory();
        const origIdx=all.findIndex(x=>x.ts===h.ts&&x.sql===h.sql);
        if(origIdx>=0){ all.splice(origIdx,1); historyStore.set(all); renderHistory(); }
        return;
      }
      // 默认：切入编辑器
      useHistorySql(h.sql);
    };
  });
}
function filterHistory(){
  if(dbstate.sideTab!=='history')return;
  renderHistory();
}
function useHistorySql(sql){
  const ta=$('#dbSql'); if(!ta)return;
  ta.value=sql;
  const wrap=$('#dbEditor');
  if(wrap){
    ta.style.height='auto';
    const h=Math.min(availH()*0.6,Math.max(200,ta.scrollHeight+4));
    ta.style.height='';
    wrap.style.height=h+'px';
  }
  ta.focus();
  setStatus('已切入编辑器','ok');
}

/* ===================== 读 ===================== */
async function runRead(){
  if(dbstate.driver==='mysql'){
    const ta=$('#dbSql');
    // 选中执行：如果有选中文本，只执行选中部分
    let sql=ta&&ta.value?ta.value.trim():'';
    if(ta&&ta.selectionStart!==ta.selectionEnd){
      sql=ta.value.substring(ta.selectionStart,ta.selectionEnd).trim();
    }
    if(!sql){ setStatus('请输入 SQL','warn'); return; }
    renderLoading(); const r=await dbReq('query',{token:dbstate.my.token,sql,maxRows:20});
    if(!r.ok){ renderResult({error:r.error,hint:r.hint}); if(r.code==='NO_SESSION'){ dbstate.my.token=null; renderBody(); } setStatus('查询失败：'+r.error,'err'); return; }
    if(r.columns&&r.columns.length===0&&r.affectedRows!=null){
      renderResult({rows:[],note:'非查询语句 · 影响 '+r.affectedRows+' 行'});
      pushHistory(sql,0,r.elapsedMs,r.affectedRows);
      setStatus('已执行 · 影响 '+r.affectedRows+' 行','ok'); return;
    }
    renderResult({rows:r.rows||[],note:'共 '+r.rowCount+' 行'+(r.truncated?'（已截断至 '+r.maxRows+'）':'')+' · '+r.elapsedMs+' ms'});
    pushHistory(sql,r.rowCount,r.elapsedMs);
    setStatus('查询成功 · '+r.rowCount+' 行 · '+r.elapsedMs+' ms','ok');
    // 刷新历史面板
    if(dbstate.sideTab==='history') renderHistory();
  } else {
    const table=dbstate.curTable; if(!table){ setStatus('请先选择一张表','warn'); return; }
    const filter=($('#sbFilter')&&$('#sbFilter').value||'').trim(); const limit=($('#sbLimit')&&$('#sbLimit').value||'20').trim();
    renderLoading();
    try{
      let q='/rest/v1/'+encodeURIComponent(table)+'?select=*'; if(filter)q+='&'+filter; q+='&limit='+(limit||200);
      const res=await sbFetch(q); const rows=await res.json();
      if(!res.ok){ renderResult({error:(rows&&(rows.message||rows.hint))||('HTTP '+res.status)}); setStatus('查询失败','err'); return; }
      renderResult({rows:Array.isArray(rows)?rows:[rows],note:'共 '+(Array.isArray(rows)?rows.length:1)+' 行'});
      setStatus('查询成功 · '+(Array.isArray(rows)?rows.length:1)+' 行','ok');
    }catch(e){ renderResult({error:e.message,hint:'CORS？可在连接时勾选「经本地代理」'}); setStatus('查询失败：'+e.message,'err'); }
  }
}
function renderLoading(){ const h=$('#dbResult'); if(h)h.innerHTML='<div class="res-loading"><span class="spin"></span> 执行中…</div>'; }
function renderResult(res){
  const host=$('#dbResult'); if(!host)return; dbstate.result=res; host.innerHTML='';
  if(!res){ host.innerHTML='<div class="res-idle"><div class="big">无结果</div></div>'; return; }
  if(res.error){ host.innerHTML='<div class="res-err"><div class="ti">⚠ 执行失败</div><div>'+esc(res.error)+'</div>'+(res.hint?'<div class="hintbox">'+esc(res.hint)+'</div>':'')+'</div>'; return; }
  // 结果工具栏
  if(res.note||res.rows){
    const bar=el('div','db-result-bar');
    const note=el('span','note'); note.innerHTML=res.note?res.note.replace(/(\d+)\s*(行|ms)/g,'<strong>$1</strong> $2'):'';
    bar.appendChild(note);
    if(res.rows&&res.rows.length){
      const btnJson=el('button','db-export-btn','复制 JSON');
      btnJson.onclick=()=>{ copy(JSON.stringify(res.rows,null,2),'JSON'); };
      const btnCsv=el('button','db-export-btn','复制 CSV');
      btnCsv.onclick=()=>{ copy(exportCSV(res.rows),'CSV'); };
      bar.append(btnJson,btnCsv);
    }
    host.appendChild(bar);
  }
  dbstate.view.tableSel=null;
  host.appendChild(viewTable(res.rows||[], dbstate.view));
}

/* ===================== 写：预览 → 确认 → 执行 ===================== */
async function openCrud(mode){
  const table=dbstate.curTable, cols=curCols(table), pk=pkOf(table);
  if((mode==='update'||mode==='delete') && !cols.some(c=>c.pk) && dbstate.driver==='mysql')
    setStatus('该表无主键，改/删请谨慎（将用首列 '+pk+' 作为条件）','warn');
  const bodyEl=el('div');
  let row=null;
  if(mode==='insert'){
    const form=el('div'); cols.forEach(c=>{ const rowEl=el('div','db-kv');
      rowEl.innerHTML=`<label title="${esc(c.name)}">${esc(c.name)} <small>${esc(c.type||'')}${c.pk?' · PK':''}</small></label>`;
      const inp=el('input','t-in'); inp.dataset.col=c.name; inp.placeholder=c.pk?'(自增可留空)':'值；NULL/true/false/数字会自动识别';
      rowEl.appendChild(inp); form.appendChild(rowEl); });
    bodyEl.appendChild(form);
    bodyEl.appendChild(el('div','t-note','留空的列：新增时忽略。输入 NULL 置空。'));
  }
  if(mode==='update'||mode==='delete'){
    // 在 modal 中内联输入主键值
    const pkWrap=el('div','db-kv');
    pkWrap.innerHTML=`<label>${esc(pk)} <small>主键</small></label>`;
    const pkInp=el('input','t-in'); pkInp.id='dbPkInput'; pkInp.placeholder='输入 '+pk+' 的值';
    pkWrap.appendChild(pkInp);
    bodyEl.appendChild(pkWrap);
    // delete 模式需要先查找行
  }
  const prevArea=el('div','db-prev',''); prevArea.id='dbPrev'; bodyEl.appendChild(prevArea);
  dbModal({insert:'新增行',update:'修改行',delete:'删除行'}[mode]+' · '+table, bodyEl, mode==='delete'?'删除':'预览', async(modal,setOk)=>{
    const pkInput=$('#dbPkInput',modal);
    if((mode==='update'||mode==='delete') && !row){
      const pkv=pkInput?(pkInput.value||'').trim():null;
      if(!pkv){ setStatus('请输入主键 '+pk+' 的值','warn'); return false; }
      row=await fetchRow(table,pk,pkv);
      if(!row){ setStatus('未找到 '+pk+'='+pkv+' 的记录','err'); return false; }
      row.__pkval=pkv;
      if(mode==='update'){
        // 动态填充编辑表单
        const form=el('div'); cols.forEach(c=>{ const rowEl=el('div','db-kv');
          rowEl.innerHTML=`<label title="${esc(c.name)}">${esc(c.name)} <small>${esc(c.type||'')}${c.pk?' · PK':''}</small></label>`;
          const inp=el('input','t-in'); inp.dataset.col=c.name; inp.value=fmtCell(row[c.name]); inp.placeholder=c.pk?'(自增可留空)':'值；NULL/true/false/数字会自动识别';
          rowEl.appendChild(inp); form.appendChild(rowEl); });
        bodyEl.insertBefore(form,prevArea);
        bodyEl.insertBefore(el('div','t-note','留空的列：新增时忽略；修改时设为空串。输入 NULL 置空。'),prevArea);
      }
      const built=buildWrite(mode,table,cols,pk,bodyEl,row);
      if(built.error){ setStatus(built.error,'err'); return false; }
      prevArea.textContent=built.preview;
      if(mode==='delete'){ setOk('确认删除'); setStatus('请核对预览后再次点击执行','warn'); return false; }
    }
    const built=buildWrite(mode,table,cols,pk,bodyEl,row);
    if(built.error){ setStatus(built.error,'err'); return false; }
    const prev=$('#dbPrev',modal); prev.textContent=built.preview;
    // 二次确认执行
    if(modal._confirmed!==built.preview){ modal._confirmed=built.preview; setOk(mode==='delete'?'确认删除':'确认执行'); setStatus('请核对预览后再次点击执行','warn'); return false; }
    const r=await execWrite(mode,table,pk,built);
    if(!r.ok){ setStatus((mode==='delete'?'删除':mode==='insert'?'新增':'修改')+'失败：'+r.error,'err'); return false; }
    setStatus('✓ '+(mode==='delete'?'已删除':mode==='insert'?'已新增':'已修改')+(r.affectedRows!=null?(' · 影响 '+r.affectedRows+' 行'):''),'ok');
    runRead(); return true;
  });
  if(mode==='delete'){ const built=buildWrite('delete',table,cols,pk,bodyEl,row); $('#dbPrev').textContent=built.preview; }
}
function askPk(pk){ return new Promise(res=>{ const v=prompt('输入要操作的主键 '+pk+' 的值：'); res(v==null?null:v.trim()); }); }
async function fetchRow(table,pk,pkv){
  if(dbstate.driver==='mysql'){ const r=await dbReq('query',{token:dbstate.my.token,sql:'SELECT * FROM `'+table+'` WHERE `'+pk+'`=%s LIMIT 1',params:[coerce(pkv)]}); return (r.ok&&r.rows&&r.rows[0])||null; }
  try{ const res=await sbFetch('/rest/v1/'+encodeURIComponent(table)+'?select=*&'+encodeURIComponent(pk)+'=eq.'+encodeURIComponent(pkv)+'&limit=1'); const j=await res.json(); return (Array.isArray(j)&&j[0])||null; }catch(e){ return null; }
}
function fmtCell(v){ return v==null?'':(typeof v==='object'?JSON.stringify(v):String(v)); }
function collectForm(bodyEl,mode){ const out={}; $$('input[data-col]',bodyEl).forEach(inp=>{ const c=inp.dataset.col, raw=inp.value; if(mode==='insert'&&raw==='')return; out[c]=coerce(raw); }); return out; }

function buildWrite(mode,table,cols,pk,bodyEl,row){
  const my=dbstate.driver==='mysql';
  if(mode==='delete'){ const pkv=coerce(row.__pkval);
    if(my) return {sql:'DELETE FROM `'+table+'` WHERE `'+pk+'`=%s',params:[pkv],preview:'DELETE FROM `'+table+'` WHERE `'+pk+'` = '+JSON.stringify(pkv)};
    return {method:'DELETE',path:'/rest/v1/'+encodeURIComponent(table)+'?'+encodeURIComponent(pk)+'=eq.'+encodeURIComponent(row.__pkval),preview:'DELETE '+table+' WHERE '+pk+' = '+JSON.stringify(row.__pkval)};
  }
  const data=collectForm(bodyEl,mode);
  const keys=Object.keys(data);
  if(!keys.length) return {error:'没有要写入的列'};
  if(mode==='insert'){
    if(my){ const ph=keys.map(()=>'%s'); return {sql:'INSERT INTO `'+table+'` ('+keys.map(k=>'`'+k+'`').join(',')+') VALUES ('+ph.join(',')+')',params:keys.map(k=>data[k]),preview:'INSERT INTO `'+table+'` ('+keys.join(', ')+')\nVALUES ('+keys.map(k=>JSON.stringify(data[k])).join(', ')+')'}; }
    return {method:'POST',path:'/rest/v1/'+encodeURIComponent(table),body:data,preview:'POST /rest/v1/'+table+'\n'+JSON.stringify(data,null,2)};
  }
  // update
  const pkv=coerce(row.__pkval); const setKeys=keys.filter(k=>k!==pk);
  if(!setKeys.length) return {error:'没有可修改的列（除主键外）'};
  if(my){ return {sql:'UPDATE `'+table+'` SET '+setKeys.map(k=>'`'+k+'`=%s').join(', ')+' WHERE `'+pk+'`=%s',params:setKeys.map(k=>data[k]).concat([pkv]),preview:'UPDATE `'+table+'` SET\n  '+setKeys.map(k=>'`'+k+'` = '+JSON.stringify(data[k])).join(',\n  ')+'\nWHERE `'+pk+'` = '+JSON.stringify(pkv)}; }
  const bodyObj={}; setKeys.forEach(k=>bodyObj[k]=data[k]);
  return {method:'PATCH',path:'/rest/v1/'+encodeURIComponent(table)+'?'+encodeURIComponent(pk)+'=eq.'+encodeURIComponent(row.__pkval),body:bodyObj,preview:'PATCH /rest/v1/'+table+'?'+pk+'=eq.'+row.__pkval+'\n'+JSON.stringify(bodyObj,null,2)};
}
async function execWrite(mode,table,pk,built){
  if(dbstate.driver==='mysql'){ return dbReq('exec',{token:dbstate.my.token,sql:built.sql,params:built.params}); }
  try{ const res=await sbFetch(built.path,{method:built.method,headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:built.body!=null?JSON.stringify(built.body):undefined});
    const txt=await res.text(); let j; try{ j=txt?JSON.parse(txt):null; }catch(e){ j=txt; }
    if(!res.ok) return {ok:false,error:(j&&(j.message||j.hint))||('HTTP '+res.status)};
    return {ok:true,affectedRows:Array.isArray(j)?j.length:undefined};
  }catch(e){ return {ok:false,error:e.message}; }
}

/* ===================== 轻量模态 ===================== */
function dbModal(title, bodyEl, okLabel, onOk){
  const bg=$('#modalBg'); const m=el('div','modal wide');
  m.innerHTML=`<h3>${esc(title)}</h3>`;
  const wrap=el('div','field'); wrap.appendChild(bodyEl); m.appendChild(wrap);
  const acts=el('div','acts'); const sp=el('div'); sp.style.flex='1';
  const cancel=el('button','btn ghost','取消'); cancel.onclick=close;
  const ok=el('button','btn primary',okLabel); ok.onclick=async()=>{ const keep=await onOk(m,(lbl)=>ok.textContent=lbl); if(keep!==false) close(); };
  acts.append(sp,cancel,ok); m.appendChild(acts);
  bg.innerHTML=''; bg.appendChild(m); bg.classList.add('open'); bg.onclick=e=>{ if(e.target===bg)close(); };
  bg.onkeydown=e=>{ if(e.key==='Escape')close(); };
  function close(){ bg.classList.remove('open'); bg.innerHTML=''; bg.onkeydown=null; }
}

/* ===================== AI 助手导出 ===================== */
export function getDbState() { return dbstate; }
export { dbReq };
