// 入力欄一式（<Dispatch> = <PendingAnswer> + <Composer>（<TurnStatus> を内包）。
// docs/design.md 6.1）。答え待ちの印（タブのタイトルの先頭の「● 」・枠の色）は
// `state.pending` からここが出す（docs/design.md 12章 段4「やること」2）。

import { useEffect, useRef, type ReactElement } from "react"

import { useSession } from "../app.tsx"
import { Composer } from "./composer.tsx"
import { PendingAnswer } from "./pending-answer.tsx"

export function Dispatch(): ReactElement {
  const { state } = useSession()
  const pendingActive = state.pending.length > 0
  // 最初に読んだ元のタイトルへ戻す（読むのは1回だけ。旧 src/presentation/browser/dispatch.ts と
  // 同じ考え方）。
  const originalTitleRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (originalTitleRef.current === undefined) {
      originalTitleRef.current = document.title
    }
    const originalTitle = originalTitleRef.current
    document.title = pendingActive ? `● ${originalTitle}` : originalTitle
  }, [pendingActive])

  return (
    <div className="dispatch">
      {pendingActive ? <div className="dispatch-pending-glow" aria-hidden="true" /> : null}
      <PendingAnswer />
      <Composer />
    </div>
  )
}
