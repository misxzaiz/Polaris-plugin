// 命名风格互转 —— 统一先切词再拼装，处理驼峰/帕斯卡/蛇形/连字符/空格/点分/常量与缩略词
// 切词策略：在小写数字→大写、大写缩略词→大写+小写两处插边界，再按非字母数字切分

export function splitWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0)
}

export interface CaseResult {
  words: string[]
  camel: string
  pascal: string
  snake: string
  constant: string
  kebab: string
  train: string
  dot: string
  title: string
  lower: string
  upper: string
}

export function convertCase(input: string): CaseResult {
  const words = splitWords(input)
  const lower = words.map((w) => w.toLowerCase())
  const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)
  return {
    words,
    camel: lower.map((w, i) => (i === 0 ? w : capitalize(w))).join(''),
    pascal: lower.map(capitalize).join(''),
    snake: lower.join('_'),
    constant: lower.map((w) => w.toUpperCase()).join('_'),
    kebab: lower.join('-'),
    train: lower.map(capitalize).join('-'),
    dot: lower.join('.'),
    title: words.map(capitalize).join(' '),
    lower: lower.join(' '),
    upper: lower.map((w) => w.toUpperCase()).join(' '),
  }
}
