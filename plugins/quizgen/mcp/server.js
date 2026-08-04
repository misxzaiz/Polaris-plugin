#!/usr/bin/env node
/**
 * Quiz Gen MCP Server
 * 工具：generate_quiz / grade_answer
 * 纯 MCP + ChatCard interaction（无 Panel/Service）。
 */
'use strict'
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

function splitSentences(text) {
  return String(text || '').split(/\r?\n|。|\.|；|;|！|!|\?|？/).map(s => s.trim()).filter(s => s.length > 8)
}

// 提取关键名词：长度 2-8 的中文词 / 3+ 字母英文词
function extractKeys(text) {
  const cn = text.match(/[一-龥]{2,8}/g) || []
  const en = text.match(/\b[A-Za-z]{3,}\b/g) || []
  return [...new Set([...cn, ...en])].filter(k => k.length >= 2).slice(0, 50)
}

function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

function generateQuiz(text, type, count) {
  const sentences = splitSentences(text)
  const keys = extractKeys(text)
  if (sentences.length === 0 || keys.length === 0) return { questions: [] }
  const n = Math.min(count || 5, sentences.length)
  const questions = []
  for (let i = 0; i < n; i++) {
    const sent = sentences[i % sentences.length]
    // 找句中含的关键词
    const inSent = keys.filter(k => sent.includes(k))
    if (inSent.length === 0) continue
    const answer = inSent[0]
    if (type === 'fill') {
      questions.push({
        id: 'q' + (i + 1),
        type: 'fill',
        prompt: `填空：${sent.replace(answer, '______')}`,
        answer,
        explanation: `答案来自原文：${sent}`,
      })
    } else {
      // 选择题：3 个干扰项
      const distractors = shuffle(keys.filter(k => k !== answer)).slice(0, 3)
      if (distractors.length < 3) continue
      const options = shuffle([answer, ...distractors])
      questions.push({
        id: 'q' + (i + 1),
        type: 'mc',
        prompt: `下列哪个出现在这句话中："${sent}"`,
        options,
        answerIndex: options.indexOf(answer),
        answer,
        explanation: `正确答案：${answer}`,
      })
    }
  }
  return { questions }
}

function gradeAnswer(questions, answers) {
  let correct = 0
  const details = []
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const a = answers?.[q.id]
    let ok = false
    if (q.type === 'mc') ok = Number(a) === q.answerIndex
    else ok = String(a).trim() === q.answer
    if (ok) correct++
    details.push({ id: q.id, your: a, correct: q.answer, ok })
  }
  return { correct, total: questions.length, score: Math.round(correct / questions.length * 100), details }
}

const tools = [
  { name: 'generate_quiz', description: '从文本生成测验题（选择题/填空题）。返回题目数组。type: mc|fill，count 默认 5。', inputSchema: { type: 'object', properties: { text: { type: 'string', description: '学习材料原文' }, type: { type: 'string', description: 'mc|fill', default: 'mc' }, count: { type: 'number', description: '题目数', default: 5 } }, required: ['text'] } },
  { name: 'grade_answer', description: '评分测验答案。questions 为 generate_quiz 返回的题目，answers 为 {题目id: 答案}。', inputSchema: { type: 'object', properties: { questions: { type: 'array', description: '题目数组' }, answers: { type: 'object', description: '{id: 答案（选择题为选项索引，填空题为文本）}' } }, required: ['questions', 'answers'] } }
]

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buf += chunk
  while (true) {
    const i = buf.indexOf('\n')
    if (i === -1) break
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let msg
    try { msg = JSON.parse(line) } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue }
    handle(msg).catch(err => send({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: String(err && err.message || err) } }))
  }
})

async function handle(msg) {
  const { method, id, params } = msg
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'quiz-gen', version: '1.0.0' } } })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } })
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    if (name === 'generate_quiz') {
      const r = generateQuiz(args.text, args.type, args.count)
      if (r.questions.length === 0) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '未能从文本生成题目（需更长或含关键名词的文本）' }] } })
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `生成 ${r.questions.length} 道题（${args.type || 'mc'}），请在卡片中作答。` }], _meta: { questions: r.questions, quizType: args.type || 'mc' } } })
    }
    if (name === 'grade_answer') {
      const r = gradeAnswer(args.questions, args.answers)
      const text = `得分 ${r.correct}/${r.total}（${r.score}分）\n\n` + r.details.map(d => `${d.ok ? '✓' : '✗'} ${d.id}: 你答「${d.your ?? '空'}」${d.ok ? '' : `，正解「${d.correct}」`}`).join('\n')
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: r } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}
process.on('uncaughtException', (e) => { try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {} })
