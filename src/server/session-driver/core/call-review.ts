// メインの `speak`・`report`・`work_plan` の呼び出しの差し戻し（用語集「呼び出しの差し戻し」）。
// 3つの review（`SpeechReview`・`ReportReview`・`WorkPlanReview`）を順番どおりにつなぎ、呼び手には平らな口を1枚だけ見せる。
//
// `pass` は、頭で `report` の欄の引き継ぎ（`ReportInheritance`）を通してから、speak → report → work_plan の順に通す。
// ターンの終わりの預かりがセリフ → レポートの並びになり、`work_plan` の差し戻しは `report` のイベントを見るので `report` の後ろに置く。
// 通すのはメインのイベントだけ（サブエージェントのイベントの見分けは呼び手がする）。
//
// 「新しい事実」の帳面はここに1つだけあり、`speak` と `report` はそれを読む。
// 何を新しい事実に数えるかの差は `NEWS_SUBJECTS_BY_EVENT` で宣言する。

import type { BackgroundTask } from "../../../shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type {
  A2uiStructureFault,
  A2uiStructureVerdict,
} from "../../report/core/a2ui-structure-fault.ts"
import { REPORT_REJECTION_MODES } from "../../report/core/rejection-mode.ts"
import { createReportInheritance } from "../../report/core/report-inheritance.ts"
import { createReportReview, type ReportVerdict } from "../../report/core/report-review.ts"
import type { ReportDraft } from "../../report/core/report-violation.ts"
import { judgePhaseMention, type PhaseMentionVerdict } from "../../work-plan/core/phase-mention.ts"
import {
  createWorkPlanReview,
  type PhaseResultVerdict,
  type WorkPlanVerdict,
} from "../../work-plan/core/work-plan-review.ts"
import { createSpeechReview, type SpeechVerdict } from "./speech-review.ts"

export type CallReview = {
  /** `speak` の handler から。直前に描いたセリフのあとに新しい事実が届いていなければ差し戻す。 */
  readonly judgeSpeak: () => SpeechVerdict
  /** `report` の handler から。{@link CallReview.fillReport} で組んだ値で呼ぶ。 */
  readonly judgeReport: (report: ReportDraft) => ReportVerdict
  /** `report` の `a2ui` の版の handler から、構造の規約の違反があるときだけ `judgeReport` より先に呼ぶ（`ReportReview.judgeStructure`）。 */
  readonly judgeReportStructure: (faults: readonly A2uiStructureFault[]) => A2uiStructureVerdict
  /**
   * `report` の handler から、届いた引数を `report` のイベントの形にしたもので呼ぶ。
   * `pass` が描く値を組むのと同じ土台で埋める（`ReportInheritance.fill`）。
   * 土台は `pass` に流れたイベントだけで動くので、直前の呼び出しの結果がここより先に `pass` を通っていることを当てにしている。
   */
  readonly fillReport: (report: ReportCalled) => ReportCalled
  /** `speak` の handler から、`phase` を渡したときだけ呼ぶ。範囲があるあいだ、範囲の外の段の番号なら差し戻す。 */
  readonly judgePhaseMention: (phase: number) => PhaseMentionVerdict
  /** `work_plan` の handler から、届いた引数のままで呼ぶ。 */
  readonly judgeWorkPlan: (input: unknown) => WorkPlanVerdict
  /** `phase_result` の handler から、届いた引数のままで呼ぶ（`WorkPlanReview.judgeResult`）。 */
  readonly judgePhaseResult: (input: unknown) => PhaseResultVerdict
  /**
   * 届いたイベントを、差し戻しを済ませた並びに変える（メインのイベントだけを渡す）。
   * 呼び出しは同じ `toolUseId` の `tool-finished` まで預かり、差し戻されなかったものだけを出す。
   */
  readonly pass: (event: SessionEvent) => readonly SessionEvent[]
  /** 返却が届いてからメインの `work_plan` が受け付けられるまでのあいだ真（委譲ゲートの印）。 */
  readonly gateRaised: () => boolean
  /** その依頼で受け付け済みの `work_plan` が無いあいだ真（`WorkPlanReview.planMissing`）。 */
  readonly planMissing: () => boolean
  /** 委譲ゲートの拒否文に足す帯の位置の文。ワークプランが無ければ空。 */
  readonly bandPosition: () => string
  /** 返却を運ぶメインの入力に添える注記を取り出す（`WorkPlanReview.takeHandbackNote`）。 */
  readonly takeHandbackNote: () => string
  /** 返却を溜めていて、注記をまだ取り出していないか（`WorkPlanReview.handbackNotePending`）。 */
  readonly handbackNotePending: () => boolean
  /** このターンで「新しい事実が無い」`report` の差し戻しをしたか。 */
  readonly nothingNewRejected: () => boolean
  /** バックグラウンドタスクが種類を問わず1件でも動いているか。 */
  readonly backgroundRunning: () => boolean
}

type ReportCalled = Extract<SessionEvent, { readonly kind: "report" }>

