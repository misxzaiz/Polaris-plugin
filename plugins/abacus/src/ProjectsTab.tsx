/**
 * 项目 Tab：项目账本表（项目目录 × 数据源归组：token/成本/会话数/最近活跃）
 */
import { fmtTokens, fmtUsd, fmtCny, type PanelData } from './model'

interface Ctx { data: PanelData; refresh: () => Promise<void>; showToast: (t: string, k?: 'good' | 'bad' | '') => void }

const SRC_COLOR: Record<string, string> = { zcode: '#4C8DFF', claude: '#D29922', polaris: '#3FB950' }

export default function ProjectsTab({ ctx }: { ctx: Ctx }) {
  const { data } = ctx
  const fx = data.settings.fxRate
  if (!data.projects.length) return <div className="ab-empty">暂无项目数据——服务首扫后出现。</div>

  const maxTokens = Math.max(1, ...data.projects.map((p) => p.tokens))

  return (
    <div>
      <div className="ab-sec"><i className="ab-bar" />项目账本<small className="ab-hint">{data.projects.length} 个项目 × 源 · 按 token 降序</small></div>
      <div className="ab-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="ab-table">
            <thead>
              <tr>
                <th>项目</th>
                <th>源</th>
                <th className="ab-num">会话</th>
                <th className="ab-num">请求</th>
                <th className="ab-num">token</th>
                <th className="ab-num">累计成本</th>
                <th className="ab-num">近30天</th>
                <th className="ab-num">最近活跃</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p) => (
                <tr key={`${p.proj}|${p.src}`}>
                  <td>
                    <div style={{ width: 90, height: 4, background: '#222936', borderRadius: 2, marginBottom: 3 }}>
                      <div style={{ width: `${(p.tokens / maxTokens) * 100}%`, height: '100%', borderRadius: 2, background: SRC_COLOR[p.src] || '#8B95A7' }} />
                    </div>
                    {p.proj}
                  </td>
                  <td><span className="ab-tag" style={{ color: SRC_COLOR[p.src] }}>{p.src}</span></td>
                  <td className="ab-num">{p.sessions}</td>
                  <td className="ab-num">{p.req}</td>
                  <td className="ab-num">{fmtTokens(p.tokens)}</td>
                  <td className="ab-num">{fmtUsd(p.costUsd)}<br /><small style={{ color: '#5C6678' }}>{fmtCny(p.costUsd, fx)}</small></td>
                  <td className="ab-num">{p.d30Cost ? fmtUsd(p.d30Cost) : '—'}</td>
                  <td className="ab-num">{p.lastDay || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="ab-sec"><i className="ab-bar" />说明</div>
      <div className="ab-card"><div className="ab-card-b ab-caliber">
        项目按会话目录归组：zcode 取会话工作目录、claude 取 cwd、polaris 取工作区路径的目录名。
        同名目录跨源分行显示，避免「Polaris（ZCode 编程）」与「Polaris（Claude Code）」混成一锅。
      </div></div>
    </div>
  )
}
