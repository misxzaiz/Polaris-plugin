declare module '@tauri-apps/plugin-dialog' {
  export function open(opts?: { directory?: boolean; multiple?: boolean; title?: string }): Promise<string | string[] | null>
  export function save(opts?: { defaultPath?: string; title?: string }): Promise<string | null>
}
declare module '@tauri-apps/plugin-process' {
  export function relaunch(): Promise<void>
}
declare module '@tauri-apps/plugin-opener' {
  export function openPath(path: string): Promise<void>
}
