/// <reference types="react" />
interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
