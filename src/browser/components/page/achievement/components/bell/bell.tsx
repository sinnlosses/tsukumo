// 「日記あり」の鈴。

import type { ReactElement } from "react"

/** `size` の既定は暦のマスの大きさ。 */
export function Bell(props: { readonly size?: number } = {}): ReactElement {
  const size = props.size ?? 12
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" fill="var(--diary-gold)" />
      <circle cx="12" cy="20.5" r="1.8" fill="var(--diary-gold)" />
    </svg>
  )
}
