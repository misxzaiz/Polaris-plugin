'use strict';
/**
 * smtpclient.js —— 最小 SMTP 客户端(node 专用,service 自检与集成测试共用)
 *
 * 为什么不放在 shared/core.js:core 同时被面板(esbuild 浏览器 bundle)引用,
 * require('net') 会破坏构建;node 专用代码一律留在 service/ 层。
 */

/**
 * 向 127.0.0.1:port 发一封真邮件(最小 SMTP 会话:EHLO→MAIL→RCPT→DATA→QUIT)。
 * 返回 {ok, error?, steps:[...]};超时 5s。
 */
function sendTestMail(port, { from = 'selftest@polaris.local', to = 'catch@polaris.local', subject = '邮件调试台自检', body = '您的验证码是 481203,5 分钟内有效。' } = {}) {
  return new Promise((resolve) => {
    const net = require('net');
    const steps = [];
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let buf = '';
    let phase = 'greet';
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch (_) { /* 已断开 */ }
      resolve(Object.assign({ steps }, r));
    };
    const timer = setTimeout(() => finish({ ok: false, error: 'SMTP 会话超时(5s)' }), 5000);
    socket.on('error', (e) => { clearTimeout(timer); finish({ ok: false, error: e.message }); });
    // SMTP 应答按行消费:"250-xxx" 为续行,"250 xxx" / "250" 为终结行(EHLO 是多行应答)
    socket.on('data', (d) => {
      buf += d.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\r\n')) >= 0 && !done) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!/^\d{3}/.test(line)) continue; // 忽略非应答行
        const isFinal = /^\d{3} /.test(line) || /^\d{3}$/.test(line);
        if (!isFinal) continue; // "250-" 续行,继续收
        const code = parseInt(line.slice(0, 3), 10);
        const send = (line2, next) => {
          steps.push(`> ${line2}`);
          socket.write(line2 + '\r\n');
          phase = next;
        };
        if (phase === 'greet') {
          if (code !== 220) { clearTimeout(timer); return finish({ ok: false, error: `greeting 非法: ${line}` }); }
          send('EHLO polaris-maildesk', 'mail');
        } else if (phase === 'mail') {
          if (code >= 400) { clearTimeout(timer); return finish({ ok: false, error: `EHLO 被拒: ${line}` }); }
          send(`MAIL FROM:<${from}>`, 'rcpt');
        } else if (phase === 'rcpt') {
          if (code >= 400) { clearTimeout(timer); return finish({ ok: false, error: `MAIL 被拒: ${line}` }); }
          send(`RCPT TO:<${to}>`, 'data');
        } else if (phase === 'data') {
          if (code >= 400) { clearTimeout(timer); return finish({ ok: false, error: `RCPT 被拒: ${line}` }); }
          send('DATA', 'content');
        } else if (phase === 'content') {
          if (code !== 354) { clearTimeout(timer); return finish({ ok: false, error: `DATA 被拒: ${line}` }); }
          const subjectB64 = Buffer.from(subject, 'utf8').toString('base64');
          const payload = [
            `From: ${from}`,
            `To: ${to}`,
            `Subject: =?UTF-8?B?${subjectB64}?=`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            Buffer.from(body, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
            '.',
          ].join('\r\n');
          steps.push('> [邮件正文]');
          socket.write(payload + '\r\n');
          phase = 'quit';
        } else if (phase === 'quit') {
          if (code !== 250) { clearTimeout(timer); return finish({ ok: false, error: `正文被拒: ${line}` }); }
          send('QUIT', 'bye');
        } else if (phase === 'bye') {
          clearTimeout(timer);
          finish({ ok: true });
        }
      }
    });
    socket.on('close', () => {
      clearTimeout(timer);
      finish({ ok: done && steps.length > 0, error: done ? undefined : '连接提前关闭' });
    });
  });
}

module.exports = { sendTestMail };
