// `report` の差し戻し（「検査 → 整形 → 描画」の検査の段）。
// 規約違反のある `report` を画面に出さずに差し戻し、直した呼び直しを描く。
// 1ターンに差し戻すのは1回まで（2回目からは違反があっても通す。無限に往復させない）。
// 条ごとの段（`REPORT_REJECTION_MODES`）が `count` の条は差し戻さず、通した呼び出しの記録（`report-counted`）に名前を残すだけ。
//
// 同じターンで画面に出した `report` と同じ引数の呼び出しも差し戻す（送り直し）。
// `Stop` の関所（`ReportGate`）に止められたモデルが、止められた本文を入れずに前の `report` を送り直して関所を抜ける形を塞ぐ。
// 関所は2回目の止まりを止めないので、送り直しを通すと止めた本文が画面に出ないまま終わる（`docs/research/report-tool-trial.md`「残った穴の形」）。
// 比べるのは `conclusion` / `favor` の前後の空白を除いたものと、`figure` と `sections` と `checks` の中身。
// 覚えるのは `ReportReview.pass` が出した（描いた）`report` だけなので、サブエージェントの `report`（変換で捨てる）とは比べない。
//
// 「新しい事実」は文面ではなく、直前に描いた `report` のあとに届いたもので決める:
// 利用者の依頼（`request` / `turn-started`）と脇の話（`aside`）、メインが呼んだ `speak` / `report` 以外のツールの結果、バックグラウンドタスクの終わり（顔ぶれから消えた）。
// バックグラウンドタスクの終わりはターンの外で届くので、これだけはターンの区切りで戻さない。
// サブエージェントの `SendMessage` の合図は流れに見えないので数えない。
//
// 差し戻しの枠の一覧と見る順、脇の話のターン（`aside` から次の依頼・続きのターン・ターンの終わりまで）で見る枠は `ReportReview.judge` が正典。
// 枠は規約違反の枠とは別に数える（規約違反で差し戻して直した `report` を送り直す形もある）。
// ワークプランの立ち位置は `WorkPlanReview.standing` から受け取る。段の閉じ方は同じ依頼にワークプランがあるときだけ見る。
// 背景のシェルの差し戻しの文面には ID と `description` を載せるが、記録に残すのは種類の名前だけ。
//
// 判定の窓口は `report` の handler だけ（`ReportReview.judge`）。
// `assistant` メッセージの変換は `report` イベントを作るだけで判定しない。
// `ReportReview.pass` がそのイベントを同じ呼び出しの `tool-finished` まで預かり、handler が返した `isError`（差し戻したら true）に従って描くか捨てるかを決める。
// handler と変換の両方で判定すると回数の数え方が食い違いうる。
// SDK は handler の呼び出し（制御リクエスト）と `assistant` メッセージの届く順を決めないので、結果（`tool_result`）が必ず handler より後に届くことだけを当てにしている。
//
// handler はサブエージェントの呼び出しとメインの呼び出しを見分けられないので、サブエージェントの `report` も差し戻しの判定に数える。
// MCP の handler に `parent_tool_use_id` は届かず、届くのはその呼び出し自身の `_meta["claudecode/toolUseId"]` と `requestId` だけ（`toolUseId` を `assistant` メッセージの `tool_use` と突き合わせるには、上の届く順の保証が要る）。
// 違反の差し戻し・送り直し・新しい事実の判定のどれでも、サブエージェントの呼び出しがそのターンの1回を使いうる。
// サブエージェントの `report` はどのみち描かないので、失うのはメインの差し戻しの機会だけ。

import type {
  ReportArgumentChars,
  ReportArgumentField,
} from "../../../shared/report/report-argument-size.ts"
import type { ToolErrorField } from "../../../shared/report/tool-error-field.ts"
import type { BackgroundTask } from "../../../shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { WorkPlanStanding } from "../../../shared/session/work-plan.ts"
import {
  type A2uiStructureFault,
  a2uiStructureFaultField,
  type A2uiStructureVerdict,
} from "./a2ui-structure-fault.ts"
import {
  REPORT_FINISHED_WITH_NG_REJECTION_TEXT,
  REPORT_NOTHING_NEW_REJECTION_TEXT,
  REPORT_RESEND_REJECTION_TEXT,
  REPORT_UNANSWERED_WORK_PLAN_REJECTION_TEXT,
  reportBackgroundRunningRejectionText,
} from "./procedure-rejection.ts"
import type { ReportRejectionModes, ReportRejectionReason } from "./rejection-mode.ts"
import { a2uiValidationFailedText, reportRejectionText } from "./report-rejection.ts"
import { reportViolations } from "./report-violation-check.ts"
import type { ReportDraft } from "./report-violation.ts"
import { isSameReport } from "./same-report.ts"
import { toolErrorFieldsOf } from "./tool-error-field.ts"
import type { TurnRejection } from "./turn-rejection.ts"
import { type ClosingFit, isFinished, judgeWorkPlanClosing } from "./work-plan-closing-fit.ts"

