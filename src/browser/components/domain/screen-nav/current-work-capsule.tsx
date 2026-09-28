// 会話の画面のメインビューの下に浮かぶ「いまの作業」の札。
// 会話の画面の広い帯には札を置かないので（`PresentationalScreenNav`）、その代わりにここで見せる。
//
// 依頼待ちのあいだは何も描かない（動いている・待っている・止まっているときだけ浮かぶ）。
// 中身と一覧は帯の札（`ScreenNavCurrentWorkPill`）をそのまま使い、開閉の状態はこの札だけのものを持つ。

import { useRef, type ReactElement } from "react"

import { ScreenNavCurrentWorkPill } from "./components/screen-nav-current-work.tsx"
import styles from "./current-work-capsule.module.css"
import { useCurrentWork } from "./hooks/use-current-work.ts"

export function CurrentWorkCapsule(): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const work = useCurrentWork(ref)

  return (
    <div className={styles["current-work-dock"]} ref={ref}>
      {work.state !== "idle" && (
        <div className={styles["current-work-capsule"]}>
          <ScreenNavCurrentWorkPill work={work} variant="capsule" />
        </div>
      )}
    </div>
  )
}
