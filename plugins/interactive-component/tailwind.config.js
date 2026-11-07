/** @type {import('tailwindcss').Config} */
// 宿主 tailwind theme 的逐字段副本（CSS 变量驱动，与宿主主题系统自动联动）。
// 源：主仓 tailwind.config.js theme.extend.colors（2026-11-07 快照）。
// 同步纪律：宿主 theme 变更时同步本文件（模板类名的产出依赖它）。
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'rgb(var(--c-primary) / <alpha-value>)',
          hover: 'rgb(var(--c-primary-hover) / <alpha-value>)',
          50: 'rgb(var(--c-primary-50) / <alpha-value>)',
          100: 'rgb(var(--c-primary-100) / <alpha-value>)',
          200: 'rgb(var(--c-primary-200) / <alpha-value>)',
          300: 'rgb(var(--c-primary-300) / <alpha-value>)',
          400: 'rgb(var(--c-primary-400) / <alpha-value>)',
          500: 'rgb(var(--c-primary-500) / <alpha-value>)',
          600: 'rgb(var(--c-primary-600) / <alpha-value>)',
          700: 'rgb(var(--c-primary-700) / <alpha-value>)',
          faint: 'rgb(var(--c-primary) / 0.15)',
          glow: 'rgb(var(--c-primary) / 0.3)',
        },
        background: {
          base: 'rgb(var(--c-bg-base) / calc(var(--window-opacity, 1) * <alpha-value>))',
          elevated: 'rgb(var(--c-bg-elevated) / calc(var(--window-opacity, 1) * <alpha-value>))',
          surface: 'rgb(var(--c-bg-surface) / calc(var(--window-opacity, 1) * <alpha-value>))',
          hover: 'rgb(var(--c-bg-hover) / calc(var(--window-opacity, 1) * <alpha-value>))',
          active: 'rgb(var(--c-bg-active) / calc(var(--window-opacity, 1) * <alpha-value>))',
          tertiary: 'rgb(var(--c-bg-tertiary) / calc(var(--window-opacity, 1) * <alpha-value>))',
          secondary: 'rgb(var(--c-bg-secondary) / calc(var(--window-opacity, 1) * <alpha-value>))',
        },
        border: {
          DEFAULT: 'rgb(var(--c-border) / 0.15)',
          subtle: 'rgb(var(--c-border) / 0.08)',
          default: 'rgb(var(--c-border) / 0.15)',
          strong: 'rgb(var(--c-border) / 0.25)',
          muted: 'rgb(var(--c-border) / 0.12)',
          focus: 'rgb(var(--c-primary) / 0.5)',
        },
        text: {
          DEFAULT: 'rgb(var(--c-text-primary) / <alpha-value>)',
          primary: 'rgb(var(--c-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--c-text-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--c-text-tertiary) / <alpha-value>)',
          muted: 'rgb(var(--c-text-muted) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--c-status-success) / <alpha-value>)',
          faint: 'rgb(var(--c-status-success) / 0.15)',
        },
        warning: {
          DEFAULT: 'rgb(var(--c-status-warning) / <alpha-value>)',
          faint: 'rgb(var(--c-status-warning) / 0.15)',
        },
        danger: {
          DEFAULT: 'rgb(var(--c-status-danger) / <alpha-value>)',
          faint: 'rgb(var(--c-status-danger) / 0.15)',
        },
        error: {
          DEFAULT: 'rgb(var(--c-status-danger) / <alpha-value>)',
          faint: 'rgb(var(--c-status-danger) / 0.15)',
        },
        info: {
          DEFAULT: 'rgb(var(--c-status-info) / <alpha-value>)',
          faint: 'rgb(var(--c-status-info) / 0.15)',
        },
        accent: {
          ai: 'rgb(var(--c-accent-ai) / <alpha-value>)',
          prototype: 'rgb(var(--c-accent-prototype) / <alpha-value>)',
          workspace: 'rgb(var(--c-accent-workspace) / <alpha-value>)',
        },
        overlay: {
          DEFAULT: 'rgb(var(--c-overlay) / 0.5)',
          light: 'rgb(var(--c-overlay) / 0.3)',
          strong: 'rgb(var(--c-overlay) / 0.9)',
        },
        'on-primary': 'rgb(var(--c-on-primary) / <alpha-value>)',
        'on-danger': 'rgb(var(--c-on-primary) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
