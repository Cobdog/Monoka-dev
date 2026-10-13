import type { DesktopApi } from './types'

declare global {
  interface Window {
    monoka: DesktopApi
  }

  /** App version from package.json, injected by vite define at build time. */
  const __APP_VERSION__: string
}

export {}
