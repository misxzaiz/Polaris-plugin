'use strict';
/**
 * datetime-lens MCP server（stdio JSON-RPC 2.0）
 * stdout 只输出协议 JSON 行；一切日志走 stderr（platform-constraints 纪律）。
 * 五工具：datetime_lens_parse / convert / wall_resolve / arith / format
 * 引擎复用 shared/datetime-core.js（与面板同一权威；纯本地零外联零 kv）。
 */
const core = require('../shared/datetime-core.js');

const SERVER_INFO = { name: 'datetime-lens', version: '0.1.0' };

const DEFAULT_ZONES = ['UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'America/Los_Angeles'];

const TOOLS = [
  {
    name: 'datetime_lens_parse',
    description:
      '把任意日期时间字符串解析为权威解读并做坑检测。支持 now、Unix 秒/毫秒/微秒/纳秒（按位数猜单位并列歧义）、ISO 8601/RFC 3339、date-only、YYYY-MM、RFC 2822 邮件日期、HTTP 日期。检测坑：date-only 按 UTC 而非本地、无偏移时间按本地时区（floating）、DST 空洞/歧义、两位年、闰秒、2038、ISO 周年错位、JS Date.parse 差分实况。失败给原因与支持格式清单。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '日期时间原文，如 "2026-11-04T08:00:00+08:00"、"1762212000"、"now"、"Mon, 04 Nov 2026 08:00:00 GMT"' },
        zone: { type: 'string', description: '解读时区（date-only/无偏移形态按此消解），IANA 名如 America/New_York；缺省用宿主本地时区' },
      },
      required: ['text'],
    },
  },
  {
    name: 'datetime_lens_convert',
    description:
      '把一个日期时间解析为瞬间后投影到多个时区：每时区给出墙钟、UTC 偏移、是否夏令时、星期。用于回答「UTC 08:00 是上海几点」「纽约现在处于夏令时吗」。无偏移的输入按 zones 首个时区消解（默认表首为 UTC）。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '日期时间原文（同 datetime_lens_parse 支持的格式）' },
        zones: { type: 'array', items: { type: 'string' }, description: '目标 IANA 时区列表；缺省 [UTC, Asia/Shanghai, Asia/Tokyo, Europe/London, America/New_York, America/Los_Angeles]' },
      },
      required: ['text'],
    },
  },
  {
    name: 'datetime_lens_wall_resolve',
    description:
      '墙钟消解：「某日某时某分」在指定时区到底是哪个瞬间？对夏令时切换边界给出确定性判定——unique（唯一）/ambiguous（时钟回拨出现两次，给两次瞬间与切换点）/gap（时钟前拨不存在，给切换瞬间与跳变量）。排查「为什么定时任务在 3 月第二个周日 02:30 触发了两次/没触发」的工具。',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '日期，格式 YYYY-MM-DD' },
        time: { type: 'string', description: '时间，格式 HH:MM 或 HH:MM:SS（缺省 00:00:00）' },
        zone: { type: 'string', description: 'IANA 时区名，如 America/New_York' },
      },
      required: ['date', 'zone'],
    },
  },
  {
    name: 'datetime_lens_arith',
    description:
      '日期时间算术（日历口径 vs 精确口径双结果）：日历口径在目标时区墙钟上加年月日时分秒再消解（跨 DST 时墙钟保形、真实时长变化，月末无此日自动钳制并说明），精确口径加真实秒数。两口径不一致时显式提示——这是日程漂移的经典来源。JS 的 setMonth 回卷 vs 本引擎钳制的差异也会标注。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '起点日期时间原文（同 datetime_lens_parse 支持的格式）' },
        years: { type: 'integer', description: '加的年数（可负，历法单位）' },
        months: { type: 'integer', description: '加的月数（可负，历法单位）' },
        days: { type: 'integer', description: '加的天数（可负）' },
        hours: { type: 'integer', description: '加的小时数（可负）' },
        minutes: { type: 'integer', description: '加的分钟数（可负）' },
        seconds: { type: 'integer', description: '加的秒数（可负）' },
        zone: { type: 'string', description: '算术发生的时区（日历口径按此消解），缺省宿主本地时区' },
        mode: { type: 'string', enum: ['calendar', 'exact', 'both'], description: '口径，缺省 both' },
      },
      required: ['text'],
    },
  },
  {
    name: 'datetime_lens_format',
    description:
      '把一个日期时间解析后在指定时区输出全部标准格式：ISO 8601/RFC 3339、RFC 2822、HTTP 日期（恒 GMT）、Unix 秒/毫秒、ISO 周日期、年内天序、星期。附 round-trip 自证（输出 ISO 再解析回同瞬间）。用于生成 header/body 里需要的时间串。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '日期时间原文（同 datetime_lens_parse 支持的格式）' },
        zone: { type: 'string', description: '输出时区，缺省 UTC' },
      },
      required: ['text'],
    },
  },
];

