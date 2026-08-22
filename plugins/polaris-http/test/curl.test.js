import { strict as assert } from 'assert'
import { parseCurl } from '../src/core/parser.js'

const cases = [
  // [curl命令, 期望method, 期望bodyType]
  ["curl -X POST 'https://api.example.com/users' -H 'Content-Type: application/json' -d '{\"name\":\"test\"}'", 'POST', 'json'],
  ["curl 'https://api.example.com/users' -H 'Content-Type: application/json' -d '{\"name\":\"test\"}'", 'POST', 'json'],
  ["curl --data 'param1=value1&param2=value2' http://example.com/resource.cgi", 'POST', 'text'],
  ["curl -X POST http://api.example.com/users -d '{\"a\":1}'", 'POST', 'json'],
  ["curl http://api.example.com/users -X POST", 'POST', 'none'],
  ["curl -d '{\"a\":1}' http://api.example.com", 'POST', 'json'],
]

let pass = 0, fail = 0
for (const [cmd, m, bt] of cases) {
  const r = parseCurl(cmd)
  const ok = r.method === m && r.bodyType === bt
  console.log(`${ok ? '✓' : '✗'} method=${r.method}(${m}) bodyType=${r.bodyType}(${bt}) | ${cmd.slice(0,60)}`)
  if (ok) pass++; else fail++
}
console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail ? 1 : 0)