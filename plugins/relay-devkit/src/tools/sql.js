// tools/sql.js — SQL 模板填充：预编译 ?+参数 / MyBatis 日志 → 可执行 SQL（分词式高亮）。自管 localStorage。
import { $, $$, esc, copy, store } from '../core/dom.js';

let sqlMode='tpl'; const sqlstore=store('sql');
export function initSqlTool(){
  const v=$('#viewSql');
  v.innerHTML=`
  <div class="tool-pane">
    <div class="t-bar">
      <span class="t-title"><span class="tg">≡</span> SQL 模板填充</span>
      <div class="t-seg" id="sqlSeg"><button data-m="tpl" class="on">? + 参数</button><button data-m="log">MyBatis 日志</button></div>
      <button class="t-btn primary" data-sa="run">▶ 生成 SQL</button>
      <button class="t-btn" data-sa="sample">示例</button>
      <button class="t-btn" data-sa="clear">清空</button>
      <span class="sp"></span>
      <button class="t-btn" data-sa="copy">⧉ 复制结果</button>
    </div>
    <div class="t-body">
      <div id="sqlTplBox">
        <div class="t-field"><label>预编译 SQL + 参数（一段粘贴，用 ::: 分隔；参数中括号 [ ] 可省略；自动清洗 “*/ ” 日志前缀）</label><textarea class="t-ta" id="sqlTpl" spellcheck="false" style="min-height:170px" placeholder="SELECT * FROM user WHERE id = ? AND status = ? ::: [1, active]"></textarea></div>
      </div>
      <div id="sqlLogBox" style="display:none">
        <div class="t-field"><label>MyBatis 日志（含 Preparing 与 Parameters 行）</label><textarea class="t-ta" id="sqlLog" spellcheck="false" style="min-height:150px" placeholder="==>  Preparing: SELECT * FROM user WHERE id = ? AND name = ?&#10;==> Parameters: 1(Integer), relay(String)"></textarea></div>
      </div>
      <div class="t-field"><label>结果</label><pre class="t-out" id="sqlOut"></pre><div class="t-note" id="sqlNote"></div></div>
    </div>
  </div>`;
  $$('#sqlSeg button').forEach(b=>b.onclick=()=>{ sqlMode=b.dataset.m; $$('#sqlSeg button').forEach(x=>x.classList.toggle('on',x===b)); $('#sqlTplBox').style.display=sqlMode==='tpl'?'':'none'; $('#sqlLogBox').style.display=sqlMode==='log'?'':'none'; sqlPersist(); sqlRun(); });
  v.querySelectorAll('[data-sa]').forEach(b=>b.onclick=()=>sqlAction(b.dataset.sa));
  ['sqlTpl','sqlLog'].forEach(id=>{ const t=$('#'+id); t.addEventListener('input',()=>{ sqlPersist(); sqlRun(); }); t.addEventListener('keydown',e=>{ if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){ e.preventDefault(); sqlRun(); } }); });
  const sv=sqlstore.get();
  if(sv){ if(sv.tpl!=null)$('#sqlTpl').value=sv.tpl; if(sv.log!=null)$('#sqlLog').value=sv.log; if(sv.mode){ sqlMode=sv.mode; $$('#sqlSeg button').forEach(x=>x.classList.toggle('on',x.dataset.m===sqlMode)); $('#sqlTplBox').style.display=sqlMode==='tpl'?'':'none'; $('#sqlLogBox').style.display=sqlMode==='log'?'':'none'; } }
  sqlRun();
}
function sqlPersist(){ sqlstore.set({mode:sqlMode,tpl:($('#sqlTpl')||{}).value||'',log:($('#sqlLog')||{}).value||''}); }
function sqlAction(a){
  if(a==='clear'){ if(sqlMode==='tpl') $('#sqlTpl').value=''; else $('#sqlLog').value=''; sqlPersist(); sqlRun(); return; }
  if(a==='sample'){ if(sqlMode==='tpl'){ $('#sqlTpl').value='SELECT id, name, status FROM user WHERE dept_id = ? AND status = ? AND name LIKE ? AND deleted = ? ::: [10, active, %relay%, false]'; } else { $('#sqlLog').value='2026-06-06 10:00:00 DEBUG c.m.U.find ==>  Preparing: SELECT * FROM user WHERE id = ? AND name = ? AND created_at > ?\n2026-06-06 10:00:00 DEBUG c.m.U.find ==> Parameters: 1(Long), O\'Brien(String), 2025-01-01 00:00:00(Timestamp)'; } sqlPersist(); sqlRun(); return; }
  if(a==='copy'){ const out=$('#sqlOut').textContent; if(out.trim())copy(out,'SQL 已复制'); return; }
  if(a==='run'){ sqlRun(); return; }
}
function sqlRun(){
  const out=$('#sqlOut'),note=$('#sqlNote'); if(!out)return;
  let sql,params,res;
  if(sqlMode==='tpl'){
    const input=stripSqlPrefix($('#sqlTpl').value);
    if(!input.trim()){ out.innerHTML=''; note.textContent=''; note.className='t-note'; return; }
    const idx=input.indexOf(':::');
    sql=(idx>=0?input.slice(0,idx):input).trim();
    params=parseParamList(idx>=0?input.slice(idx+3):'');
    res=fillSql(sql,params.map(sqlLit));
  }else{
    const log=$('#sqlLog').value; if(!log.trim()){ out.innerHTML=''; note.textContent=''; note.className='t-note'; return; }
    const mb=parseMyBatis(log);
    if(!mb){ out.innerHTML=''; note.textContent='未识别到 Preparing 行（需包含 “Preparing: …”）。'; note.className='t-note err'; return; }
    sql=mb.sql; params=mb.params; res=fillSql(sql,params);
  }
  out.innerHTML=hlSQL(res.sql);
  const qn=res.holes, pn=params.length;
  if(res.missing>0){ note.textContent='⚠ 占位符 '+qn+' 个 · 参数 '+pn+' 个：缺 '+res.missing+' 个（已保留 ?）'; note.className='t-note err'; }
  else if(pn>qn){ note.textContent='⚠ 占位符 '+qn+' 个 · 参数 '+pn+' 个：多出 '+(pn-qn)+' 个（已忽略）'; note.className='t-note'; }
  else { note.textContent='✓ 占位符 '+qn+' 个 · 参数 '+pn+' 个 · 已全部填充'; note.className='t-note ok'; }
}
function stripSqlPrefix(s){ const i=s.indexOf('*/ '); return i!==-1?s.slice(i+3):s; }
function parseParamList(raw){ let s=raw.trim(); if(!s)return []; if(s.startsWith('[')&&s.endsWith(']'))s=s.slice(1,-1); const parts=s.indexOf('\n')>=0?s.split('\n'):s.split(','); return parts.map(x=>x.trim()).filter(x=>x!==''); }
function sqlLit(tok){ const s=String(tok).trim();
  if(s==='')return "''";
  if(/^null$/i.test(s))return 'NULL';
  if(/^true$/i.test(s))return 'TRUE';
  if(/^false$/i.test(s))return 'FALSE';
  if(/^-?\d+(\.\d+)?$/.test(s))return s;
  if((s.startsWith("'")&&s.endsWith("'")&&s.length>1)||(s.startsWith('"')&&s.endsWith('"')&&s.length>1))return "'"+s.slice(1,-1).replace(/'/g,"''")+"'";
  return "'"+s.replace(/'/g,"''")+"'";
}
function fillSql(sql,lits){
  let out='',i=0,holes=0,inS=false,sc='',inLine=false,inBlk=false;
  for(let p=0;p<sql.length;p++){ const c=sql[p],n=sql[p+1];
    if(inLine){ out+=c; if(c==='\n')inLine=false; continue; }
    if(inBlk){ out+=c; if(c==='*'&&n==='/'){ out+=n; p++; inBlk=false; } continue; }
    if(inS){ out+=c; if(c===sc){ if(sql[p+1]===sc){ out+=sql[++p]; } else inS=false; } continue; }
    if(c==='-'&&n==='-'){ inLine=true; out+=c; continue; }
    if(c==='/'&&n==='*'){ inBlk=true; out+=c; continue; }
    if(c==="'"||c==='"'){ inS=true; sc=c; out+=c; continue; }
    if(c==='?'){ holes++; if(i<lits.length)out+=lits[i++]; else out+='?'; continue; }
    out+=c;
  }
  return {sql:out,holes,used:i,missing:Math.max(0,holes-lits.length)};
}
function parseMyBatis(log){
  const pm=/Preparing:\s*(.+?)\s*$/im.exec(log); if(!pm)return null;
  const sql=pm[1].trim();
  const am=/Parameters:\s*(.*)$/im.exec(log); let lits=[];
  if(am){ const raw=am[1].trim(); if(raw){ lits=splitMyBatisParams(raw).map(tok=>{ tok=tok.trim(); if(tok===''||/^null$/i.test(tok))return /^null$/i.test(tok)?'NULL':"''"; const m=/^([\s\S]*)\(([A-Za-z]+)\)$/.exec(tok); if(m)return mybatisLit(m[1],m[2]); return sqlLit(tok); }); } }
  return {sql,params:lits};
}
function splitMyBatisParams(raw){ const parts=[]; let cur='',depth=0; for(let i=0;i<raw.length;i++){ const c=raw[i]; if(c==='(')depth++,cur+=c; else if(c===')')depth--,cur+=c; else if(c===','&&depth<=0){ parts.push(cur); cur=''; } else cur+=c; } if(cur.trim()!=='')parts.push(cur); return parts; }
function mybatisLit(val,type){ const t=type.toLowerCase(); val=val.trim();
  if(/^(integer|int|long|short|byte|double|float|bigdecimal|decimal|number)$/.test(t))return val===''?'NULL':val;
  if(/^bool/.test(t))return /^true$/i.test(val)?'TRUE':'FALSE';
  return "'"+val.replace(/'/g,"''")+"'";
}
const SQL_KW_SET=new Set('SELECT FROM WHERE AND OR NOT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP JOIN LEFT RIGHT INNER OUTER FULL CROSS ON GROUP BY ORDER LIMIT OFFSET HAVING AS IN IS NULL LIKE BETWEEN DISTINCT COUNT SUM AVG MIN MAX ASC DESC UNION ALL EXISTS CASE WHEN THEN ELSE END TRUE FALSE'.split(' '));
/* 分词式高亮：逐 token 转义，避免 esc 实体（如 &#39;）被数字正则破坏 */
function hlSQL(sql){
  let out='',i=0; const push=(cls,txt)=>{ out+= cls?'<span class="'+cls+'">'+esc(txt)+'</span>':esc(txt); };
  while(i<sql.length){ const c=sql[i];
    if(c==="'"){ let j=i+1,s="'"; while(j<sql.length){ s+=sql[j]; if(sql[j]==="'"){ if(sql[j+1]==="'"){ s+="'"; j+=2; continue; } j++; break; } j++; } push('tok-str',s); i=j; continue; }
    if(/[0-9]/.test(c) && !/[A-Za-z_]/.test(sql[i-1]||'')){ let j=i,s=''; while(j<sql.length&&/[0-9.]/.test(sql[j])){ s+=sql[j]; j++; } push('tok-num',s); i=j; continue; }
    if(/[A-Za-z_]/.test(c)){ let j=i,s=''; while(j<sql.length&&/[A-Za-z_0-9]/.test(sql[j])){ s+=sql[j]; j++; } push(SQL_KW_SET.has(s.toUpperCase())?'tok-key':'',s); i=j; continue; }
    push('',c); i++;
  }
  return out;
}
