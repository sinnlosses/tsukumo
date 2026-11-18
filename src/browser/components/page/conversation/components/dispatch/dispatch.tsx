// 入力欄一式（<Composer>）。
// 答え待ちの印（タブのタイトルの先頭の「● 」・枠の色）は `state.pending` からここが出す。

import { useState, type ReactElement } from "react"

import { conversationMoment } from "../../../../../../shared/session/conversation-moment.ts"
import type { LatestWorkPlan } from "../../../../../../shared/session/work-plan.ts"
import { useExternalSync } from "../../../../../hooks/use-external-sync.ts"
import { useCurrentTurnSteps } from "../../../../../stores/current-turn-step-list.ts"
import { useMainViewTurns } from "../../../../../stores/main-view-turn.ts"
import { useSession } from "../../../../../stores/session.ts"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import {
  endedWhileHiddenOf,
  tabTitleMarkOf,
  tabTitleOf,
  tabTitleProgressOf,
} from "../../domain/tab-title-mark.ts"
import { turnResultsOf } from "../../domain/turn-result.ts"
import { Composer } from "./composer.tsx"
import styles from "./dispatch.module.css"

const NO_PLAN = { kind: "none" } as const satisfies LatestWorkPlan

export function Dispatch(): ReactElement {
  const pendingActive = useSession((session) => session.state.pending.length > 0)
  const turns = useMainViewTurns()
  const moment = useSession((session) => conversationMoment(session.state))
  const turnStepList = useCurrentTurnSteps()
  const chatMode = useSession((session) => session.state.chatMode)
  // 雑談モードは答え待ちの印だけ。
  const newestResult = chatMode ? "no-report" : (turnResultsOf(turns, moment).at(-1) ?? "no-report")
  // 最初に読んだ元のタイトルへ戻す（読むのは1回だけ）。
  const [originalTitle] = useState(() => document.title)
  // 隠れているあいだに終わったか。結果が変わった時点の `document.hidden` で決め、表に戻ったら外す（保存しない）。
  const [tracked, setTracked] = useState({ result: newestResult, endedWhileHidden: false })
  if (tracked.result !== newestResult) {
    setTracked({
      result: newestResult,
      endedWhileHidden: endedWhileHiddenOf(tracked.result, newestResult, document.hidden),
    })
  }
  const { endedWhileHidden } = tracked

  useExternalSync(() => {
    const onVisibilityChange = (): void => {
      if (!document.hidden) {
        setTracked((current) => ({ ...current, endedWhileHidden: false }))
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  const progress = tabTitleProgressOf({
    pendingActive,
    newestResult,
    plan: turnStepList.kind === "turn" ? turnStepList.plan : NO_PLAN,
  })

  useExternalSync(() => {
    document.title = tabTitleOf(
      originalTitle,
      tabTitleMarkOf({ pendingActive, newestResult, endedWhileHidden }),
      progress,
    )
  }, [pendingActive, newestResult, endedWhileHidden, originalTitle, progress])

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
      <Composer />
    </VStack>
  )
}
