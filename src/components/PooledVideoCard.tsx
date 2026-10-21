/**
 * Shared media-preview widgets over the wave-2d seams (PreviewSource /
 * videoPool / OPFS blob cache): one implementation instead of three per-view
 * thumbnail mounts. Everything here is STATIC — a card, queue row, or bin
 * item renders a filmstrip poster (one small PNG per clip) and NEVER mounts
 * a <video> element. The hooks live in src/media/ (useFilmstrip /
 * usePooledVideo).
 *
 * (foelihc T4, audit T-I2 / spec §8 D5) The card's overlay affordance OPENS
 * THE TAKE VIEWER — nothing plays inline. The pattern supplies the LOOK
 * (the circular play-overlay chrome), not a second play path: after the
 * viewer landed there is ONE transport, and it lives in the viewer. The old
 * pooled-video lease this component used to take is gone with it.
 */
import type { ReactNode } from 'react'
import { Eye } from 'lucide-react'
import type { Filmstrip } from '../media/PreviewSource'
import { useFilmstrip } from '../media/useFilmstrip'

/** Static filmstrip poster. mode="sheet" shows the whole contact sheet (an
 *  <img>); mode="frame" shows frame 1 via CSS background-position on the
 *  sheet — the classic sprite technique, no second request. Falls back to an
 *  empty placeholder (children, e.g. an icon) while loading or when the
 *  clip has no sheet. */
export function FilmstripPoster({ filmstrip, mode = 'sheet', label, children, className = '' }: { filmstrip: Filmstrip | null; mode?: 'sheet' | 'frame'; label: string; children?: ReactNode; className?: string }) {
  if (mode === 'frame') {
    return <div
      className={`filmstrip-poster filmstrip-poster-frame ${className}`}
      role="img"
      aria-label={label}
      style={filmstrip ? {
        backgroundImage: `url("${filmstrip.url}")`,
        backgroundSize: `${filmstrip.cols * 100}% ${filmstrip.rows * 100}%`,
        backgroundPosition: '0% 0%',
      } : undefined}
    >{!filmstrip && children}</div>
  }
  return filmstrip
    ? <img className={`filmstrip-poster ${className}`} src={filmstrip.url} alt={label} loading="lazy" />
    : <div className={`filmstrip-poster filmstrip-poster-empty ${className}`} aria-label={label}>{children}</div>
}

/** The card media area: static filmstrip poster + the review affordance.
 *  The button renders only where a viewer can open (`onReview` supplied) —
 *  the caller owns the gate (the canvas tile consults the same
 *  reviewAffordance model for its own hover affordance). */
export function PooledVideoCard({ path, duration, label, onReview, className = '' }: { path: string | null; duration: number; label: string; onReview?: () => void; className?: string }) {
  const filmstrip = useFilmstrip(path, duration)
  return <div className={`pooled-video-card ${className}`.trim()} data-pooled-video-card>
    <FilmstripPoster filmstrip={filmstrip} label={label} />
    {onReview && (
      <button type="button" className="play-overlay" data-pooled-review aria-label={`Review ${label}`} title="Open the take viewer" onClick={onReview}>
        <Eye size={20} />
      </button>
    )}
  </div>
}
