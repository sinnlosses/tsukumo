// `report` の差し戻し（「検査 → 整形 → 描画」の検査の段。docs/display.md 4.2）。規約違反の
// ある `report` を画面に出さずに差し戻し、直した呼び直しを描く。1ターンに差し戻すのは1回まで
// （2回目からは違反があっても通す。無限に往復させない）。
//
// 同じターンで画面に出した `report` と同じ引数の呼び出しも差し戻す（送り直し）。`Stop` の
// 関所（`report-tool.ts`）に止められたモデルが、止められた本文を入れずに前の `report` を送り直して
// 関所を抜ける形を塞ぐ（関所は2回目の止まりを止めないので、送り直しを通すと止めた本文が画面に
// 出ないまま終わる。docs/research/report-tool-trial.md「残った穴の形」）。枠は規約違反の1回とは
// 別に1ターンに1回まで（規約違反で差し戻して直した `report` を送り直す形もあったため）。
// 比べるのは `conclusion` / `body` / `favor` の前後の空白を除いたものと、`checks` の中身。覚えるのは {@link ReportReview.pass}
// が出した（描いた）`report` だけなので、サブエージェントの `report`（変換で捨てる）とは比べない。
//
// 判定の窓口は `report` の handler だけ（{@link ReportReview.judge}。handler は
// `src/server/session-driver/adapter/sdk-tool.ts`）。`assistant` メッセージの変換（`sdk-message.ts`）は `report`
// イベントを作るだけで判定せず、{@link ReportReview.pass} がそのイベントを同じ呼び出しの
// `tool-finished` まで預かり、handler が返した `isError`（差し戻したら true）に従って描くか
// 捨てるかを決める。handler と変換の両方で判定すると回数の数え方が食い違いうるうえ、SDK は
// handler の呼び出し（制御リクエスト）と `assistant` メッセージの届く順を決めないので、
// 結果（`tool_result`）が必ず handler より後に届くことだけを当てにしている。
//
// handler はサブエージェントの呼び出しとメインの呼び出しを見分けられない（MCP の handler に
// `parent_tool_use_id` は届かない）ので、サブエージェントが違反した `report` を呼ぶと、その
// ターンの差し戻しの1回を使う。サブエージェントの `report` はどのみち描かないので、失うのは
// メインの差し戻しの機会だけ。

import { isDeepEqual } from "remeda"

import { type SessionEvent } from "../../../shared/session-event.ts"
import { type ReportDraft, reportRejectionText, reportViolations } from "./report-violation.ts"

/** handler の判定。`rejected` の `text` はそのまま `report` の戻り値になる。 */
export type ReportVerdict =
  | { readonly kind: "accepted" }
  | { readonly kind: "rejected"; readonly text: string }

export type ReportReview = {
  /**
   * `report` の handler から。このターンで描いた `report` の送り直しか、規約違反があれば差し戻す
   * （枠はそれぞれ1ターンに1回。使い切っていれば通す）。
   */
  readonly judge: (report: ReportDraft) => ReportVerdict
  /**
   * 届いたイベントを流してよい並びに変える（メインのイベントだけを渡す）。`report` は同じ
   * `toolUseId` の `tool-finished` まで預かり、`isError` でなければその直前に出す。預かったまま
   * ターンが終わった `report`（結果の届かなかった呼び出し）は、`turn-finished` の直前に出す
   * （判定の出なかった呼び出しは、差し戻しの無かったころと同じく描く）。
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
  let held: readonly ReportEvent[] = []
  // このターンで出した（描いた）`report`。送り直しの判定にだけ使う。
  let drawn: readonly ReportDraft[] = []

  const startTurn = (): void => {
    rejectedInTurn = false
    resendRejectedInTurn = false
    drawn = []
  }

  return {
    judge: (report) => {
      if (!resendRejectedInTurn && drawn.some((previous) => isSameReport(previous, report))) {
        resendRejectedInTurn = true
        return { kind: "rejected", text: REPORT_RESEND_REJECTION_TEXT }
      }
      const violations = reportViolations(report)
      if (violations.length === 0 || rejectedInTurn) {
        return { kind: "accepted" }
      }
      rejectedInTurn = true
      return { kind: "rejected", text: reportRejectionText(violations) }
    },
    pass: (event) => {
      switch (event.kind) {
        case "report":
          held = [...held, event]
          return []
        case "tool-finished": {
          const report = held.find((candidate) => candidate.toolUseId === event.toolUseId)
          if (report === undefined) {
            return [event]
          }
          held = held.filter((candidate) => candidate !== report)
          if (event.isError) {
            return [event]
          }
          drawn = [...drawn, report]
          return [report, event]
        }
        case "session-info":
          startTurn()
          return [event]
        case "turn-finished": {
          const unsettled = held
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
 * 送り直しを差し戻すときの `report` の戻り値。固定の文面だけで、モデルが書いた本文は写さず、
 * 画面の状態（描けたか・どこに出たか）も載せない（docs/display.md 4.2。規約違反の差し戻しと同じ線）。
 */
export const REPORT_RESEND_REJECTION_TEXT =
  "この `report` は、このターンですでに受け取った `report` と同じ引数になっている。" +
  "同じ引数で送り直さず、そのあとに `report` の外に書いた本文の中身を `report` に入れて呼び直すこと。"

/** 2つのレポートが同じ引数か。文字列の3つの欄は前後の空白を除いて、`checks` は中身で比べる。 */
function isSameReport(left: ReportDraft, right: ReportDraft): boolean {
  return (
    left.conclusion.trim() === right.conclusion.trim() &&
    left.body.trim() === right.body.trim() &&
    left.favor.trim() === right.favor.trim() &&
    isDeepEqual(left.checks, right.checks)
  )
}
