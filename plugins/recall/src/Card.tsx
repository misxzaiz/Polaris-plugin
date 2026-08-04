import { useState, useEffect } from 'react'

/**
 * Recall Card — interaction 模式
 *
 * AI 调用 quiz_me 工具后，Polaris 用此卡片呈现待答问题。
 * 用户在卡片内作答 → respond() 回填 → AI 收到答案后可评分/讲解。
 */

interface QuizData {
  quiz?: {
    id: string
    deck: string
    front: string
    back: string
    reps: number
  }
  prompt?: string
}

export default function RecallCard({ data, status, respond, onSendToChat }: {
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
  const d = (data as QuizData) || {}
  const quiz = d.quiz
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(status === 'answered' || status === 'declined')
  const [showBack, setShowBack] = useState(false)

  // 已有历史应答时回显
  useEffect(() => {
    if (status === 'answered' && response) {
      setAnswer(typeof response === 'string' ? response : JSON.stringify(response))
      setSubmitted(true)
    }
  }, [status, response])

  if (!quiz) {
    return <div style={{ padding: 12, color: '#8E8E93', fontSize: 12 }}>无可测验卡片，暂无到期内容</div>
  }

  const submit = () => {
    setSubmitted(true)
    setShowBack(true)
    respond?.({ answer, cardId: quiz.id, correct: quiz.back })
  }

  const decline = () => {
    setSubmitted(true)
    respond?.({ declined: true, cardId: quiz.id })
  }

  return (
    <div style={{ borderRadius: 8, border: '1px solid #3F3F46', background: '#1F1F24', overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #3F3F46', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#8E8E93' }}>测验 · {quiz.deck}</span>
        <span style={{ fontSize: 10, color: '#6B7280' }}>复习第 {quiz.reps + 1} 次</span>
      </div>

      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 12, color: '#8E8E93', marginBottom: 6 }}>问题</div>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>{quiz.front}</div>

        {!submitted ? (
          <>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="在此作答…"
              style={{ width: '100%', minHeight: 60, padding: 8, borderRadius: 6, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 12, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={submit} disabled={!answer.trim()} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', background: answer.trim() ? '#3B82F6' : '#3F3F46', color: '#fff', fontSize: 12, cursor: answer.trim() ? 'pointer' : 'not-allowed' }}>提交答案</button>
              <button onClick={decline} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #3F3F46', background: 'transparent', color: '#8E8E93', fontSize: 12, cursor: 'pointer' }}>跳过</button>
            </div>
          </>
        ) : showBack ? (
          <>
            <div style={{ fontSize: 12, color: '#8E8E93', marginBottom: 4 }}>你的答案</div>
            <div style={{ padding: 8, borderRadius: 6, background: '#25252B', fontSize: 12, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{answer || '(空)'}</div>
            <div style={{ fontSize: 12, color: '#10B981', marginBottom: 4 }}>正解</div>
            <div style={{ padding: 8, borderRadius: 6, background: '#1F2A1F', border: '1px solid #10B98144', fontSize: 12, color: '#10B981', whiteSpace: 'pre-wrap' }}>{quiz.back}</div>
            {onSendToChat && (
              <button onClick={() => onSendToChat(`我刚复习了这张卡片，请帮我讲解：「${quiz.front}」我的答案是：${answer || '(空)'}，正解是：${quiz.back}`)} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, border: '1px solid #3F3F46', background: '#2D2D33', color: '#B4B4B8', fontSize: 11, cursor: 'pointer' }}>让 AI 讲解</button>
            )}
          </>
        ) : (
          <div style={{ color: '#8E8E93', fontSize: 12 }}>已跳过</div>
        )}
      </div>
    </div>
  )
}
