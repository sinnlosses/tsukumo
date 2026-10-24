// `ReportReview` の単体テストが共有する、手で書いた架空の下書き・イベントと、新しい事実の帳面を手で動かせる `ReportReview`。

import {
  REPORT_REJECTION_MODES,
  type ReportRejectionModes,
} from "../../src/server/report/core/rejection-mode.ts"
import {
  createReportReview as createReviewWithNews,
  type ReportReview,
} from "../../src/server/report/core/report-review.ts"
import type { ReportDraft } from "../../src/server/report/core/report-violation.ts"
import type { ReportSection } from "../../src/shared/report/report-block.ts"
import type { BackgroundTask } from "../../src/shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import type { WorkPlanStanding } from "../../src/shared/session/work-plan.ts"
import { reportDraft } from "./report-event.ts"

/** `report` の差し戻しの固定の文面を見分ける句。 */
export const REJECTION_PHRASE = {
  resend: "同じ引数で送り直さず",
  nothingNew: "伝える新しい事実が無いターン",
  unansweredWorkPlan: "差し戻された `work_plan` に、まだ応えていない",
  missingWorkPlanClosing: "workPlanClosing に段の閉じ方を入れる",
  unfinishedPhases: "済んでいない段が2つ以上残っている",
  finishedButStopped: "workPlanClosing が `stopped` でワークプランに済んでいない段が残っている",
  finishedWithNg: "`checks` に `ng` の行がある",
} as const

export const noPlan = (): WorkPlanStanding => ({ kind: "none" })

/** 逃げ道の塊1つの節（中身は架空）。 */
export const sectionsOf = (markdown: string): readonly ReportSection[] => [
  {
    heading: "",
    shapeTag: "unspecified",
    blocks: [{ kind: "markdown", markdown, fold: "", aside: "" }],
  },
]

export const VALID: ReportDraft = reportDraft({ conclusion: "架空の結論。" })
export const INVALID: ReportDraft = reportDraft({
  conclusion: "架空の結論。",
  sections: sectionsOf("# 架空の見出し"),
})

export const SESSION_INFO: SessionEvent = {
  kind: "session-info",
  sessionId: "架空のセッション",
  model: undefined,
  permissionMode: undefined,
  slashCommands: [],
  terminalSlashCommands: [],
  skillNames: [],
  agentNames: [],
}
export const FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }

/**
 * 新しい事実の帳面は `CallReview` が持つので、ここでは手で動かせる帳面を渡す。
 * `raiseNews` は新しい事実が届いたこと、`setTasks` は生きているバックグラウンドタスクの顔ぶれを表す。
 */
export type TestReview = ReportReview & {
  readonly raiseNews: () => void
  readonly setTasks: (tasks: readonly BackgroundTask[]) => void
}

/** `modes` は条ごとの段。既定は本番の表。 */
export function createReportReview(
  workPlanStanding: () => WorkPlanStanding,
  modes: ReportRejectionModes = REPORT_REJECTION_MODES,
): TestReview {
  let hasNews = true
  let tasks: readonly BackgroundTask[] = []
  const review = createReviewWithNews(
    workPlanStanding,
    {
      hasNews: () => hasNews,
      markDrawn: () => {
        hasNews = false
      },
      backgroundTasks: () => tasks,
    },
    modes,
  )
  return {
    ...review,
    raiseNews: () => {
      hasNews = true
    },
    setTasks: (next) => {
      tasks = next
    },
  }
}
