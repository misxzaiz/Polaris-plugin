import { useState, useEffect } from 'react'

/**
 * Quiz Gen ChatCard — interaction 模式
 * AI 生成题目后，用户逐题作答，提交后回填。
 */

interface Question {
  id: string
  type: 'mc' | 'fill'
  prompt: string
  options?: string[]
  answerIndex?: number
  answer?: string
  explanation?: string
}

export default function QuizGenCard({ data, status, respond }: {
  pluginId: string
  cardId: string
  toolName: string
  mode: 'result' | 'interaction'
  status: string
  data: unknown
  response?: unknown
  onSendToChat?: (msg: string) => void | Promise<void>
  respond?: (result: unknown) => Promise<void>
}) {
  const d = (data || {}) as { questions?: Question[]; quizType?: string }
  const questions = d.questions || []
  const [answers, setAnswers] = useState<Record<string, number | string>>({})
  const [submitted, setSubmitted] = useState(status === 'answered' || status === 'declined')
  const [current, setCurrent] = useState(0)
  const [result, setResult] = useState<{ correct: number; total: number; score: number; details: Array<{ id: string; your: number | string; correct: string; ok: boolean }> } | null>(null)

  useEffect(() => { if (status === 'answered' && response) setResult(response as typeof result) }, [status, response])

  if (questions.length === 0) return <div style={{ padding: 12, color: '#8E8E93', fontSize: 12 }}>无题目</div>

  const q = questions[current]
  const isLast = current === questions.length - 1

  const submit = () => {
    setSubmitted(true)
    respond?.({ answers, questions })
  }
  const decline = () => { setSubmitted(true); respond?.({ declined: true }) }

  return (
    <div style={{ borderRadius: 8, border: '1px solid #3F3F46', background: '#1F1F24', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #3F3F46' }}>
        <span style={{ fontSize: 11, color: '#8E8E93' }}>测验 · {current + 1}/{questions.length}{d.quizType ? ` · ${d.quizType === 'mc' ? '选择题' : '填空题'}` : ''}</span>
      </div>

      {!submitted ? (
        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, lineHeight: 1.6 }}>{q.prompt}</div>
          {q.type === 'mc' && q.options ? (
            q.options.map((opt, i) => (
              <div key={i} onClick={() => setAnswers(p => ({ ...p, [q.id]: i }))} style={{ padding: 10, marginBottom: 6, borderRadius: 6, cursor: 'pointer', background: answers[q.id] === i ? '#3B82F622' : '#25252B', border: `1px solid ${answers[q.id] === i ? '#3B82F6' : '#3F3F46'}` }}>
                <span style={{ fontSize: 12 }}>{String.fromCharCode(65 + i)}. {opt}</span>
              </div>
            ))
          ) : (
            <input
              value={(answers[q.id] as string) || ''}
              onChange={(e) => setAnswers(p => ({ ...p, [q.id]: e.target.value }))}
              placeholder="输入答案…"
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
            />
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {current > 0 && <button onClick={() => setCurrent(c => c - 1)} style={{ ...btnStyle, padding: '8px 12px' }}>上一题</button>}
            {!isLast ? (
              <button onClick={() => setCurrent(c => c + 1)} style={{ ...btnStyle, padding: '8px 12px', background: '#3B82F6', borderColor: '#3B82F6', color: '#fff' }}>下一题</button>
            ) : (
              <button onClick={submit} style={{ ...btnStyle, padding: '8px 12px', background: '#10B981', borderColor: '#10B981', color: '#fff' }}>提交</button>
            )}
            <button onClick={decline} style={{ ...btnStyle, padding: '8px 12px', marginLeft: 'auto' }}>跳过</button>
          </div>
          <div style={{ fontSize: 10, color: '#6B7280', marginTop: 6 }}>已答 {Object.keys(answers).length}/{questions.length}</div>
        </div>
      ) : result ? (
        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: result.score >= 60 ? '#10B981' : '#EF4444' }}>{result.correct}/{result.total} · {result.score}分</div>
          <div style={{ marginTop: 10, fontSize: 12 }}>
            {result.details.map((dd, i) => (
              <div key={i} style={{ marginBottom: 4, color: dd.ok ? '#10B981' : '#EF4444' }}>
                {dd.ok ? '✓' : '✗'} {dd.id}: {dd.your ?? '空'}{dd.ok ? '' : ` → ${dd.correct}`}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ padding: 14, color: '#8E8E93', fontSize: 12 }}>已提交，等待评分…</div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 6, border: '1px solid #3F3F46', background: '#2D2D33', color: '#F8F8F8', fontSize: 12, cursor: 'pointer' }
