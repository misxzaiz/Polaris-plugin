// tools/time.js — 时间戳转换：epoch ↔ 本地/UTC/ISO/相对，秒/毫秒/微秒/纳秒自动识别，双向互转。
import { $, $$, esc, copy, fmtDate } from '../core/dom.js';

const tzState={utc:false}; let timeClock=null;
export function initTimeTool(){
  const v=$('#viewTime');
  v.innerHTML=`
  <div class="tool-pane">
    <div class="t-bar">
      <span class="t-title"><span class="tg">◷</span> 时间戳转换</span>
      <button class="t-btn" data-tnow="1">⟳ 用当前时间</button>
      <div class="t-seg" id="tzSeg"><button data-tz="local" class="on">本地时区</button><button data-tz="utc">UTC</button></div>
      <span class="sp"></span>
    </div>
    <div class="t-body">
      <div class="t-now"><span class="lab">现在</span><span class="clk" id="timeNow"></span><button class="cp" data-tcp="nowsec">复制秒</button><button class="cp" data-tcp="nowms">复制毫秒</button></div>
      <div class="t-grid">
        <div class="t-card"><h4>时间戳 → 时间</h4><input class="t-in" id="tsIn" spellcheck="false" placeholder="输入 epoch：秒 / 毫秒 / 微秒，自动识别"><div id="tsOut" style="margin-top:12px"></div></div>
        <div class="t-card"><h4>时间 → 时间戳</h4><input class="t-in" id="dtIn" spellcheck="false" placeholder="如 2025-12-01 08:30:00 或 2025-12-01T08:30:00Z"><div id="dtOut" style="margin-top:12px"></div></div>
      </div>
    </div>
  </div>`;
  $('#tsIn').addEventListener('input',timeRenderTs);
  $('#dtIn').addEventListener('input',timeRenderDt);
  $$('#tzSeg button').forEach(b=>b.onclick=()=>{ tzState.utc=b.dataset.tz==='utc'; $$('#tzSeg button').forEach(x=>x.classList.toggle('on',x===b)); timeRenderTs(); timeRenderDt(); });
  v.querySelectorAll('[data-tnow]').forEach(b=>b.onclick=()=>{ $('#tsIn').value=String(Date.now()); timeRenderTs(); });
  v.querySelectorAll('[data-tcp]').forEach(b=>b.onclick=()=>{ const now=Date.now(); copy(b.dataset.tcp==='nowsec'?String(Math.floor(now/1000)):String(now),'已复制'); });
  timeTick(); if(timeClock)clearInterval(timeClock); timeClock=setInterval(timeTick,1000);
  timeRenderTs(); timeRenderDt();
}
function timeTick(){ const e=$('#timeNow'); if(!e)return; const d=new Date(); e.textContent=(tzState.utc?fmtUTC(d):fmtDate(d))+'  ·  '+Math.floor(Date.now()/1000)+' s'; }
function kvRow(k,val){ return '<div class="kvline"><span class="kk">'+esc(k)+'</span><span class="vv">'+esc(val)+'</span><button class="cp" data-cv="'+esc(val)+'">复制</button></div>'; }
function bindCopies(host){ host.querySelectorAll('[data-cv]').forEach(b=>b.onclick=()=>copy(b.dataset.cv,'已复制')); }
function tsToDate(raw){ const s=String(raw).trim(); if(!/^-?\d+$/.test(s))return null; const digits=s.replace('-','').length; const n=Number(s); if(!isFinite(n))return null; let date,unit; if(digits<=10){ date=new Date(n*1000); unit='秒'; } else if(digits<=13){ date=new Date(n); unit='毫秒'; } else if(digits<=16){ date=new Date(Math.round(n/1000)); unit='微秒'; } else { date=new Date(Math.round(n/1e6)); unit='纳秒'; } return isNaN(+date)?null:{date,unit}; }
function fmtUTC(d){ const p=n=>String(n).padStart(2,'0'); return d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate())+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes())+':'+p(d.getUTCSeconds()); }
function relTime(d){ const diff=Date.now()-(+d),a=Math.abs(diff),f=diff>=0; const u=[['年',31536e6],['天',864e5],['小时',36e5],['分钟',6e4],['秒',1e3]]; for(const [name,ms2] of u){ if(a>=ms2){ const val=Math.floor(a/ms2); return val+name+(f?'前':'后'); } } return '刚刚'; }
function timeRenderTs(){
  const inp=$('#tsIn'); if(!inp)return; const raw=inp.value.trim(); const host=$('#tsOut');
  if(!raw){ host.innerHTML='<div class="t-note">输入数字时间戳…</div>'; return; }
  const r=tsToDate(raw); if(!r){ host.innerHTML='<div class="t-note err">不是合法的数字时间戳。</div>'; return; }
  const d=r.date;
  host.innerHTML=kvRow('识别为',r.unit+'（'+raw.replace('-','').length+' 位）')
    +kvRow(tzState.utc?'UTC 时间':'本地时间',tzState.utc?fmtUTC(d):fmtDate(d))
    +kvRow(tzState.utc?'本地时间':'UTC 时间',tzState.utc?fmtDate(d):fmtUTC(d))
    +kvRow('ISO 8601',d.toISOString())
    +kvRow('相对',relTime(d))
    +kvRow('秒',String(Math.floor(+d/1000)))
    +kvRow('毫秒',String(+d));
  bindCopies(host);
}
function timeRenderDt(){
  const inp=$('#dtIn'); if(!inp)return; const raw=inp.value.trim(); const host=$('#dtOut');
  if(!raw){ host.innerHTML='<div class="t-note">输入日期时间字符串…</div>'; return; }
  let d=new Date(raw); if(isNaN(+d)) d=new Date(raw.replace(' ','T'));
  if(isNaN(+d)){ host.innerHTML='<div class="t-note err">无法解析该日期。试试 2025-12-01 08:30:00 或带 Z 的 ISO 串。</div>'; return; }
  host.innerHTML=kvRow('秒 epoch',String(Math.floor(+d/1000)))
    +kvRow('毫秒 epoch',String(+d))
    +kvRow('本地时间',fmtDate(d))
    +kvRow('UTC 时间',fmtUTC(d))
    +kvRow('ISO 8601',d.toISOString())
    +kvRow('相对',relTime(d));
  bindCopies(host);
}
