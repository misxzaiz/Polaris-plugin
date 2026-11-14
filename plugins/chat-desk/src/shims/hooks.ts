/**
 * hooks shim —— host 树 `@/hooks/*` 导入（useContainerWidth/useDebounce/
 * useNowTicker/useWindowSize 本地同源实现；useFileSearch 转发宿主服务）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from './services'

// ── useContainerWidth（同宿主实现）──
export function useContainerWidth<T extends HTMLElement = HTMLDivElement>(initialWidth = 0) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(initialWidth)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width
        setWidth(Math.round(w))
      }
    })
    observer.observe(el)
    setWidth(Math.round(el.getBoundingClientRect().width))
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

// ── useDebounce / useDebouncedCallback ──
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const h = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(h)
  }, [value, delay])
  return debounced
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
): { debounced: T; cancel: () => void } {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debounced = ((...args: any[]) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => callback(...args), delay)
  }) as unknown as T
  const cancel = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }
  return { debounced, cancel }
}

// ── useNowTicker ──
export function useNowTicker(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [active, intervalMs])
  return now
}

// ── useWindowSize（同宿主实现，去掉临时诊断日志）──
export interface WindowSizeInfo {
  width: number
  height: number
  isCompact: boolean
}

export function useWindowSize(options: { compactThreshold?: number; enabled?: boolean } = {}): WindowSizeInfo {
  const { compactThreshold = 500, enabled = true } = options
  const [size, setSize] = useState<WindowSizeInfo>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
    isCompact: typeof window !== 'undefined' ? window.innerWidth < compactThreshold : false,
  }))
  const sizeRef = useRef(size)
  useEffect(() => {
    if (!enabled) return
    const onResize = () => {
      if (document.hidden) return
      let width = window.innerWidth
      if (width <= 0) width = sizeRef.current.width
      const next: WindowSizeInfo = { width, height: window.innerHeight, isCompact: width < compactThreshold }
      sizeRef.current = next
      setSize(next)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [compactThreshold, enabled])
  return size
}

// ── useFileSearch ──
import type { FileMatch } from './services'
export type { FileMatch }

export function useFileSearch() {
  const [fileMatches, setFileMatches] = useState<FileMatch[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const searchFiles = useCallback(async (query: string, workspace?: unknown) => {
    const q = query.trim()
    if (!q) {
      setFileMatches([])
      return
    }
    setIsSearching(true)
    try {
      const workspacePath =
        workspace && typeof workspace === 'object' && 'path' in workspace
          ? String((workspace as { path?: unknown }).path ?? '')
          : ''
      // 对齐宿主 fileSearch.searchFiles(query, workDir, maxResults)
      const results = await invoke<FileMatch[]>('search_files', {
        workDir: workspacePath || undefined,
        query: q,
        maxResults: 10,
      })
      setFileMatches(Array.isArray(results) ? results : [])
    } catch {
      setFileMatches([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const clearResults = useCallback(() => setFileMatches([]), [])
  return { fileMatches, isSearching, searchFiles, clearResults }
}
