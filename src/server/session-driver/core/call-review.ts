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
import {
  createReportReview,
  type ReportChanges,
  type ReportVerdict,
} from "../../report/core/report-review.ts"
import type { ReportDraft } from "../../report/core/report-violation.ts"
import { judgePhaseMention, type PhaseMentionVerdict } from "./phase-mention.ts"
import { createSpeechReview, type SpeechVerdict } from "./speech-review.ts"
import {
  createWorkPlanReview,
  type PhaseResultVerdict,
  type WorkPlanVerdict,
} from "./work-plan-review.ts"

export type CallReview = {
  /** `speak` の handler から。直前に描いたセリフのあとに新しい事実が届いていなければ差し戻す。 */
  readonly judgeSpeak: () => SpeechVerdict
  /** `report` の handler から。 */
  readonly judgeReport: (report: ReportDraft, changedFiles?: readonly string[]) => ReportVerdict
  /** `report` の handler から、`judgeReport` に渡す前に待つ。ターンの頭の HEAD から変わったファイル（読めなければ空）。 */
  readonly changedFiles: () => Promise<readonly string[]>
  /** `speak`・`report` の handler から、本文の文字列を渡す。範囲があるあいだ、範囲の外の段の番号を言っていれば差し戻す。 */
  readonly judgePhaseMention: (texts: readonly string[]) => PhaseMentionVerdict
  /** `work_plan` の handler から、届いた引数のままで呼ぶ。 */
  readonly judgeWorkPlan: (input: unknown) => WorkPlanVerdict
  /** `phase_result` の handler から、届いた引数のままで呼ぶ（`WorkPlanReview.judgeResult`）。 */
  readonly judgePhaseResult: (input: unknown) => PhaseResultVerdict
  /**
   * 届いたイベントを、差し戻しを済ませた並びに変える（メインのイベントだけを渡す）。
   * 呼び出しは同じ `toolUseId` の `tool-finished` まで預かり、差し戻されなかったものだけを出す。
   */
  readonly pass: (event: SessionEvent) => readonly SessionEvent[]
  /** 返却が届いてからメインの `work_plan` が受け付けられるまでのあいだ真（関門の印）。 */
  readonly gateRaised: () => boolean
  /** 関門の拒否文に足す帯の位置の文。段取りが無ければ空。 */
  readonly bandPosition: () => string
  /** 返却を運ぶメインの入力に添える注記を取り出す（`WorkPlanReview.takeHandbackNote`）。 */
  readonly takeHandbackNote: () => string
  /** このターンで「新しい事実が無い」`report` の差し戻しをしたか。 */
  readonly nothingNewRejected: () => boolean
}

type NewsSubject = "speak" | "report"

const NEWS_SUBJECTS: readonly NewsSubject[] = ["speak", "report"]

/**
 * メインのツールの完了とバックグラウンドタスクの終わりのほかに、イベントの種類ごとに新しい事実として数える主題。
 * `session-info` は `speak` だけ、`aside` は `report` だけが数える。
 */
const NEWS_SUBJECTS_BY_EVENT = {
  request: ["speak", "report"],
  "turn-started": ["speak", "report"],
  "session-info": ["speak"],
  aside: ["report"],
} as const satisfies Partial<Record<SessionEvent["kind"], readonly NewsSubject[]>>

/** {@link CallReview} を1つ作る。セッション1つに1つ。 */
export function createCallReview(changes?: ReportChanges): CallReview {
  const ledger = createNewsLedger()
  const speechReview = createSpeechReview({
    hasNews: () => ledger.hasNews("speak"),
    markDrawn: () => ledger.markDrawn("speak"),
  })
  const workPlanReview = createWorkPlanReview()
  const reportReview = createReportReview(
    workPlanReview.standing,
    {
      hasNews: () => ledger.hasNews("report"),
      markDrawn: () => ledger.markDrawn("report"),
      backgroundTasks: ledger.backgroundTasks,
    },
    changes,
  )

  return {
    judgeSpeak: speechReview.judge,
    judgeReport: reportReview.judge,
    changedFiles: reportReview.changedFiles,
    judgePhaseMention: (texts) => judgePhaseMention(workPlanReview.delegatedRange(), texts),
    judgeWorkPlan: workPlanReview.judge,
    judgePhaseResult: workPlanReview.judgeResult,
    pass: (event) => {
      ledger.observe(event)
      return speechReview.pass(event).flatMap(reportReview.pass).flatMap(workPlanReview.pass)
    },
    gateRaised: workPlanReview.gateRaised,
    bandPosition: workPlanReview.bandPosition,
    takeHandbackNote: workPlanReview.takeHandbackNote,
    nothingNewRejected: reportReview.nothingNewRejected,
  }
}

/**
 * SDK のメッセージ1件から変換したイベントのうち、差し戻しに通すものを通す。
 * メインのメッセージのイベントはすべて、委譲先のメッセージのイベントは返却（`delegate-returned`）と `phase-result-called` だけを通す。
 * どちらも委譲先のツールの呼び出しから作るので、委譲先のメッセージにしか載らない。
 */
export function passRelayedEvents(
  review: Pick<CallReview, "pass">,
  events: readonly SessionEvent[],
  fromMain: boolean,
): readonly SessionEvent[] {
  return events.flatMap((event) =>
    fromMain || event.kind === "delegate-returned" || event.kind === "phase-result-called"
      ? review.pass(event)
      : [event],
  )
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
