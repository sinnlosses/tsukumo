// `report` の差し戻し（「検査 → 整形 → 描画」の検査の段。docs/display.md 4.2）。規約違反の
// ある `report` を画面に出さずに差し戻し、直した呼び直しを描く。**1ターンに差し戻すのは1回まで**
// （2回目からは違反があっても通す。無限に往復させない）。
//
// **判定の窓口は `report` の handler だけ**（{@link ReportReview.judge}。handler は
// `src/server/adapter/sdk-tool.ts`）。`assistant` メッセージの変換（`sdk-message.ts`）は `report`
// イベントを作るだけで判定せず、{@link ReportReview.pass} がそのイベントを**同じ呼び出しの
// `tool-finished` まで預かり**、handler が返した `isError`（差し戻したら true）に従って描くか
// 捨てるかを決める。handler と変換の両方で判定すると回数の数え方が食い違いうるうえ、SDK は
// handler の呼び出し（制御リクエスト）と `assistant` メッセージの届く順を決めないので、
// 結果（`tool_result`）が必ず handler より後に届くことだけを当てにしている。
//
// handler はサブエージェントの呼び出しとメインの呼び出しを見分けられない（MCP の handler に
// `parent_tool_use_id` は届かない）ので、**サブエージェントが違反した `report` を呼ぶと、その
// ターンの差し戻しの1回を使う**。サブエージェントの `report` はどのみち描かないので、失うのは
// メインの差し戻しの機会だけ。

import { type SessionEvent } from "../../shared/session-event.ts"
import { type ReportDraft, reportRejectionText, reportViolations } from "./report-violation.ts"

/** handler の判定。`rejected` の `text` はそのまま `report` の戻り値になる。 */
export type ReportVerdict =
  | { readonly kind: "accepted" }
  | { readonly kind: "rejected"; readonly text: string }

export type ReportReview = {
  /** `report` の handler から。規約違反があり、このターンでまだ差し戻していなければ差し戻す。 */
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
 * {@link ReportReview} を1つ作る。**セッション1つに1つ**（ターンの区切りを `pass` で見ている）。
 * ターンの頭は `session-info`（SDK のターンの頭に毎回届く）と `turn-finished`。
 */
export function createReportReview(): ReportReview {
  let rejectedInTurn = false
  let held: readonly ReportEvent[] = []

  return {
    judge: (report) => {
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
          return event.isError ? [event] : [report, event]
        }
        case "session-info":
          rejectedInTurn = false
          return [event]
        case "turn-finished": {
          const unsettled = held
          held = []
          rejectedInTurn = false
          return [...unsettled, event]
        }
        default:
          return [event]
      }
    },
  }
}
