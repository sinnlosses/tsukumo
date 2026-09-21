// 入力欄一式（<Dispatch> = <PendingAnswer> + <Composer>（<TurnStatus> を内包）。
// docs/design.md 6.1）。答え待ちの印（タブのタイトルの先頭の「● 」・枠の色）は
// `state.pending` からここが出す（移行の段4。段の記録は
// `docs/history/decision.md`「design.md 12. 移行の段階」）。

import { useEffect, useRef, type ReactElement } from "react"

import { useSessionSelector } from "../../stores/session.tsx"
import { Composer } from "./composer.tsx"
import styles from "./dispatch.module.css"
import { PendingAnswer } from "./pending-answer.tsx"

export function Dispatch(): ReactElement {
  const pendingActive = useSessionSelector((session) => session.state.pending.length > 0)
  // 最初に読んだ元のタイトルへ戻す（読むのは1回だけ）。
  const originalTitleRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (originalTitleRef.current === undefined) {
      originalTitleRef.current = document.title
    }
    const originalTitle = originalTitleRef.current
    document.title = pendingActive ? `● ${originalTitle}` : originalTitle
  }, [pendingActive])

  return (
    <div className={styles["dispatch"]}>
      {pendingActive ? (
        <div className={styles["dispatch-pending-glow"]} aria-hidden="true" />
      ) : null}
      <PendingAnswer />
      <Composer />
    </div>
  )
}