// ---------- 工具实现 ----------

function pitsText(pits) {
  if (!pits || pits.length === 0) return '';
  const ICON = { warn: '⚠️', error: '⛔', info: 'ℹ️' };
  return '\n## 坑检测\n' + pits.map((p) => `- ${ICON[p.level] || '⚠️'} ${p.message}`).join('\n');
}

function notesText(notes) {
  if (!notes || notes.length === 0) return '';
  return '\n## 注记\n' + notes.map((n) => '- ' + n).join('\n');
}

function toolParse(args) {
  const text = String(args.text == null ? '' : args.text);
  const zone = args.zone == null ? undefined : String(args.zone);
  const r = core.analyze(text, zone != null ? { zone } : undefined);
  if (!r.ok) return { ok: false, error: r.error, text: `❌ 无法解析「${text}」：${r.error}` };
  if (zone != null && !core.isValidZone(zone)) {
    return { ok: false, error: `未知时区「${zone}」`, text: `❌ 未知时区「${zone}」（需 IANA 名，如 Asia/Shanghai / America/New_York）` };
  }
  const lines = [];
  lines.push(`# 解析：\`${text}\``);
  lines.push(`- 形态：${r.kindText}（kind=${r.kind}）`);
  if (r.unit) lines.push(`- 单位判定：${r.unit}`);
  if (r.instant) {
    lines.push(`- 权威瞬间：${r.instant.isoUtc}（epoch ${r.instant.ms} ms）`);
    const p = core.projectZone(r.instant.ms, r.zone);
    lines.push(`- 在 ${r.zone}：${core.pad4(p.wall.y)}-${core.pad2(p.wall.mo)}-${core.pad2(p.wall.d)} ${core.pad2(p.wall.h)}:${core.pad2(p.wall.mi)}:${core.pad2(p.wall.s)}（偏移 ${core.fmtOffsetMin(p.offsetMin)}${p.isDST ? '，夏令时' : ''}，${p.weekdayZh}）`);
  }
  if (r.isoWeek) lines.push(`- ISO 周日期：${r.isoWeek}`);
  if (r.js) {
    lines.push(r.js.parseMs === null
      ? '- JS Date.parse：NaN（拒收）'
      : `- JS Date.parse：${new Date(r.js.parseMs).toISOString()}（与本引擎${r.js.agrees ? '一致' : '不一致'}）`);
  }
  let out = lines.join('\n') + pitsText(r.pits) + notesText(r.notes);
  if (r.floating && r.floating.resolve && r.floating.resolve.status !== 'unique') {
    const rv = r.floating.resolve;
    out += `\n\n## 消解详情（${rv.status === 'gap' ? 'DST 空洞' : 'DST 歧义'}）\n- 切换瞬间：${new Date(rv.transition).toISOString()}`;
    if (rv.status === 'ambiguous') {
      out += `\n- 两次出现：${new Date(rv.instantMs).toISOString()}（${core.fmtOffsetMin(rv.offsetMin)}）与 ${new Date(rv.secondInstantMs).toISOString()}（${core.fmtOffsetMin(rv.secondOffsetMin)}），本引擎取早的一次`;
    }
  }
  return { ok: true, structured: r, text: out };
}

