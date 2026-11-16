declare module 'react-i18next' {
  export function useTranslation(...args: any[]): {
    t: (...args: any[]) => any
    i18n: any
  }
  export const initReactI18next: unknown
}
