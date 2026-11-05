// 読み上げの領域。外枠は常に居て、中の文だけが入れ替わるので、入れ替わるたびに1回ずつ読まれる。

import type { ReactElement } from "react"

import { VisuallyHidden } from "../../../../ui/visually-hidden/visually-hidden.tsx"
import { useAnnouncement } from "../../stores/announcement.ts"

export function LiveAnnouncer(): ReactElement {
  const batch = useAnnouncement((state) => state.batch)
  return (
    <VisuallyHidden
      element="div"
      role="status"
      aria-live="polite"
      aria-atomic="false"
      data-live-announcer=""
    >
      {batch.texts.map((text, index) => (
        <p key={`${String(batch.id)}-${String(index)}`}>{text}</p>
      ))}
    </VisuallyHidden>
  )
}