function toolConvert(args) {
  const text = String(args.text == null ? '' : args.text);
  const zones = Array.isArray(args.zones) && args.zones.length > 0 ? args.zones.map(String) : DEFAULT_ZONES.slice();
  const bad = zones.filter((z) => !core.isValidZone(z));
  if (bad.length > 0) {
    return { ok: false, error: `未知时区：${bad.join(', ')}`, text: `❌ 未知时区：${bad.join(', ')}（需 IANA 名）` };
  }
  const r = core.analyze(text, { zone: zones[0] });
  if (!r.ok) return { ok: false, error: r.error, text: `❌ 无法解析「${text}」：${r.error}` };
  if (r.floating) {
    // 无偏移输入按 zones[0] 消解——如实声明口径
    r.notes.push(`无偏移输入按 zones 首个时区「${zones[0]}」消解（如需别的解读时区请显式带偏移或调整 zones 顺序）`);
  }
  const lines = [];
  lines.push(`# 时区投影：\`${text}\``);
  lines.push(`- 权威瞬间：${r.instant.isoUtc}（epoch ${r.instant.ms} ms，kind=${r.kind}）`);
  lines.push('');
  lines.push('| 时区 | 墙钟 | UTC 偏移 | 夏令时 | 星期 |');
  lines.push('|---|---|---|---|---|');
  for (const z of zones) {
    const p = core.projectZone(r.instant.ms, z);
    lines.push(`| ${z} | ${core.pad4(p.wall.y)}-${core.pad2(p.wall.mo)}-${core.pad2(p.wall.d)} ${core.pad2(p.wall.h)}:${core.pad2(p.wall.mi)}:${core.pad2(p.wall.s)} | ${core.fmtOffsetMin(p.offsetMin)} | ${p.isDST ? '☀️ 是' : '否'} | ${p.weekdayZh} |`);
  }
  return { ok: true, structured: { instant: r.instant, rows: zones.map((z) => core.projectZone(r.instant.ms, z)) }, text: lines.join('\n') + pitsText(r.pits) + notesText(r.notes) };
}

function toolWallResolve(args) {
  const dateStr = String(args.date == null ? '' : args.date).trim();
  const zone = String(args.zone == null ? '' : args.zone).trim();
  const timeStr = args.time == null || String(args.time).trim() === '' ? '00:00:00' : String(args.time).trim();
  if (!core.isValidZone(zone)) {
    return { ok: false, error: `未知时区「${zone}」`, text: `❌ 未知时区「${zone}」（需 IANA 名）` };
  }
  const mD = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!mD) return { ok: false, error: 'date 需为 YYYY-MM-DD', text: `❌ date 需为 YYYY-MM-DD，得到「${dateStr}」` };
  const mT = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr);
  if (!mT) return { ok: false, error: 'time 需为 HH:MM 或 HH:MM:SS', text: `❌ time 需为 HH:MM 或 HH:MM:SS，得到「${timeStr}」` };
  const y = parseInt(mD[1], 10), mo = parseInt(mD[2], 10), d = parseInt(mD[3], 10);
  const dim = core.daysInMonth(y, mo);
  if (mo < 1 || mo > 12 || d < 1 || d > dim) {
    return { ok: false, error: '日期分量越界', text: `❌ 日期越界：${dateStr}（${y} 年 ${mo} 月只有 ${core.daysInMonth(y, mo < 1 || mo > 12 ? 1 : mo)} 天）` };
  }
  const h = parseInt(mT[1], 10), mi = parseInt(mT[2], 10), s = mT[3] ? parseInt(mT[3], 10) : 0;
  if (h > 23 || mi > 59 || s > 59) return { ok: false, error: '时间分量越界', text: `❌ 时间分量越界（时 0-23、分/秒 0-59）：${timeStr}` };
  const rv = core.resolveWall({ y, mo, d, h, mi, s }, zone);
  const lines = [];
  lines.push(`# 墙钟消解：${dateStr} ${timeStr} @ ${zone}`);
  if (rv.status === 'unique') {
    lines.push(`- 判定：✅ 唯一存在`);
    lines.push(`- 真实瞬间：${new Date(rv.instantMs).toISOString()}（epoch ${rv.instantMs} ms）`);
    lines.push(`- 该时区墙钟偏移：${core.fmtOffsetMin(rv.offsetMin)}`);
    if (rv.note) lines.push(`- 注：${rv.note}`);
  } else if (rv.status === 'ambiguous') {
    lines.push(`- 判定：⚠️ 歧义（时钟回拨，该墙钟时间出现两次）`);
    lines.push(`- 第一次：${new Date(rv.instantMs).toISOString()}（偏移 ${core.fmtOffsetMin(rv.offsetMin)}，夏令时侧）`);
    lines.push(`- 第二次：${new Date(rv.secondInstantMs).toISOString()}（偏移 ${core.fmtOffsetMin(rv.secondOffsetMin)}，标准时侧）`);
    lines.push(`- 切换瞬间：${new Date(rv.transition).toISOString()}`);
    lines.push(`- 后果：定时任务在此窗口可能触发两次或漏触发；本引擎与多数库取第一次（早的一次）`);
  } else {
    lines.push(`- 判定：⛔ 不存在（时钟前拨空洞，跳过 ${rv.skippedMinutes} 分钟）`);
    lines.push(`- 切换瞬间：${new Date(rv.transition).toISOString()}`);
    lines.push(`- 墙钟跳变：${core.pad2(rv.wallJustBefore.h)}:${core.pad2(rv.wallJustBefore.mi)}:${core.pad2(rv.wallJustBefore.s)} → ${core.pad2(rv.wallJustAfter.h)}:${core.pad2(rv.wallJustAfter.mi)}:${core.pad2(rv.wallJustAfter.s)}`);
    lines.push(`- 后果：以此时间写的定时任务/日程在该日不会按字面触发；最近的真实时刻是切换瞬间 ${new Date(rv.transition).toISOString()}`);
  }
  return { ok: true, structured: rv, text: lines.join('\n') };
}