/**
 * 判定が差し戻していないのに `isError` で返った呼び出し（形の検査で落ちて handler に届かなかったものと、handler で組んだ値が形の検査に落ちたもの）の理由の名前。
 * 差し戻しの記録（`report-rejected`）は handler ではなく `pass` が、この呼び出しの引数の字数つきで作る。
 */
const REPORT_TOOL_ERROR_REASON = "tool-error"

/** `a2ui` の版の部品の一覧が構造の規約に外れて差し戻した呼び出しの、記録の理由の名前。 */
export const A2UI_STRUCTURE_REJECTION_REASONS = [
  REPORT_TOOL_ERROR_REASON,
  "a2ui-structure",
] as const

/**
 * handler の判定。`rejected` の `text` はそのまま `report` の戻り値になる。
 * `reasons` は記録に残す種類の名前で、文面もモデルが書いた本文も入らない。
 */
export type ReportVerdict =
  | { readonly kind: "accepted" }
  | {
      readonly kind: "rejected"
      readonly text: string
      readonly reasons: readonly ReportRejectionReason[]
    }

export type ReportReview = {
  /**
   * `report` の handler から。
   * このターンで描いた `report` の送り直し、直前に描いた `report` のあとに新しい事実の届いていない呼び出し、
   * 応えていない `work_plan` の差し戻し、合わない段の閉じ方、`ng` のある `finished`、背景のシェル、規約違反のどれかなら、
   * この順に見て差し戻す（枠はそれぞれ1ターンに1回。使い切っていれば通す）。
   * 脇の話のターンでは、合わない段の閉じ方・背景のシェルを見ない（ほかは見る）。
   * 記録に残す種類の名前は `REPORT_PROCEDURE_REJECTIONS`（段の閉じ方は3つの名前が1つの枠を共有する）。
   * 段が `count` の条は、枠の残りに関わらず当てはまれば預け、枠を使わずに次の条へ進む（差し戻した呼び出しの預かりは捨てる）。
   */
  readonly judge: (report: ReportDraft) => ReportVerdict
  /** `a2ui` の版の handler から、構造の規約の違反があるときだけ `judge` より先に呼ぶ。枠は1ターンに1回。 */
  readonly judgeStructure: (faults: readonly A2uiStructureFault[]) => A2uiStructureVerdict
  /** このターンで「新しい事実が無い」差し戻しをしたか。ターンの頭（`session-info`）で戻る。 */
  readonly nothingNewRejected: () => boolean
  /**
   * 届いたイベントを流してよい並びに変える（メインのイベントだけを渡す）。
   * `report` は同じ `toolUseId` の `tool-finished` まで預かり、`isError` でなければその直前に出す。
   * 預かったままターンが終わった `report`（結果の届かなかった呼び出し）は、`turn-finished` の直前に出す（判定の出なかった呼び出しは描く）。
   * `isError` で返った呼び出し（引数が読めなかったものを含む）は、`tool-finished` の直後に `report-rejected`（理由の名前と引数の字数と引き継いだ欄の名前）を出す。
   * 描いた `report` の締めのセリフ（`closing`）は、そのすぐ後ろに `speech` として出す（差し戻した呼び出しの締めは出さない）。
   * 描いた呼び出しが段 `count` の条に当てはまっていたら、最後に `report-counted`（条の名前と引数の字数と引き継いだ欄の名前）を出す。
   */
  readonly pass: (event: SessionEvent) => readonly SessionEvent[]
}

/** 新しい事実の帳面（`CallReview` が1つだけ持つ）のうち、`report` が読む口。 */
export type ReportNews = {
  readonly hasNews: () => boolean
  readonly markDrawn: () => void
  readonly backgroundTasks: () => readonly BackgroundTask[]
}

type ReportEvent = Extract<SessionEvent, { readonly kind: "report" }>

/**
 * {@link ReportReview} を1つ作る。セッション1つに1つ（ターンの区切りを `pass` で見ている）。
 * ターンの頭は `session-info`（SDK のターンの頭に毎回届く）と `turn-finished`。
 * `workPlanStanding` は判定のたびに呼び、いまのワークプランの立ち位置を読む。
 * `modes` は条ごとの段（本番は `REPORT_REJECTION_MODES`）。
 */
