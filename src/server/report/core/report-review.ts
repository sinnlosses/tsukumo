// `report` の差し戻し（「検査 → 整形 → 描画」の検査の段）。
// 規約違反のある `report` を画面に出さずに差し戻し、直した呼び直しを描く。
// 1ターンに差し戻すのは1回まで（2回目からは違反があっても通す。無限に往復させない）。
//
// 同じターンで画面に出した `report` と同じ引数の呼び出しも差し戻す（送り直し）。
// `Stop` の関所（`ReportGate`）に止められたモデルが、止められた本文を入れずに前の `report` を送り直して関所を抜ける形を塞ぐ。
// 関所は2回目の止まりを止めないので、送り直しを通すと止めた本文が画面に出ないまま終わる（`docs/research/report-tool-trial.md`「残った穴の形」）。
// 枠は規約違反の1回とは別に1ターンに1回まで（規約違反で差し戻して直した `report` を送り直す形もある）。
// 比べるのは `conclusion` / `favor` の前後の空白を除いたものと、`sections` と `checks` の中身。
// 覚えるのは `ReportReview.pass` が出した（描いた）`report` だけなので、サブエージェントの `report`（変換で捨てる）とは比べない。
//
// 新しい事実の無い `report` も差し戻す（枠は別に1ターンに1回まで）。
// 「新しい事実」は文面ではなく、直前に描いた `report` のあとに届いたもので決める:
// 利用者の依頼（`request` / `turn-started`）、メインが呼んだ `speak` / `report` 以外のツールの結果、背景のタスクの終わり（顔ぶれから消えた）。
// 背景のタスクの終わりはターンの外で届くので、これだけはターンの区切りで戻さない。
// サブエージェントの `SendMessage` の合図は流れに見えないので数えない。
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

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { type ReportDraft, reportRejectionText, reportViolations } from "./report-violation.ts"

/** handler の判定。`rejected` の `text` はそのまま `report` の戻り値になる。 */
export type ReportVerdict =
  | { readonly kind: "accepted" }
  | { readonly kind: "rejected"; readonly text: string }

export type ReportReview = {
  /**
   * `report` の handler から。
   * このターンで描いた `report` の送り直し、直前に描いた `report` のあとに新しい事実の届いていない呼び出し、規約違反のどれかなら差し戻す（枠はそれぞれ1ターンに1回。使い切っていれば通す）。
   */
  readonly judge: (report: ReportDraft) => ReportVerdict
  /** このターンで「新しい事実が無い」差し戻しをしたか。ターンの頭（`session-info`）で戻る。 */
  readonly nothingNewRejected: () => boolean
  /**
   * 届いたイベントを流してよい並びに変える（メインのイベントだけを渡す）。
   * `report` は同じ `toolUseId` の `tool-finished` まで預かり、`isError` でなければその直前に出す。
   * 預かったままターンが終わった `report`（結果の届かなかった呼び出し）は、`turn-finished` の直前に出す（判定の出なかった呼び出しは描く）。
   * 描いた `report` の締めのセリフ（`closing`）は、そのすぐ後ろに `speech` として出す（差し戻した呼び出しの締めは出さない）。
   */
  readonly pass: (event: SessionEvent) => readonly SessionEvent[]
}

type ReportEvent = Extract<SessionEvent, { readonly kind: "report" }>

/**
 * {@link ReportReview} を1つ作る。セッション1つに1つ（ターンの区切りを `pass` で見ている）。
 * ターンの頭は `session-info`（SDK のターンの頭に毎回届く）と `turn-finished`。
 */
