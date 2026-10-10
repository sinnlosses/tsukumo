// メインの `speak`・`report`・`work_plan` の呼び出しの差し戻し（用語集「呼び出しの差し戻し」）。
// 3つの review（`SpeechReview`・`ReportReview`・`WorkPlanReview`）を順番どおりにつなぎ、呼び手には平らな口を1枚だけ見せる。
//
// `pass` は speak → report → work_plan の順に通す。
// ターンの終わりの預かりがセリフ → レポートの並びになり、`work_plan` の差し戻しは `report` のイベントを見るので `report` の後ろに置く。
// 通すのはメインのイベントだけ（サブエージェントのイベントの見分けは呼び手がする）。
//
// 「新しい事実」の帳面はここに1つだけあり、`speak` と `report` はそれを読む。
// 何を新しい事実に数えるかの差は `NEWS_SUBJECTS_BY_EVENT` で宣言する。

import type { BackgroundTask } from "../../../shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { createReportReview, type ReportVerdict } from "../../report/core/report-review.ts"
import type { ReportDraft } from "../../report/core/report-violation.ts"
import { createSpeechReview, type SpeechVerdict } from "./speech-review.ts"
import { createWorkPlanReview, type WorkPlanVerdict } from "./work-plan-review.ts"

export type CallReview = {
  /** `speak` の handler から。直前に描いたセリフのあとに新しい事実が届いていなければ差し戻す。 */
  readonly judgeSpeak: () => SpeechVerdict
  /** `report` の handler から。 */
  readonly judgeReport: (report: ReportDraft) => ReportVerdict
  /** `work_plan` の handler から、届いた引数のままで呼ぶ。 */
  readonly judgeWorkPlan: (input: unknown) => WorkPlanVerdict
  /**
   * 届いたイベントを、差し戻しを済ませた並びに変える（メインのイベントだけを渡す）。
   * 呼び出しは同じ `toolUseId` の `tool-finished` まで預かり、差し戻されなかったものだけを出す。
   */
  readonly pass: (event: SessionEvent) => readonly SessionEvent[]
  /** 返却が届いてからメインの `work_plan` が受け付けられるまでのあいだ真（関門の印）。 */
  readonly gateRaised: () => boolean
  /** このターンで「新しい事実が無い」`report` の差し戻しをしたか。 */
  readonly nothingNewRejected: () => boolean
}

type NewsSubject = "speak" | "report"

const NEWS_SUBJECTS: readonly NewsSubject[] = ["speak", "report"]

/**
 * メインのツールの完了と背景のタスクの終わりのほかに、イベントの種類ごとに新しい事実として数える主題。
 * `session-info` は `speak` だけ、`aside` は `report` だけが数える。
 */
const NEWS_SUBJECTS_BY_EVENT = {
  request: ["speak", "report"],
  "turn-started": ["speak", "report"],
  "session-info": ["speak"],
  aside: ["report"],
} as const satisfies Partial<Record<SessionEvent["kind"], readonly NewsSubject[]>>

/** {@link CallReview} を1つ作る。セッション1つに1つ。 */
export function createCallReview(): CallReview {
  const ledger = createNewsLedger()
  const speechReview = createSpeechReview({
    hasNews: () => ledger.hasNews("speak"),
    markDrawn: () => ledger.markDrawn("speak"),
  })
  const workPlanReview = createWorkPlanReview()
  const reportReview = createReportReview(workPlanReview.standing, {
    hasNews: () => ledger.hasNews("report"),
    markDrawn: () => ledger.markDrawn("report"),
    backgroundTasks: ledger.backgroundTasks,
  })

  return {
    judgeSpeak: speechReview.judge,
    judgeReport: reportReview.judge,
    judgeWorkPlan: workPlanReview.judge,
    pass: (event) => {
      ledger.observe(event)
      return speechReview.pass(event).flatMap(reportReview.pass).flatMap(workPlanReview.pass)
    },
    gateRaised: workPlanReview.gateRaised,
    nothingNewRejected: reportReview.nothingNewRejected,
  }
}

type NewsLedger = {
  readonly observe: (event: SessionEvent) => void
  readonly hasNews: (subject: NewsSubject) => boolean
  readonly markDrawn: (subject: NewsSubject) => void
  readonly backgroundTasks: () => readonly BackgroundTask[]
}

function createNewsLedger(): NewsLedger {
  // 主題ごとに、直前に描いたあとに新しい事実が届いたか（セッションの頭は届いたものとする）。
  let pending: ReadonlySet<NewsSubject> = new Set(NEWS_SUBJECTS)
  // メインが呼んで結果をまだ受け取っていないツールの id（`speak` / `report` / `work_plan` は入らない）。
  let runningTools: ReadonlySet<string> = new Set()
  let backgroundTasks: readonly BackgroundTask[] = []

  const raise = (subjects: readonly NewsSubject[]): void => {
    pending = new Set([...pending, ...subjects])
  }

  return {
    observe: (event) => {
      switch (event.kind) {
        case "tool-started":
          // サブエージェントのツールは数えない（委譲中の言い直しがまさに差し戻したいもの）。
          if (event.parentToolUseId === undefined) {
            runningTools = new Set([...runningTools, event.toolUseId])
          }
          return
        case "tool-finished":
          if (runningTools.has(event.toolUseId)) {
            runningTools = new Set([...runningTools].filter((id) => id !== event.toolUseId))
            raise(NEWS_SUBJECTS)
          }
          return
        case "background-tasks-changed":
          if (
            backgroundTasks.some((task) => !event.tasks.some((next) => next.taskId === task.taskId))
          ) {
            raise(NEWS_SUBJECTS)
          }
          backgroundTasks = event.tasks
          return
        case "session-ended":
          backgroundTasks = []
          return
        case "request":
        case "turn-started":
        case "session-info":
        case "aside":
          raise(NEWS_SUBJECTS_BY_EVENT[event.kind])
          return
        default:
          return
      }
    },
    hasNews: (subject) => pending.has(subject),
    markDrawn: (subject) => {
      pending = new Set([...pending].filter((candidate) => candidate !== subject))
    },
    backgroundTasks: () => backgroundTasks,
  }
}
