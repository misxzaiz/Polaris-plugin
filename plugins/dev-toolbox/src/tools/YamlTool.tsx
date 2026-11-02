// YAML↔JSON 互转：js-yaml v4（构建期打包）；schema 口径明示
import { useMemo, useState } from 'react'
import { jsonToYaml, yamlToJson } from '../core'
import { Area, CopyBtn, Note, Out } from '../ui'

export function YamlTool() {
  const [dir, setDir] = useState<'y2j' | 'j2y'>('y2j')
  const [text, setText] = useState('')

  const result = useMemo(() => {
    if (text.trim() === '') return null
    return dir === 'y2j' ? yamlToJson(text) : jsonToYaml(text)
  }, [dir, text])

  return (
    <div>
      <div className="dtb-tabs">
        <button className={`dtb-tab${dir === 'y2j' ? ' dtb-tab-on' : ''}`} onClick={() => setDir('y2j')}>
          YAML → JSON
        </button>
        <button className={`dtb-tab${dir === 'j2y' ? ' dtb-tab-on' : ''}`} onClick={() => setDir('j2y')}>
          JSON → YAML
        </button>
      </div>
      <Area
        value={text}
        onChange={setText}
        rows={9}
        placeholder={dir === 'y2j' ? '粘贴 YAML' : '粘贴 JSON'}
      />
      {result === null ? null : !result.ok ? (
        <Note kind="error">{result.error}</Note>
      ) : (
        <>
          <div className="dtb-cardhead">
            <b>输出</b>
            <CopyBtn text={result.output} />
          </div>
          <Out text={result.output} rows={18} />
        </>
      )}
      <Note kind="info">
        转换库 js-yaml 4 默认 schema 为 YAML 1.2 core：yes/no/on/off 视为字符串而非布尔；空值写法 null/~ 均可为 null。
      </Note>
    </div>
  )
}