type NewsSubject = "speak" | "report"

const NEWS_SUBJECTS: readonly NewsSubject[] = ["speak", "report"]

/**
 * メインのツールの完了とバックグラウンドタスクの終わりのほかに、イベントの種類ごとに新しい事実として数える主題。
 * `session-info` と `progress-nudged` は `speak` だけ、`aside` は `report` だけが数える。
 */
const NEWS_SUBJECTS_BY_EVENT = {
  request: ["speak", "report"],
  "turn-started": ["speak", "report"],
  "session-info": ["speak"],
  "progress-nudged": ["speak"],
  aside: ["report"],
} as const satisfies Partial<Record<SessionEvent["kind"], readonly NewsSubject[]>>

/** {@link CallReview} を1つ作る。セッション1つに1つ。 */
export function createCallReview(): CallReview {
  const ledger = createNewsLedger()
  const reportInheritance = createReportInheritance()
  const speechReview = createSpeechReview({
    hasNews: () => ledger.hasNews("speak"),
    position: () => ledger.position("speak"),
    markDrawn: (position) => ledger.markDrawn("speak", position),
  })
  const workPlanReview = createWorkPlanReview()
  const reportReview = createReportReview(
    workPlanReview.standing,
    {
      hasNews: () => ledger.hasNews("report"),
      markDrawn: () => ledger.markDrawn("report", ledger.position("report")),
      backgroundTasks: ledger.backgroundTasks,
    },
    REPORT_REJECTION_MODES,
  )

  return {
    judgeSpeak: speechReview.judge,
    judgeReport: reportReview.judge,
    judgeReportStructure: reportReview.judgeStructure,
    fillReport: reportInheritance.fill,
    judgePhaseMention: (phase) => judgePhaseMention(workPlanReview.delegatedRange(), phase),
    judgeWorkPlan: workPlanReview.judge,
    judgePhaseResult: workPlanReview.judgeResult,
    pass: (event) => {
      const filled = reportInheritance.pass(event)
      ledger.observe(filled)
      return speechReview.pass(filled).flatMap(reportReview.pass).flatMap(workPlanReview.pass)
    },
    gateRaised: workPlanReview.gateRaised,
    planMissing: workPlanReview.planMissing,
    bandPosition: workPlanReview.bandPosition,
    takeHandbackNote: workPlanReview.takeHandbackNote,
    handbackNotePending: workPlanReview.handbackNotePending,
    nothingNewRejected: reportReview.nothingNewRejected,
    backgroundRunning: () => ledger.backgroundTasks().length > 0,
  }
}

/**
 * SDK のメッセージ1件から変換したイベントのうち、差し戻しに通すものを通す。
 * メインのメッセージのイベントはすべて、委譲先のメッセージのイベントは `delegate-handed-back` と `phase-result-called` だけを通す。
 * どちらも委譲先のツールの呼び出しから作るので、委譲先のメッセージにしか載らない。
 */
export function passRelayedEvents(
  review: Pick<CallReview, "pass">,
  events: readonly SessionEvent[],
  fromMain: boolean,
): readonly SessionEvent[] {
  return events.flatMap((event) =>
    fromMain || event.kind === "delegate-handed-back" || event.kind === "phase-result-called"
      ? review.pass(event)
      : [event],
  )
}

type NewsLedger = {
  readonly observe: (event: SessionEvent) => void
  readonly hasNews: (subject: NewsSubject) => boolean
  readonly position: (subject: NewsSubject) => number
  readonly markDrawn: (subject: NewsSubject, position: number) => void
  readonly backgroundTasks: () => readonly BackgroundTask[]
}

function createNewsLedger(): NewsLedger {
  // 主題ごとに、届いた新しい事実の数と、描いて使い切った位置。届いた数が使い切った位置より大きければ新しい事実がある（セッションの頭は 1 件届いたものとする）。
  let raised: Readonly<Record<NewsSubject, number>> = { speak: 1, report: 1 }
  let drawn: Readonly<Record<NewsSubject, number>> = { speak: 0, report: 0 }
  // メインが呼んで結果をまだ受け取っていないツールの id（`speak` / `report` / `work_plan` は入らない）。
  let runningTools: ReadonlySet<string> = new Set()
  let backgroundTasks: readonly BackgroundTask[] = []

  const raise = (subjects: readonly NewsSubject[]): void => {
    raised = {
      speak: raised.speak + (subjects.includes("speak") ? 1 : 0),
      report: raised.report + (subjects.includes("report") ? 1 : 0),
    }
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
        case "progress-nudged":
        case "aside":
          raise(NEWS_SUBJECTS_BY_EVENT[event.kind])
          return
        default:
          return
      }
    },
    hasNews: (subject) => raised[subject] > drawn[subject],
    position: (subject) => raised[subject],
    markDrawn: (subject, position) => {
      drawn = { ...drawn, [subject]: Math.max(drawn[subject], position) }
    },
    backgroundTasks: () => backgroundTasks,
  }
}
