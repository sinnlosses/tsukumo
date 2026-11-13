// 入力欄一式（<Composer>）。
// タブの題（`tabTitleOf`）を `document.title` へ書くのと、答え待ちの枠の光は、ここが出す。

import { useState, type ReactElement } from "react"

import { useExternalSync } from "../../../../../hooks/use-external-sync.ts"
import { useSession } from "../../../../../stores/session.ts"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import { tabTitleOf } from "../../domain/tab-title.ts"
import { Composer } from "./composer.tsx"
import styles from "./dispatch.module.css"
import type { DispatchProgress } from "./turn-status.tsx"

/** `progress` は入力欄に置く進み具合（{@link DispatchProgress}）。 */
export function Dispatch(props: { readonly progress: DispatchProgress }): ReactElement {
  const pendingActive = useSession((session) => session.state.pending.length > 0)
  // 最初に読んだ元のタイトルへ戻す（読むのは1回だけ）。
  const [originalTitle] = useState(() => document.title)
  const title = useSession((session) => tabTitleOf(session.state, originalTitle))

  useExternalSync(() => {
    document.title = title
  }, [title])

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