function toolArith(args) {
  const text = String(args.text == null ? '' : args.text);
  const zone = args.zone == null ? undefined : String(args.zone);
  const mode = args.mode == null ? 'both' : String(args.mode);
  if (['calendar', 'exact', 'both'].indexOf(mode) === -1) {
    return { ok: false, error: 'mode 需为 calendar/exact/both', text: `❌ mode 需为 calendar/exact/both，得到「${mode}」` };
  }
  const amount = {
    years: args.years == null ? 0 : Number(args.years),
    months: args.months == null ? 0 : Number(args.months),
    days: args.days == null ? 0 : Number(args.days),
    hours: args.hours == null ? 0 : Number(args.hours),
    minutes: args.minutes == null ? 0 : Number(args.minutes),
    seconds: args.seconds == null ? 0 : Number(args.seconds),
  };
  for (const k of Object.keys(amount)) {
    if (!Number.isFinite(amount[k])) return { ok: false, error: `${k} 不是有限数字`, text: `❌ ${k} 不是有限数字` };
  }
  const total = Object.keys(amount).reduce((acc, k) => acc + Math.abs(amount[k]), 0);
  if (total === 0) return { ok: false, error: '算术量为全零', text: '❌ 至少给一个非零的 years/months/days/hours/minutes/seconds' };
  const r = core.analyze(text, zone != null ? { zone } : undefined);
  if (!r.ok) return { ok: false, error: r.error, text: `❌ 无法解析起点「${text}」：${r.error}` };
  const a = core.addDuration(r.instant.ms, amount, r.zone, mode);
  if (!a.ok) return { ok: false, error: a.error, text: `❌ ${a.error}` };
  const lines = [];
  lines.push(`# 算术：\`${text}\` + ${a.calendar ? a.calendar.wallDeltaText.trim().replace(/\s+/g, ' ') : describeAmount(amount)}（zone=${a.zone}，mode=${a.mode}）`);
  lines.push(`- 起点瞬间：${r.instant.isoUtc}`);
  if (a.calendar) {
    lines.push(`- 日历口径：${new Date(a.calendar.instantMs).toISOString()}`);
    lines.push(`  - 结果墙钟：${core.pad4(a.calendar.wallAfter.y)}-${core.pad2(a.calendar.wallAfter.mo)}-${core.pad2(a.calendar.wallAfter.d)} ${core.pad2(a.calendar.wallAfter.h)}:${core.pad2(a.calendar.wallAfter.mi)}:${core.pad2(a.calendar.wallAfter.s)}（${a.calendar.resolvedStatus === 'gap' ? '空洞已落到切换瞬间' : a.calendar.resolvedStatus === 'ambiguous' ? '歧义取早的一次' : '唯一'}）`);
    lines.push(`  - ${a.calendar.note || '无 DST 干扰'}`);
  }
  if (a.exact) {
    lines.push(`- 精确口径：${new Date(a.exact.instantMs).toISOString()}（真实时长 ${a.exact.realDeltaMs / 1000} 秒）`);
  }
  if (a.differ === true) {
    const diffMin = (a.calendar.instantMs - a.exact.instantMs) / 60000;
    lines.push(`- ⚠️ 两口径相差 ${diffMin > 0 ? '+' : ''}${diffMin} 分钟（DST 边界）——按需选择：日程保墙钟用日历口径，计时保时长用精确口径`);
  }
  if (a.differ === false) lines.push('- 两口径一致（期间无 DST/偏移切换）');
  return { ok: true, structured: a, text: lines.join('\n') + pitsText(a.pits) };
}

