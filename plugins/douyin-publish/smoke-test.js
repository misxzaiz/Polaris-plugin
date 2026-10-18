const { spawn } = require('child_process')
const path = require('path')

const pluginDir = path.resolve(__dirname)
const child = spawn('node', [path.join(pluginDir, 'mcp', 'server.js'), '', pluginDir], {
  stdio: ['pipe', 'pipe', 'pipe'],
})

let outBuf = ''
let id = 0
const pending = new Map()

function call(method, params) {
  const mid = ++id
  return new Promise((resolve) => {
    pending.set(mid, resolve)
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: mid, method, params }) + '\n')
  })
}

child.stdout.on('data', (d) => {
  outBuf += d.toString()
  let i
  while ((i = outBuf.indexOf('\n')) !== -1) {
    const line = outBuf.slice(0, i).trim()
    outBuf = outBuf.slice(i + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line)
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
      }
    } catch (_) {}
  }
})

;(async () => {
  const init = await call('initialize', {})
  console.log('INIT_OK', init.result.serverInfo.name, init.result.protocolVersion)

  const list = await call('tools/list', {})
  const tools = list.result.tools.map((t) => t.name)
  console.log('TOOLS', tools.join(', '))

  // ① prepare（幂等验证两次）
  const file = 'D:/space/base/Polaris/temp/claude-animation-base/out/duyu.mp4'
  const p1 = await call('tools/call', { name: 'douyin_prepare_publish', arguments: { file, title: '水墨动画测试', topics: ['水墨', '原创'] } })
  const r1 = JSON.parse(p1.result.content[0].text)
  console.log('PREPARE#1 ok=' + r1.ok + ' status=' + r1.status + ' sha=' + (r1.sha256 || '').slice(0, 12))

  const p2 = await call('tools/call', { name: 'douyin_prepare_publish', arguments: { file, title: '水墨动画测试' } })
  const r2 = JSON.parse(p2.result.content[0].text)
  console.log('PREPARE#2 (same) ok=' + r2.ok + ' skipped=' + r2.skipped + ' status=' + r2.status)

  // ② collect audio（声音信息收集实测）
  const c1 = await call('tools/call', { name: 'douyin_collect_audio', arguments: { file, audioSource: 'tts', voiceId: '冰糖' } })
  const rc = JSON.parse(c1.result.content[0].text)
  console.log('COLLECT_AUDIO ok=' + rc.ok + ' hasAudio=' + (rc.audio ? rc.audio.hasAudioTrack : '?') + ' codec=' + (rc.audio ? rc.audio.audioCodec : '?') + ' loudness=' + (rc.audio ? rc.audio.loudnessLufs : '?'))
  if (rc.audio) console.log('AUDIO_DETAIL', JSON.stringify(rc.audio))

  // ③ status 查询
  const s1 = await call('tools/call', { name: 'douyin_publish_status', arguments: { file } })
  const rs = JSON.parse(s1.result.content[0].text)
  console.log('STATUS found=' + rs.found + ' status=' + (rs.record ? rs.record.status : '?'))

  // ④ record_result（published 必须带 itemId）
  const bad = await call('tools/call', { name: 'douyin_record_result', arguments: { file, status: 'published' } })
  const rb = JSON.parse(bad.result.content[0].text)
  console.log('RECORD_BAD ok=' + rb.ok + ' (expect false) err=' + (rb.error || '').slice(0, 40))

  const good = await call('tools/call', { name: 'douyin_record_result', arguments: { file, status: 'published', itemId: 'TEST_ITEM_001', url: 'https://www.douyin.com/video/TEST_ITEM_001' } })
  const rg = JSON.parse(good.result.content[0].text)
  console.log('RECORD_GOOD ok=' + rg.ok + ' status=' + rg.record.status + ' itemId=' + rg.record.itemId)

  // ⑤ 再 prepare → skipped
  const p3 = await call('tools/call', { name: 'douyin_prepare_publish', arguments: { file } })
  const r3 = JSON.parse(p3.result.content[0].text)
  console.log('PREPARE#3 skipped=' + r3.skipped + ' (expect true)')

  // ⑥ list
  const l1 = await call('tools/call', { name: 'douyin_list_published', arguments: {} })
  const rl = JSON.parse(l1.result.content[0].text)
  console.log('LIST count=' + rl.count + ' total=' + rl.total + ' first=' + (rl.records[0] ? rl.records[0].title + '/' + rl.records[0].status + '/audio=' + rl.records[0].hasAudio : 'none'))

  // 清理：测试后把记录重置为 pending 以便真实发布流程使用
  await call('tools/call', { name: 'douyin_record_result', arguments: { file, status: 'pending', itemId: null, url: null } })
  console.log('RESET_TO_PENDING done')

  child.kill()
  process.exit(0)
})().catch((e) => {
  console.error('FAIL', e)
  child.kill()
  process.exit(1)
})
