// 新しい器の紙に描くワークプランのロジック。働くあいだは判定の行と計画、終わったあとは紙の末尾の道筋に畳む。

import { conversationMoment } from "../../../../../../../shared/session/conversation-moment.ts"
import {
  type RecordTime,
  recordTimeAt,
} from "../../../../../../../shared/session/session-record.ts"
import { phaseCount, type LatestWorkPlan } from "../../../../../../../shared/session/work-plan.ts"
import { formatElapsed } from "../../../../../../../shared/utils/elapsed-time.ts"
import {
  isTurnCounting,
  turnCountedUntil,
  turnElapsedLabel,
  turnElapsedText,
} from "../../../../../../domain/turn-elapsed.ts"
import { useEventListener } from "../../../../../../hooks/use-event-listener.ts"
import { useNowWhile } from "../../../../../../stores/clock.ts"
import { useCurrentTurnSteps } from "../../../../../../stores/current-turn-step-list.ts"
import { useMainViewTurns } from "../../../../../../stores/main-view-turn.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { phaseRecapsOf } from "../../../domain/phase-recap.ts"
import { turnResultsOf } from "../../../domain/turn-result.ts"
import { NO_USUAL_TEXT, remainingEstimate, type UsualText } from "../../../domain/usual-duration.ts"
import {
  type FoldedWorkPlan,
  foldWorkPlanSlots,
  rowsOfSlot,
  type WorkPlanRow,
  type WorkPlanSlot,
  workPlanSlotsOf,
} from "../../../domain/work-plan-row.ts"
import { useComposerDraft } from "../../../stores/composer-draft.ts"
import { useMainViewContent } from "../../../stores/main-view-content.ts"
import { useUsualDurations } from "../../../stores/usual-duration.ts"
import { useWorkQuietLine, type WorkQuietLine } from "./use-work-quiet.ts"

/** 判定の行の語。答え待ち・背景だけが残っている・働いている。 */
type WorkingVerdict = "asking" | "background" | "running"

/** 済んだあとの道筋の語。全部済んだか、途中で止めた（失敗も含む）か。 */
type RouteEnding = "finished" | "stopped"

/**
 * 紙に描くワークプラン。
 *
 * - `none`: 出さない（迎えるとき・依頼が無いとき・閉じたやり取りにワークプランが無いとき）
 * - `working`: 働くあいだ。判定の行（`verdict`・`position`「4段のうち3段目」・`elapsed`「経過 6分12秒」・`estimate` の見込み）と、止まって見えるときの行（`quietLine`）と、長い並びを畳んだ計画
 * - `finished`: 中身がレポートに入れ替わったあと。紙の末尾に畳んで置く道筋の題と、畳まない並び
 * - `stopped`: 段の途中で止めたあと（書き手が `stopped` で閉じた・レポートが無いまま段を残して閉じた）。
 *   判定の行・続け方の下書き（`onDraft` で入力欄に入れるだけで送らない）・中途半端なもの（今の段で触ったファイル）・ここまでの並び。
 *   レポートが無いまま閉じたのは利用者が止めたときなので、`stopper` を `you` にする
 *
 * `rows` は狐火の並びに使う全部の行（読み順）。`now` は「n秒前」を数える時刻。
 */
export type WorkPlanPaperModel =
  | { readonly kind: "none" }
  | {
      readonly kind: "working"
      readonly verdict: WorkingVerdict
      readonly position: string
      readonly elapsed: string
      readonly estimate: UsualText
      readonly quietLine: WorkQuietLine
      readonly plan: FoldedWorkPlan
      readonly rows: readonly WorkPlanRow[]
      readonly now: number
    }
  | {
      readonly kind: "finished"
      readonly ending: RouteEnding
      readonly summary: string
      readonly slots: readonly WorkPlanSlot[]
      readonly rows: readonly WorkPlanRow[]
      readonly now: number
    }
  | {
      readonly kind: "stopped"
      readonly stopper: "you" | "writer"
      readonly position: string
      readonly elapsed: string
      readonly unfinished: readonly string[]
      readonly slots: readonly WorkPlanSlot[]
      readonly rows: readonly WorkPlanRow[]
      readonly now: number
      readonly onDraft: (text: string) => void
    }

/** 止めたあとの続け方。ボタンか数字のキーで選ぶと、入力欄に下書きを入れるだけで送らない。 */
export const STOPPED_CHOICES = [
  { key: "1", label: "続きから再開する", draft: "止めたところから続きを再開して" },
  { key: "2", label: "ここまでをコミットする", draft: "ここまでの変更をコミットして" },
  { key: "3", label: "元に戻す", draft: "ここまでの変更を元に戻して" },
] as const

const SUMMARY_SEPARATOR = " ・ "

const STOPPED_MIDWAY_SUFFIX = "の途中"