function describeAmount(amount) {
  const parts = [];
  for (const [k, v] of Object.entries(amount)) if (v !== 0) parts.push(`${v} ${k}`);
  return parts.join(' ') || '0';
}

function toolFormat(args) {
  const text = String(args.text == null ? '' : args.text);
  const zone = args.zone == null ? 'UTC' : String(args.zone);
  if (!core.isValidZone(zone)) {
    return { ok: false, error: `未知时区「${zone}」`, text: `❌ 未知时区「${zone}」（需 IANA 名）` };
  }
  const r = core.analyze(text, { zone });
  if (!r.ok) return { ok: false, error: r.error, text: `❌ 无法解析「${text}」：${r.error}` };
  const f = core.formatAll(r.instant.ms, zone);
  // round-trip 自证：ISO 输出再解析回同瞬间（url-lens 纪律：往返断言是最硬验证）
  const rt = core.analyze(f.iso, { zone });
  const rtOk = rt.ok && rt.instant.ms === r.instant.ms;
  const lines = [];
  lines.push(`# 格式输出：\`${text}\` @ ${zone}`);
  lines.push(`- ISO 8601 / RFC 3339：\`${f.iso}\``);
  lines.push(`- RFC 2822：\`${f.rfc2822}\``);
  lines.push(`- HTTP 日期（IMF-fixdate，恒 GMT）：\`${f.http}\``);
  lines.push(`- Unix 秒：\`${f.unixSeconds}\`　Unix 毫秒：\`${f.unixMillis}\``);
  lines.push(`- ISO 周日期：\`${f.isoWeek}\`　年内天序：D${f.dayOfYear}　星期：${f.weekdayEn}（${f.weekdayZh}）`);
  lines.push(`- round-trip 自证：${rtOk ? '✅ ISO 输出再解析回同一瞬间' : `❌ 往返不一致（${rt.ok ? rt.instant.ms : rt.error} vs ${r.instant.ms}）——引擎缺陷，请上报`}`);
  return { ok: true, structured: f, text: lines.join('\n') + pitsText(r.pits) };
}

const HANDLERS = {
  datetime_lens_parse: toolParse,
  datetime_lens_convert: toolConvert,
  datetime_lens_wall_resolve: toolWallResolve,
  datetime_lens_arith: toolArith,
  datetime_lens_format: toolFormat,
};

// ---------- JSON-RPC 骨架 ----------
function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function replyError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (e) {
      process.stderr.write(`[datetime-lens] 非 JSON 行忽略: ${e.message}\n`);
      continue;
    }
    if (msg.id === undefined) continue; // 通知（notifications/initialized 等）不回包
    if (msg.method === 'initialize') {
      reply(msg.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    } else if (msg.method === 'tools/list') {
      reply(msg.id, { tools: TOOLS });
    } else if (msg.method === 'tools/call') {
      const name = msg.params && msg.params.name;
      const args = (msg.params && msg.params.arguments) || {};
      const fn = HANDLERS[name];
      if (!fn) {
        reply(msg.id, { content: [{ type: 'text', text: `未知工具：${name}` }], isError: true });
        continue;
      }
      try {
        const r = fn(args);
        reply(msg.id, { content: [{ type: 'text', text: r.text }], isError: !r.ok });
      } catch (e) {
        reply(msg.id, { content: [{ type: 'text', text: `工具执行异常：${e && e.message}` }], isError: true });
      }
    } else {
      replyError(msg.id, -32601, `方法不存在：${msg.method}`);
    }
  }
});
process.stdin.on('end', () => process.exit(0));
