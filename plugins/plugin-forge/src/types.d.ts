/** esbuild text loader 内联资源的类型声明（--loader:.md=text / --loader:.txt=text） */
declare module '*.md' {
  const content: string
  export default content
}
declare module '*.txt' {
  const content: string
  export default content
}
