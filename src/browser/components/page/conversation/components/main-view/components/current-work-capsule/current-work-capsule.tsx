// 会話の画面のメインビューの下に浮かぶ「いまの作業」の札。
// 会話の画面の広い帯には札を置かないので（`PresentationalScreenNav`）、その代わりにここで見せる。
//
// 依頼待ちのあいだは何も描かない（動いている・待っている・止まっているときだけ浮かぶ）。
// 開閉の状態はこの札だけのものを持つ。

import { useRef, type ReactElement } from "react"

import { CurrentWorkPill } from "../../../../../../../features/current-work/components/current-work-pill.tsx"
import { useCurrentWork } from "../../../../../../../features/current-work/hooks/use-current-work.ts"
import styles from "./current-work-capsule.module.css"

export function CurrentWorkCapsule(): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const work = useCurrentWork(ref)

  return (
    <div className={styles["current-work-dock"]} ref={ref}>
      {work.state !== "idle" && (
        <div className={styles["current-work-capsule"]}>
          <CurrentWorkPill work={work} variant="capsule" />
        </div>
      )}
    </div>
  )
}
