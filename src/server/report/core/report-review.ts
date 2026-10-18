// `report` の差し戻し（「検査 → 整形 → 描画」の検査の段）。
// 規約違反のある `report` を画面に出さずに差し戻し、直した呼び直しを描く。
// 1ターンに差し戻すのは1回まで（2回目からは違反があっても通す。無限に往復させない）。
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

import { isDeepEqual } from "remeda"

import type { ReportArgumentChars } from "../../../shared/report/report-argument-chars.ts"
import type { ReportTask } from "../../../shared/report/report-task.ts"
import type { BackgroundTask } from "../../../shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { WorkPlanStanding } from "../../../shared/session/work-plan.ts"
import { reportRejectionText } from "./report-rejection.ts"
import { reportViolations } from "./report-violation-check.ts"
import type { ReportDraft, ReportViolation } from "./report-violation.ts"

// 判定の順と脇の話の扱いは `ReportReview.judge` が正典。
export const REPORT_PROCEDURE_REJECTIONS = [
  "resend",
  "nothing-new",
  "unanswered-work-plan",
  "missing-work-plan-closing",
  "unfinished-phases",
  "finished-but-stopped",
  "finished-with-ng",
  "background-running",
] as const satisfies readonly string[]

/**
 * handler が差し戻していないのに `isError` で返った呼び出し（形の検査で落ちて handler に届かなかったもの）の理由の名前。
 * 差し戻しの記録（`report-rejected`）は handler ではなく `pass` が、この呼び出しの引数の字数つきで作る。
 */
export const REPORT_TOOL_ERROR_REASON = "tool-error"

export type ReportRejectionReason =
  | (typeof REPORT_PROCEDURE_REJECTIONS)[number]
  | ReportViolation["kind"]

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
   * 記録に残す種類の名前は {@link REPORT_PROCEDURE_REJECTIONS}（段の閉じ方は3つの名前が1つの枠を共有する）。
   */
  readonly judge: (report: ReportDraft) => ReportVerdict
  /** このターンで「新しい事実が無い」差し戻しをしたか。ターンの頭（`session-info`）で戻る。 */
  readonly nothingNewRejected: () => boolean
  /**
   * 届いたイベントを流してよい並びに変える（メインのイベントだけを渡す）。
   * `report` は同じ `toolUseId` の `tool-finished` まで預かり、`isError` でなければその直前に出す。
   * 預かったままターンが終わった `report`（結果の届かなかった呼び出し）は、`turn-finished` の直前に出す（判定の出なかった呼び出しは描く）。
   * `isError` で返った呼び出し（引数が読めなかったものを含む）は、`tool-finished` の直後に `report-rejected`（理由の名前と引数の字数）を出す。
   * 描いた `report` の締めのセリフ（`closing`）は、そのすぐ後ろに `speech` として出す（差し戻した呼び出しの締めは出さない）。
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
 */