export function createReportReview(
  workPlanStanding: () => WorkPlanStanding,
  news: ReportNews,
  modes: ReportRejectionModes,
): ReportReview {
  let rejectedInTurn: ReadonlySet<TurnRejection> = new Set()
  let held: readonly ReportEvent[] = []
  // 引数が読めず（`conclusion` の形が不正）レポートにならなかった呼び出し。結果が届いたら差し戻しの記録にだけ使う。
  let malformed: readonly Extract<SessionEvent, { readonly kind: "report-malformed" }>[] = []
  // handler が直前に差し戻した理由。同じ呼び出しの `tool-finished` で使い切る。
  let handlerReasons: readonly string[] | undefined
  // handler が直前に差し戻した呼び出しの、記録に残す落ちた欄。`handlerReasons` と一緒に使い切る。
  let handlerToolErrorFields: readonly ToolErrorField[] = []
  // handler が直前に通した呼び出しが当てはまった、段 `count` の条。同じ呼び出しの `tool-finished` で使い切る。
  let handlerCounted: readonly ReportRejectionReason[] = []
  // このターンで出した（描いた）`report`。送り直しの判定にだけ使う。
  let drawn: readonly ReportEvent[] = []
  // 脇の話（`aside`）で始まったターンか。ターンの頭の `session-info` は脇の話のターンの頭にも届くので、そこでは戻さない。
  let asideTurn = false

  /** `isError` で返った呼び出しの記録。判定の差し戻しなら理由の名前、判定まで届かなかった呼び出しは `tool-error`。 */
  const rejectionOf = (
    argumentChars: ReportArgumentChars,
    inheritedFields: readonly ReportArgumentField[],
    resultContent: string,
  ): SessionEvent => {
    const toolErrorFields =
      handlerReasons === undefined ? toolErrorFieldsOf(resultContent) : handlerToolErrorFields
    const reasons = handlerReasons ?? [REPORT_TOOL_ERROR_REASON]
    handlerReasons = undefined
    handlerToolErrorFields = []
    return { kind: "report-rejected", reasons, argumentChars, inheritedFields, toolErrorFields }
  }

  const startTurn = (): void => {
    rejectedInTurn = new Set()
    drawn = []
  }

  const markRejected = (rejection: TurnRejection): void => {
    rejectedInTurn = new Set([...rejectedInTurn, rejection])
  }

  /** 判定と、通したときに記録へ残す段 `count` の条。 */
  const decide = (
    report: ReportDraft,
  ): { readonly verdict: ReportVerdict; readonly counted: readonly ReportRejectionReason[] } => {
    let counted: readonly ReportRejectionReason[] = []
    const accepted: ReportVerdict = { kind: "accepted" }
    // 当てはまった条を段で振り分ける。差し戻すなら枠を使って差し戻し、数えるだけなら預けて通す。
    const settle = (
      rejection: TurnRejection,
      reason: ReportRejectionReason,
      text: string,
    ): ReportVerdict => {
      if (modes[reason] === "count") {
        counted = [...counted, reason]
        return accepted
      }
      if (rejectedInTurn.has(rejection)) {
        return accepted
      }
      markRejected(rejection)
      return { kind: "rejected", text, reasons: [reason] }
    }
    const firstRejection = (): ReportVerdict => {
      const resend = drawn.some((previous) => isSameReport(previous, report))
        ? settle("resend", "resend", REPORT_RESEND_REJECTION_TEXT)
        : accepted
      if (resend.kind === "rejected") {
        return resend
      }
      const nothingNew = news.hasNews()
        ? accepted
        : settle("nothing-new", "nothing-new", REPORT_NOTHING_NEW_REJECTION_TEXT)
      if (nothingNew.kind === "rejected") {
        return nothingNew
      }
      const standing = workPlanStanding()
      const unanswered =
        standing.kind === "rejected"
          ? settle(
              "unanswered-work-plan",
              "unanswered-work-plan",
              REPORT_UNANSWERED_WORK_PLAN_REJECTION_TEXT,
            )
          : accepted
      if (unanswered.kind === "rejected") {
        return unanswered
      }
      const closing: ClosingFit =
        standing.kind === "planned" && !asideTurn
          ? judgeWorkPlanClosing(report, standing.remaining)
          : { kind: "fit" }
      const closingVerdict =
        closing.kind === "unfit" ? settle("closing", closing.reason, closing.text) : accepted
      if (closingVerdict.kind === "rejected") {
        return closingVerdict
      }
      const finishedWithNg =
        isFinished(report.task) && hasNgCheck(report)
          ? settle("finished-with-ng", "finished-with-ng", REPORT_FINISHED_WITH_NG_REJECTION_TEXT)
          : accepted
      if (finishedWithNg.kind === "rejected") {
        return finishedWithNg
      }
      const shells = news.backgroundTasks().filter((task) => task.kind === "shell")
      const backgroundRunning =
        shells.length > 0 && !asideTurn
          ? settle(
              "background-running",
              "background-running",
              reportBackgroundRunningRejectionText(shells),
            )
          : accepted
      if (backgroundRunning.kind === "rejected") {
        return backgroundRunning
      }
      const violations = reportViolations(report)
      const rejecting = violations.filter((violation) => modes[violation.kind] === "reject")
      counted = [
        ...counted,
        ...new Set(
          violations
            .filter((violation) => modes[violation.kind] === "count")
            .map((violation) => violation.kind),
        ),
      ]
      if (rejecting.length === 0 || rejectedInTurn.has("violation")) {
        return accepted
      }
      markRejected("violation")
      return {
        kind: "rejected",
        text: reportRejectionText(rejecting),
        reasons: [...new Set(rejecting.map((violation) => violation.kind))],
      }
    }
    const verdict = firstRejection()
    return { verdict, counted }
  }

  const review: ReportReview = {
    judge: (report) => {
      const { verdict, counted } = decide(report)
      handlerReasons = verdict.kind === "rejected" ? verdict.reasons : undefined
      handlerToolErrorFields = []
      handlerCounted = verdict.kind === "accepted" ? counted : []
      return verdict
    },
    judgeStructure: (faults) => {
      if (rejectedInTurn.has("a2ui-structure")) {
        return { kind: "accepted" }
      }
      markRejected("a2ui-structure")
      handlerReasons = A2UI_STRUCTURE_REJECTION_REASONS
      handlerToolErrorFields = faults.map(a2uiStructureFaultField)
      handlerCounted = []
      return { kind: "rejected", text: a2uiValidationFailedText(faults) }
    },
    nothingNewRejected: () => rejectedInTurn.has("nothing-new"),
    pass: (event) => {
      switch (event.kind) {
        case "report":
          held = [...held, event]
          return []
        case "report-malformed":
          malformed = [...malformed, event]
          return []
        case "tool-finished": {
          const failed = malformed.find((candidate) => candidate.toolUseId === event.toolUseId)
          if (failed !== undefined) {
            malformed = malformed.filter((candidate) => candidate !== failed)
            return [event, rejectionOf(failed.argumentChars, [], event.content)]
          }
          const report = held.find((candidate) => candidate.toolUseId === event.toolUseId)
          if (report === undefined) {
            return [event]
          }
          held = held.filter((candidate) => candidate !== report)
          const counted = handlerCounted
          handlerCounted = []
          if (event.isError) {
            return [event, rejectionOf(report.argumentChars, report.inheritedFields, event.content)]
          }
          drawn = [...drawn, report]
          news.markDrawn()
          return [report, event, ...closingSpeech(report), ...countedRecord(report, counted)]
        }
        case "request":
        case "turn-started":
          asideTurn = false
          return [event]
        case "aside":
          asideTurn = true
          return [event]
        case "turn-resumed":
          asideTurn = false
          return [event]
        case "session-info":
          startTurn()
          return [event]
        case "turn-finished": {
          const unsettled = held.flatMap((report) => [report, ...closingSpeech(report)])
          held = []
          malformed = []
          asideTurn = false
          startTurn()
          return [...unsettled, event]
        }
        default:
          return [event]
      }
    },
  }

  return review
}

function hasNgCheck(report: ReportDraft): boolean {
  return report.checks.some((check) => check.status === "ng")
}

/** 描いた `report` が段 `count` の条に当てはまっていたときの記録。当てはまらなければ何も出さない。 */
function countedRecord(
  report: ReportEvent,
  reasons: readonly ReportRejectionReason[],
): readonly SessionEvent[] {
  return reasons.length === 0
    ? []
    : [
        {
          kind: "report-counted",
          reasons,
          argumentChars: report.argumentChars,
          inheritedFields: report.inheritedFields,
        },
      ]
}

/** 描いた `report` の締めのセリフ。`closing` を持たなかったころの呼び出しには無い。 */
function closingSpeech(report: ReportEvent): readonly SessionEvent[] {
  return report.closing.kind === "speech" ? [report.closing] : []
}
