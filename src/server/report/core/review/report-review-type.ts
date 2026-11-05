// `report` の差し戻し（`createReportReview`）が外へ見せる型。
// 判定の窓口 `ReportReview` と、その判定の結果、新しい事実の帳面のうち `report` が読む口。

import type { BackgroundTask } from "../../../../shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../../shared/session/session-event.ts"
import type { ReportDraft } from "../rules/draft.ts"
import type { ReportRejectionReason } from "../rules/rejection-mode.ts"
import type { A2uiStructureFault, A2uiStructureVerdict } from "../rules/structure.ts"

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
   * 応えていない `work_plan` の差し戻し、合わないフェーズの閉じ方、`ng` のある `finished`、背景のシェル、規約違反のどれかなら、
   * この順に見て差し戻す（枠はそれぞれ1ターンに1回。使い切っていれば通す）。
   * 補足メッセージのターンでは、合わないフェーズの閉じ方・背景のシェルを見ない（ほかは見る）。
   * 記録に残す種類の名前は `REPORT_PROCEDURE_REJECTIONS`（フェーズの閉じ方は3つの名前が1つの枠を共有する）。
   * 段が `count` の条は、枠の残りに関わらず当てはまれば預け、枠を使わずに次の条へ進む（差し戻した呼び出しの預かりは捨てる）。
   */
  readonly judge: (report: ReportDraft) => ReportVerdict
  /** `a2ui` の版の handler から、構造の規約の違反があるときだけ `judge` より先に呼ぶ。枠は1ターンに1回。 */
  readonly judgeStructure: (faults: readonly A2uiStructureFault[]) => A2uiStructureVerdict
  /**
   * `a2ui` の版の handler から、違反が辿れない部品だけだったときに、捨てて通した部品の ID で呼ぶ（枠は使わない）。
   * 同じ呼び出しの `pass` が、描く `report` の `components` からその部品を除き、記録（`report-counted`）に `a2ui-unreferenced-dropped` を残す。
   */
  readonly noteDroppedParts: (ids: readonly string[]) => void
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