export function createReportReview(
  workPlanStanding: () => WorkPlanStanding,
  news: ReportNews,
): ReportReview {
  let rejectedInTurn = false
  let resendRejectedInTurn = false
  let nothingNewRejectedInTurn = false
  let unansweredPlanRejectedInTurn = false
  let closingRejectedInTurn = false
  let finishedWithNgRejectedInTurn = false
  let backgroundRejectedInTurn = false
  let held: readonly ReportEvent[] = []
  // 引数が読めず（`conclusion` が文字列でない）レポートにならなかった呼び出し。結果が届いたら差し戻しの記録にだけ使う。
  let malformed: readonly Extract<SessionEvent, { readonly kind: "report-malformed" }>[] = []
  // handler が直前に差し戻した理由。同じ呼び出しの `tool-finished` で使い切る。
  let handlerReasons: readonly string[] | undefined
  // このターンで出した（描いた）`report`。送り直しの判定にだけ使う。
  let drawn: readonly ReportEvent[] = []
  // 脇の話（`aside`）で始まったターンか。ターンの頭の `session-info` は脇の話のターンの頭にも届くので、そこでは戻さない。
  let asideTurn = false

  /** `isError` で返った呼び出しの記録。handler の差し戻しなら理由の名前、handler に届かなかった呼び出しは `tool-error`。 */
  const rejectionOf = (argumentChars: ReportArgumentChars): SessionEvent => {
    const reasons = handlerReasons ?? [REPORT_TOOL_ERROR_REASON]
    handlerReasons = undefined
    return { kind: "report-rejected", reasons, argumentChars }
  }

  const startTurn = (): void => {
    rejectedInTurn = false
    resendRejectedInTurn = false
    nothingNewRejectedInTurn = false
    unansweredPlanRejectedInTurn = false
    closingRejectedInTurn = false
    finishedWithNgRejectedInTurn = false
    backgroundRejectedInTurn = false
    drawn = []
  }

  const review: ReportReview = {
    judge: (report) => {
      if (!resendRejectedInTurn && drawn.some((previous) => isSameReport(previous, report))) {
        resendRejectedInTurn = true
        return { kind: "rejected", text: REPORT_RESEND_REJECTION_TEXT, reasons: ["resend"] }
      }
      if (!news.hasNews() && !nothingNewRejectedInTurn) {
        nothingNewRejectedInTurn = true
        return {
          kind: "rejected",
          text: REPORT_NOTHING_NEW_REJECTION_TEXT,
          reasons: ["nothing-new"],
        }
      }
      const standing = workPlanStanding()
      if (standing.kind === "rejected" && !unansweredPlanRejectedInTurn) {
        unansweredPlanRejectedInTurn = true
        return {
          kind: "rejected",
          text: REPORT_UNANSWERED_WORK_PLAN_REJECTION_TEXT,
          reasons: ["unanswered-work-plan"],
        }
      }
      const closingVerdict: ReportVerdict =
        standing.kind === "planned" && !asideTurn
          ? judgeWorkPlanClosing(report, standing.remaining)
          : { kind: "accepted" }
      if (closingVerdict.kind === "rejected" && !closingRejectedInTurn) {
        closingRejectedInTurn = true
        return closingVerdict
      }
      if (!finishedWithNgRejectedInTurn && isFinished(report.task) && hasNgCheck(report)) {
        finishedWithNgRejectedInTurn = true
        return {
          kind: "rejected",
          text: REPORT_FINISHED_WITH_NG_REJECTION_TEXT,
          reasons: ["finished-with-ng"],
        }
      }
      const shells = news.backgroundTasks().filter((task) => task.kind === "shell")
      if (shells.length > 0 && !asideTurn && !backgroundRejectedInTurn) {
        backgroundRejectedInTurn = true
        return {
          kind: "rejected",
          text: reportBackgroundRunningRejectionText(shells),
          reasons: ["background-running"],
        }
      }
      const violations = reportViolations(report)
      if (violations.length === 0 || rejectedInTurn) {
        return { kind: "accepted" }
      }
      rejectedInTurn = true
      return {
        kind: "rejected",
        text: reportRejectionText(violations),
        reasons: [...new Set(violations.map((violation) => violation.kind))],
      }
    },
    nothingNewRejected: () => nothingNewRejectedInTurn,
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
            return [event, rejectionOf(failed.argumentChars)]
          }
          const report = held.find((candidate) => candidate.toolUseId === event.toolUseId)
          if (report === undefined) {
            return [event]
          }
          held = held.filter((candidate) => candidate !== report)
          if (event.isError) {
            return [event, rejectionOf(report.argumentChars)]
          }
          drawn = [...drawn, report]
          news.markDrawn()
          return [report, event, ...closingSpeech(report)]
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

  return {
    ...review,
    judge: (report) => {
      const verdict = review.judge(report)
      handlerReasons = verdict.kind === "rejected" ? verdict.reasons : undefined
      return verdict
    },
  }
}

/**
 * 送り直しを差し戻すときの `report` の戻り値。
 * 固定の文面だけで、モデルが書いた本文は写さず、画面の状態（描けたか・どこに出たか）も載せない。
 */
export const REPORT_RESEND_REJECTION_TEXT =
  "この `report` は、このターンですでに受け取った `report` と同じ引数になっている。" +
  "同じ引数で送り直さず、そのあとに `report` の外に書いた本文の中身を `report` に入れて呼び直すこと。"

/** 新しい事実の無い `report` を差し戻すときの戻り値。固定の文面だけで、モデルが書いた本文も画面の状態も写さない。 */
export const REPORT_NOTHING_NEW_REJECTION_TEXT =
  "直前の `report` のあと、新しい依頼もツールの結果もバックグラウンドタスクの終わりも届いていないので、" +
  "この `report` は画面に出していない。伝える新しい事実が無いターンは、`report` を" +
  "呼ばず、何も書かずに終えてよい。言い回しを変えて同じ中身の `report` を送り直さないこと。" +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/** 同じターンで差し戻した `work_plan` にまだ応えていない `report` を差し戻すときの戻り値。固定の文面だけ。 */
export const REPORT_UNANSWERED_WORK_PLAN_REJECTION_TEXT =
  "このターンで差し戻された `work_plan` に、まだ応えていない。" +
  "差し戻しの直し方に従って `work_plan` を呼び直し、受け付けられてから `report` を呼ぶこと。" +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/** 同じ依頼にワークプランがあるのに `workPlanClosing` の無い `report` を差し戻すときの戻り値。固定の文面だけ。 */
