/**
 * Translates studio media URLs into the web server's media routes.
 * Everything playable flows through /api/lan/media now. The monoka-media://
 * scheme is new-only (rename-sweep T3, zero back-compat): persisted values
 * carrying the pre-rename minimax-media:// prefix were rewritten by db
 * migration 009 and the one-time localStorage copy — no reader here accepts
 * the old scheme.
 */
export function webMediaUrl(value?: string): string | undefined {
  if (!value) return value
  if (value.startsWith('monoka-media://comfy')) {
    const upstream = new URLSearchParams(value.slice('monoka-media://comfy?'.length)).get('url')
    if (!upstream) return value
    try {
      const params = new URL(upstream).searchParams
      const filename = params.get('filename')
      if (!filename) return value
      const query = new URLSearchParams({ filename, subfolder: params.get('subfolder') ?? '', type: params.get('type') ?? 'output' })
      return `/api/lan/media?${query}`
    } catch { return value }
  }
  if (value.startsWith('monoka-media://local') || value.startsWith('monoka-media://selected')) {
    const path = new URL(value).searchParams.get('path')
    return path ? `/api/lan/media?source=output&path=${encodeURIComponent(path)}` : value
  }
  try {
    const url = new URL(value)
    if (url.pathname === '/view') {
      const query = new URLSearchParams({ filename: url.searchParams.get('filename') ?? '', subfolder: url.searchParams.get('subfolder') ?? '', type: url.searchParams.get('type') ?? 'output' })
      return `/api/lan/media?${query}`
    }
  } catch { /* Not a URL — return as-is. */ }
  return value
}
