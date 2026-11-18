// 進み具合のプログレスバーの縦線の右に出す、いまの手順の一文のロジック。文は `nowStepStatementOf` が言う。
// 手順が替わったときは、前の文を「抜ける文」として覚え、器が上へ抜けるあいだだけ重ねて出す。

import { useState } from "react"

import { conversationMoment } from "../../../../../../../shared/session/conversation-moment.ts"
import { reportDraftingOf } from "../../../../../../../shared/session/turn-progress.ts"
import { isTurnCounting } from "../../../../../../domain/turn-elapsed.ts"
import { usePhoneWidth } from "../../../../../../hooks/use-phone-width.ts"
import { useNowWhile } from "../../../../../../stores/clock.ts"
import { useCurrentTurnSteps } from "../../../../../../stores/current-turn-step-list.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { useMainViewContent } from "../../../stores/main-view-content.ts"
import { nowStepKeyOf, nowStepStatementOf, type Doing } from "../domain/now-step-statement.ts"

export type WorkStripNow =
  | { readonly kind: "none" }
  | {
      readonly kind: "shown"
      readonly statement: Doing
      /** 手順が替わると変わる。器は鍵で入る文を作り直し、入る動きを掛ける。 */
      readonly key: string
      /** 上へ抜けている途中の前の文。 */
      readonly leaving: NowLeaving
      /** 抜ける動きが終わったとき、抜ける文を消す。 */
      readonly onLeft: () => void
    }

export type NowLeaving =
  | { readonly kind: "none" }
  | { readonly kind: "statement"; readonly statement: Doing }

type Seen =
  | { readonly kind: "none" }
  | { readonly kind: "doing"; readonly key: string; readonly statement: Doing }

const NONE = { kind: "none" } as const

export function useWorkStripNow(): WorkStripNow {
  const turnStepList = useCurrentTurnSteps()
  const phoneWidth = usePhoneWidth()
  const contentKind = useMainViewContent((state) => state.content.kind)
  const moment = useSession((session) => conversationMoment(session.state))
  const turn = useSession((session) => session.state.turn)
  const pending = useSession((session) => session.state.pending)
  const reportDrafting = useSession((session) => reportDraftingOf(session.state.sdkTurn))
  const backgroundTasks = useSession((session) => session.state.backgroundTasks)
  const workflowSteps = useSession((session) => session.state.workflowSteps)
  const workflowProgress = useSession((session) => session.state.workflowProgress)
  const apiTrouble = useSession((session) => session.state.apiTrouble)
  const records = useSession((session) => session.state.records)
  const now = useNowWhile(isTurnCounting(turn, backgroundTasks.length))
  const [seen, setSeen] = useState<Seen>(NONE)
  const [leaving, setLeaving] = useState<NowLeaving>(NONE)

  const statement =
    !phoneWidth && contentKind !== "welcome" && turnStepList.kind === "turn" && moment === "work"
      ? nowStepStatementOf({
          turnStepList,
          firstPending: pending[0],
          reportDrafting,
          backgroundTasks,
          workflowSteps,
          workflowProgress,
          turn,
          apiTrouble,
          records,
          now,
        })
      : NONE
  const current: Seen =
    statement.kind === "doing" ? { kind: "doing", key: nowStepKeyOf(statement), statement } : NONE

  if (current.kind === "none") {
    if (seen.kind !== "none") {
      setSeen(NONE)
      setLeaving(NONE)
    }
    return NONE
  }
  const replaced = seen.kind === "doing" && seen.key !== current.key
  if (seen.kind !== "doing" || replaced || seen.statement.elapsed !== current.statement.elapsed) {
    setSeen(current)
    if (replaced) {
      setLeaving({ kind: "statement", statement: seen.statement })
    }
  }
  return {
    kind: "shown",
    statement: current.statement,
    key: current.key,
    leaving: replaced ? { kind: "statement", statement: seen.statement } : leaving,
    onLeft: () => setLeaving(NONE),
  }
}
