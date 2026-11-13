// 入力欄一式（<Composer>）。
// 答え待ちの印（タブのタイトルの先頭の「● 」・枠の色）は `state.pending` からここが出す。

import { useState, type ReactElement } from "react"

import { useExternalSync } from "../../../../../hooks/use-external-sync.ts"
import { useSession } from "../../../../../stores/session.ts"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import { Composer } from "./composer.tsx"
import styles from "./dispatch.module.css"
import type { DispatchProgress } from "./turn-status.tsx"

/** `progress` は入力欄に置く進み具合（{@link DispatchProgress}）。 */
export function Dispatch(props: { readonly progress: DispatchProgress }): ReactElement {
  const pendingActive = useSession((session) => session.state.pending.length > 0)
  // 最初に読んだ元のタイトルへ戻す（読むのは1回だけ）。
  const [originalTitle] = useState(() => document.title)

  useExternalSync(() => {
    document.title = pendingActive ? `● ${originalTitle}` : originalTitle
  }, [pendingActive, originalTitle])

  return (
    <VStack
      element="div"
      name={{ kind: "none" }}
      gap="sm"
      align="stretch"
      justify="start"
      wrap="nowrap"
      className={styles["dispatch"]}
    >
      {pendingActive && <div className={styles["dispatch-pending-glow"]} aria-hidden="true" />}
      <Composer progress={props.progress} />
    </VStack>
  )
}