export const REPORT_MISSING_WORK_PLAN_CLOSING_REJECTION_TEXT =
  "この依頼では `work_plan` でワークプランを渡しているので、`report` の workPlanClosing に段の閉じ方を入れる。" +
  "全部の段を終えたなら `finished`、途中で止めたなら `stopped` を入れて呼び直すこと。" +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/** `workPlanClosing` が `finished` なのに段が2つ以上残っている `report` を差し戻すときの戻り値。固定の文面だけ。 */
export const REPORT_UNFINISHED_PHASES_REJECTION_TEXT =
  "workPlanClosing が `finished` なのに、ワークプランに済んでいない段が2つ以上残っている。" +
  "`finished` で tsukumo が閉じるのは最後の段だけなので、同じ応答の中で `report` より先に `work_plan` で段を1つずつ進め、" +
  "最後の段に来てから `finished` で呼び直す。途中で止めたなら `stopped` にする。" +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/** `task.outcome` が `finished` なのに `workPlanClosing` が `stopped` で段の残った `report` を差し戻すときの戻り値。固定の文面だけ。 */
export const REPORT_FINISHED_BUT_STOPPED_REJECTION_TEXT =
  "`task.outcome` が `finished` なのに、workPlanClosing が `stopped` でワークプランに済んでいない段が残っている。" +
  "全部の段を終えたなら最後の段まで進めて `finished` にし、途中で止めたなら outcome を `stopped` か `awaiting-answer` にして呼び直すこと。" +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/** `task.outcome` が `finished` なのに `checks` に `ng` の行がある `report` を差し戻すときの戻り値。固定の文面だけで、モデルが書いた本文も `checks` の中身も写さない。 */
export const REPORT_FINISHED_WITH_NG_REJECTION_TEXT =
  "`task.outcome` が `finished` なのに、`checks` に `ng` の行がある。" +
  "落ちた確認を直して `ok` にしてから `finished` で呼び直すか、直せないなら outcome を `stopped` か `awaiting-answer` にして呼び直すこと。" +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/** 背景のシェルが残っている `report` を差し戻すときの戻り値。残りのシェルの ID と `description` だけを載せ、モデルが書いた本文は写さない。 */
function reportBackgroundRunningRejectionText(shells: readonly BackgroundTask[]): string {
  const listing = shells
    .map(
      (task) =>
        `\`${task.taskId}\`（${task.description === "" ? "背景のコマンド" : task.description}）`,
    )
    .join("、")
  return (
    `背景で動いているコマンドが残っている: ${listing}。` +
    "`TaskStop` で止めるか、待つなら待つと決めてから `report` を呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"
  )
}

function hasNgCheck(report: ReportDraft): boolean {
  return report.checks.some((check) => check.status === "ng")
}

/** 同じ依頼にワークプランがあるときの、段の閉じ方だけで見た判定。`remaining` は済んでいない段の数（全部済みなら 0）。 */
function judgeWorkPlanClosing(report: ReportDraft, remaining: number): ReportVerdict {
  if (report.workPlanClosing === "none") {
    return {
      kind: "rejected",
      text: REPORT_MISSING_WORK_PLAN_CLOSING_REJECTION_TEXT,
      reasons: ["missing-work-plan-closing"],
    }
  }
  if (report.workPlanClosing === "finished" && remaining >= 2) {
    return {
      kind: "rejected",
      text: REPORT_UNFINISHED_PHASES_REJECTION_TEXT,
      reasons: ["unfinished-phases"],
    }
  }
  if (report.workPlanClosing === "stopped" && remaining > 0 && isFinished(report.task)) {
    return {
      kind: "rejected",
      text: REPORT_FINISHED_BUT_STOPPED_REJECTION_TEXT,
      reasons: ["finished-but-stopped"],
    }
  }
  return { kind: "accepted" }
}

function isFinished(task: ReportTask): boolean {
  return task.kind === "task" && task.outcome === "finished"
}

/** 描いた `report` の締めのセリフ。`closing` を持たなかったころの呼び出しには無い。 */
function closingSpeech(report: ReportEvent): readonly SessionEvent[] {
  return report.closing.kind === "speech" ? [report.closing] : []
}

/** 描いたレポートと同じ引数か。文字列の2つの欄は前後の空白を除いて、`figure` と `sections` と `checks` は中身で比べる。 */
function isSameReport(drawn: ReportEvent, draft: ReportDraft): boolean {
  return (
    drawn.conclusion.trim() === draft.conclusion.trim() &&
    isDeepEqual(drawn.figure, draft.figure) &&
    isDeepEqual(drawn.sections, draft.sections) &&
    drawn.favor.trim() === draft.favor.trim() &&
    isDeepEqual(drawn.checks, draft.checks)
  )
}
