// 入力欄一式（<PendingAnswer> + <Composer>）。
// 答え待ちの印（タブのタイトルの先頭の「● 」・枠の色）は `state.pending` からここが出す。

import { useEffect, useRef, type ReactElement } from "react"

import { useSession } from "../../../../../stores/session.ts"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import { Composer } from "./components/composer/composer.tsx"
import { PendingAnswer } from "./components/pending-answer/pending-answer.tsx"
import styles from "./dispatch.module.css"

export function Dispatch(): ReactElement {
  const pendingActive = useSession((session) => session.state.pending.length > 0)
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
    <VStack
      element="div"
      name={{ kind: "none" }}
      ref={undefined}
      gap="sm"
      align="stretch"
      justify="start"
      wrap="nowrap"
      className={styles["dispatch"]}
    >
      {pendingActive && <div className={styles["dispatch-pending-glow"]} aria-hidden="true" />}
      <PendingAnswer />
      <Composer />
    </VStack>
  )
}