export function useWorkPlanPaper(): WorkPlanPaperModel {
  const turnStepList = useCurrentTurnSteps()
  const content = useMainViewContent((state) => state.content)
  const turn = useSession((session) => session.state.turn)
  const pending = useSession((session) => session.state.pending)
  const backgroundCount = useSession((session) => session.state.backgroundTasks.length)
  const delegateRoles = useSession((session) => session.state.delegateRoles)
  const moment = useSession((session) => conversationMoment(session.state))
  const turns = useMainViewTurns()
  const replaceDraft = useComposerDraft((state) => state.replaceDraft)
  const usual = useUsualDurations()
  const shown = content.kind !== "welcome" && turnStepList.kind === "turn"
  const now = useNowWhile(shown && isTurnCounting(turn, backgroundCount))
  const quietLine = useWorkQuietLine(now)

  if (!shown) {
    return { kind: "none" }
  }
  const plan = turnStepList.plan
  const slots =
    plan.kind === "planned"
      ? workPlanSlotsOf({
          plan,
          recaps: phaseRecapsOf(turnStepList.trail, {
            kind: "stamped",
            at: turnCountedUntil(turn, backgroundCount, now),
          }),
          steps: turnStepList.steps,
          delegates: delegateRoles,
          usual,
        })
      : []
  const rows = slots.flatMap(rowsOfSlot)

  if (content.kind === "work") {
    return {
      kind: "working",
      verdict:
        pending.length > 0
          ? "asking"
          : turn.kind !== "running" && backgroundCount > 0
            ? "background"
            : "running",
      position: positionText(plan, rows),
      elapsed: `${turnElapsedLabel(turn, backgroundCount)} ${turnElapsedText(turn, backgroundCount, now)}`,
      estimate: plan.kind === "planned" ? remainingEstimate(plan, rows, usual) : NO_USUAL_TEXT,
      quietLine,
      plan: foldWorkPlanSlots(slots),
      rows,
      now,
    }
  }
  if (plan.kind !== "planned") {
    return { kind: "none" }
  }
  const result = turnResultsOf(turns, moment).at(-1)
  const settled = rows.filter((row) => row.state === "done" || row.state === "skipped").length
  const finalReported = turns.at(-1)?.steps.some((step) => step.mark === "final") ?? false
  const halfway = result !== "failed" && !finalReported && settled < rows.length
  if (result === "stopped" || halfway) {
    return {
      kind: "stopped",
      stopper: halfway ? "you" : "writer",
      position: rows.some((row) => row.state === "current")
        ? `${positionText(plan, rows)}${STOPPED_MIDWAY_SUFFIX}`
        : `${String(rows.length)}段のうち${String(settled)}段が済んだ`,
      elapsed: turn.kind === "idle" ? "" : turnElapsedText(turn, backgroundCount, now),
      unfinished: rows.filter((row) => row.state === "current").flatMap((row) => row.touched),
      slots,
      rows,
      now,
      onDraft: (text) => {
        replaceDraft({ text, caret: text.length })
      },
    }
  }
  const ending: RouteEnding = result === "failed" || settled < rows.length ? "stopped" : "finished"
  const total = phaseCount(plan.phases)
  const count =
    ending === "finished"
      ? `${String(total)}段`
      : `${String(total)}段のうち${String(settled)}段が済んだ`
  const elapsed = turn.kind === "idle" ? "" : turnElapsedText(turn, backgroundCount, now)
  return {
    kind: "finished",
    ending,
    summary: [count, elapsed, `道具 ${String(turnStepList.steps.length)} 回`]
      .filter((part) => part !== "")
      .join(SUMMARY_SEPARATOR),
    slots,
    rows,
    now,
  }
}

/**
 * 止めたあとの紙で、数字のキーを続け方のボタンと同じ働きにする。
 * 入力欄などに打っているあいだの数字は文字なので拾わない。
 */
export function useStoppedChoiceKeys(model: WorkPlanPaperModel): void {
  useEventListener(
    window,
    "keydown",
    (event) => {
      if (
        model.kind !== "stopped" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.isComposing ||
        isTypingTarget(event.target)
      ) {
        return
      }
      const choice = STOPPED_CHOICES.find((candidate) => candidate.key === event.key)
      if (choice === undefined) {
        return
      }
      event.preventDefault()
      model.onDraft(choice.draft)
    },
    { enabled: model.kind === "stopped" },
  )
}

/** `since` から数えた「n秒前」の字。時刻が分からなければ空。 */
export function sinceText(since: RecordTime, now: number): string {
  const at = recordTimeAt(since)
  return at === undefined ? "" : `${formatElapsed(Math.max(0, Math.floor((now - at) / 1000)))}前`
}

/** 「4段のうち3段目」。並列のフェーズの中が今なら「4段のうち2–3段目」、全部済めば「4段すべて済んだ」、ワークプランが無ければ空。 */
function positionText(plan: LatestWorkPlan, rows: readonly WorkPlanRow[]): string {
  if (plan.kind !== "planned") {
    return ""
  }
  const total = String(rows.length)
  const current = rows.flatMap((row, index) => (row.state === "current" ? [index + 1] : []))
  const [first] = current
  const last = current.at(-1)
  if (first === undefined || last === undefined) {
    return `${total}段すべて済んだ`
  }
  const ordinal = first === last ? String(first) : `${String(first)}–${String(last)}`
  return `${total}段のうち${ordinal}段目`
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}
