/**
 * CSS 变量 → xterm ITheme（移植内置 TerminalPanel.getXtermTheme；主题 token 唯一来源，
 * 禁止硬编码色值——降级 fallback 与内置一致）
 */

export interface XtermThemeLike {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export function getXtermTheme(themeId: string): XtermThemeLike {
  const get = (name: string, fallback: string): string => {
    if (typeof document === 'undefined') return fallback;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  };

  const isLight = themeId === 'light';
  const bg = get('--c-bg-base', isLight ? '250 250 252' : '0 0 0');
  const text = get('--c-text-primary', isLight ? '15 23 42' : '248 248 248');
  const textSec = get('--c-text-secondary', isLight ? '51 65 85' : '180 180 184');
  const primary = get('--c-primary', isLight ? '37 99 235' : '59 130 246');

  return {
    background: `rgb(${bg})`,
    foreground: `rgb(${text})`,
    cursor: `rgb(${text})`,
    cursorAccent: `rgb(${bg})`,
    selectionBackground: isLight ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.3)',
    black: '#000000',
    red: '#cd3131',
    green: isLight ? '#107c10' : '#0dbc79',
    yellow: isLight ? '#b58900' : '#e5e510',
    blue: `rgb(${primary})`,
    magenta: isLight ? '#8250df' : '#bc3fbc',
    cyan: '#11a8cd',
    white: `rgb(${textSec})`,
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: isLight ? '#14ce14' : '#23d18b',
    brightYellow: isLight ? '#b89500' : '#f5f543',
    brightBlue: `rgb(${primary})`,
    brightMagenta: isLight ? '#bc05bc' : '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: `rgb(${text})`,
  };
}