export function createReportReview(): ReportReview {
  let rejectedInTurn = false
  let resendRejectedInTurn = false
  let nothingNewRejectedInTurn = false
  let held: readonly ReportEvent[] = []
  // このターンで出した（描いた）`report`。送り直しの判定にだけ使う。
  let drawn: readonly ReportEvent[] = []
  // 直前に描いた `report` のあとに新しい事実が届いたか（セッションの頭は届いたものとする）。
  let hasNews = true
  // メインが呼んで結果をまだ受け取っていないツールの id（`speak` / `report` は入らない）。
  let runningTools: ReadonlySet<string> = new Set()
  let backgroundTaskIds: readonly string[] = []

  const startTurn = (): void => {
    rejectedInTurn = false
    resendRejectedInTurn = false
    nothingNewRejectedInTurn = false
    drawn = []
  }

  return {
    judge: (report) => {
      if (!resendRejectedInTurn && drawn.some((previous) => isSameReport(previous, report))) {
        resendRejectedInTurn = true
        return { kind: "rejected", text: REPORT_RESEND_REJECTION_TEXT }
      }
      if (!hasNews && !nothingNewRejectedInTurn) {
        nothingNewRejectedInTurn = true
        return { kind: "rejected", text: REPORT_NOTHING_NEW_REJECTION_TEXT }
      }
      const violations = reportViolations(report)
      if (violations.length === 0 || rejectedInTurn) {
        return { kind: "accepted" }
      }
      rejectedInTurn = true
      return { kind: "rejected", text: reportRejectionText(violations) }
    },
    nothingNewRejected: () => nothingNewRejectedInTurn,
    pass: (event) => {
      switch (event.kind) {
        case "report":
          held = [...held, event]
          return []
        case "tool-started":
          // サブエージェントのツールは数えない（委譲中の言い直しがまさに差し戻したいもの）。
          if (event.parentToolUseId === undefined) {
            runningTools = new Set([...runningTools, event.toolUseId])
          }
          return [event]
        case "tool-finished": {
          if (runningTools.has(event.toolUseId)) {
            runningTools = new Set([...runningTools].filter((id) => id !== event.toolUseId))
            hasNews = true
            return [event]
          }
          const report = held.find((candidate) => candidate.toolUseId === event.toolUseId)
          if (report === undefined) {
            return [event]
          }
          held = held.filter((candidate) => candidate !== report)
          if (event.isError) {
            return [event]
          }
          drawn = [...drawn, report]
          hasNews = false
          return [report, event, ...closingSpeech(report)]
        }
        case "request":
        case "turn-started":
          hasNews = true
          return [event]
        case "background-tasks-changed": {
          const current = event.tasks.map((task) => task.taskId)
          if (backgroundTaskIds.some((taskId) => !current.includes(taskId))) {
            hasNews = true
          }
          backgroundTaskIds = current
          return [event]
        }
        case "session-info":
          startTurn()
          return [event]
        case "turn-finished": {
          const unsettled = held.flatMap((report) => [report, ...closingSpeech(report)])
          held = []
          startTurn()
          return [...unsettled, event]
        }
        default:
          return [event]
      }
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
  "直前の `report` のあと、新しい依頼もツールの結果も背景のタスクの終わりも届いていないので、" +
  "この `report` は画面に出していない。伝える新しい事実が無いターンは、`report` を" +
  "呼ばず、何も書かずに終えてよい。言い回しを変えて同じ中身の `report` を送り直さないこと。" +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/** 描いた `report` の締めのセリフ。`closing` を持たなかったころの呼び出しには無い。 */
function closingSpeech(report: ReportEvent): readonly SessionEvent[] {
  return report.closing.kind === "speech" ? [report.closing] : []
}

/** 描いたレポートと同じ引数か。文字列の2つの欄は前後の空白を除いて、`sections` と `checks` は中身で比べる。 */
function isSameReport(drawn: ReportEvent, draft: ReportDraft): boolean {
  return (
    drawn.conclusion.trim() === draft.conclusion.trim() &&
    isDeepEqual(drawn.sections, draft.sections) &&
    drawn.favor.trim() === draft.favor.trim() &&
    isDeepEqual(drawn.checks, draft.checks)
  )
}
