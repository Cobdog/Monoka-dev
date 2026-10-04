/**
 * NoticeBanner — the studio's inline notice banner (component vocabulary
 * task 9, Flux k2q0n9s). Behavior shared, chrome per-surface (the
 * modularity contract, the P06 doctrine the family established): the
 * component renders the tone recipe classes and the announcement contract;
 * the consuming surface's class (via `className`) carries its true
 * divergences — the border EDGE (the workbench note's top edge vs the
 * datasets banners' bottom edge) and text behaviors (pre-wrap) — composed
 * alongside, split to border longhands per the C1 discipline.
 *
 * The announcement contract: `role` is a CLOSED matrix ('status' |
 * 'alert') and renders together with the aria-live that role implies
 * (status→polite, alert→assertive), so the explicit attribute can never
 * disagree with the role's implicit semantics.
 *
 * The dismiss contract is ONE path: when `onDismiss` is provided the ×
 * button renders and OWNS the handler — the banner body never dismisses
 * (the retired iw-notice's banner-click dismissal died here, on purpose).
 *
 * The recipes live in src/styles.css (`.notice-banner`,
 * `.notice-banner--{tone}`); the class/aria math lives in
 * ./noticeClasses.ts (react-free, node-tested).
 */
import type { HTMLAttributes, ReactNode } from 'react'
import { noticeAria, noticeClasses, type NoticeRole, type NoticeTone } from './noticeClasses'

export type { NoticeRole, NoticeTone }

export type NoticeBannerProps = Omit<HTMLAttributes<HTMLDivElement>, 'role'> & {
  /** Tone recipe (closed matrix — see noticeClasses.ts). Required. */
  tone: NoticeTone
  /** The announcement role (closed matrix): status (polite) or alert
   *  (assertive). Required — a roleless banner is what this component
   *  retired. */
  role: NoticeRole
  /** The × button's dismiss handler. Omit for a persistent banner (no ×
   *  renders). */
  onDismiss?: () => void
  children?: ReactNode
}

export function NoticeBanner({ tone, role, onDismiss, className, children, ...rest }: NoticeBannerProps) {
  return (
    <div className={noticeClasses({ tone, className })} {...noticeAria(role)} {...rest}>
      {children}
      {onDismiss ? <button type="button" aria-label="Dismiss" onClick={onDismiss}>×</button> : null}
    </div>
  )
}
