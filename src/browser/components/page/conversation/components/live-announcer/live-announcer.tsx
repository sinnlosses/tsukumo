// 読み上げの領域。外枠は常に居て、中の文だけが入れ替わるので、入れ替わるたびに1回ずつ読まれる。
// 割り込みの知らせ（通知・鈴の音）の store もここで立てる。描画に出るものは無いので、読むだけで中身は使わない。

import type { ReactElement } from "react"

import { VisuallyHidden } from "../../../../ui/visually-hidden/visually-hidden.tsx"
import { useAlert } from "../../stores/alert.ts"
import { useAnnouncement } from "../../stores/announcement.ts"

export function LiveAnnouncer(): ReactElement {
  const batch = useAnnouncement((state) => state.batch)
  useAlert(standUp)
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

/** 変わらない値を返すので、知らせの store が動いても描き直さない。 */
function standUp(): true {
  return true
}
