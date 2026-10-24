// `report` の手続きの差し戻し（送り直し・新しい事実・ワークプラン・`ng` のある `finished`・背景のシェル）の名前と、差し戻すときの戻り値の文面。
// 文面は固定で、モデルが書いた本文も画面の状態（描けたか・どこに出たか）も写さない。判定の順は `ReportReview.judge` が持つ。

import type { BackgroundTask } from "../../../shared/session-driver/background-task.ts"
import { REPORT_CHANGED_FIELDS_ONLY_TEXT } from "./report-rejection.ts"

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

export type ProcedureRejection = (typeof REPORT_PROCEDURE_REJECTIONS)[number]

/** 送り直しを差し戻すときの戻り値。 */
export const REPORT_RESEND_REJECTION_TEXT =
  "この `report` は、このターンですでに受け取った `report` と同じ引数になっている。" +
  "同じ引数で送り直さず、そのあとに `report` の外に書いた本文の中身を `report` に入れて呼び直すこと。" +
  REPORT_CHANGED_FIELDS_ONLY_TEXT

/** 新しい事実の無い `report` を差し戻すときの戻り値。 */
export const REPORT_NOTHING_NEW_REJECTION_TEXT =
  "直前の `report` のあと、新しい依頼もツールの結果もバックグラウンドタスクの終わりも届いていないので、" +
  "この `report` は画面に出していない。伝える新しい事実が無いターンは、`report` を" +
  "呼ばず、何も書かずに終えてよい。言い回しを変えて同じ中身の `report` を送り直さないこと。" +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/** 同じターンで差し戻した `work_plan` にまだ応えていない `report` を差し戻すときの戻り値。 */
export const REPORT_UNANSWERED_WORK_PLAN_REJECTION_TEXT =
  "このターンで差し戻された `work_plan` に、まだ応えていない。" +
  "差し戻しの直し方に従って `work_plan` を呼び直し、受け付けられてから `report` を呼ぶこと。" +
  REPORT_CHANGED_FIELDS_ONLY_TEXT +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/** 同じ依頼にワークプランがあるのに `workPlanClosing` の無い `report` を差し戻すときの戻り値。 */
export const REPORT_MISSING_WORK_PLAN_CLOSING_REJECTION_TEXT =
  "この依頼では `work_plan` でワークプランを渡しているので、`report` の workPlanClosing に段の閉じ方を入れる。" +
  "全部の段を終えたなら `finished`、途中で止めたなら `stopped` を入れて呼び直すこと。" +
  REPORT_CHANGED_FIELDS_ONLY_TEXT +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/** `workPlanClosing` が `finished` なのに段が2つ以上残っている `report` を差し戻すときの戻り値。 */
export const REPORT_UNFINISHED_PHASES_REJECTION_TEXT =
  "workPlanClosing が `finished` なのに、ワークプランに済んでいない段が2つ以上残っている。" +
  "`finished` で tsukumo が閉じるのは最後の段だけなので、同じ応答の中で `report` より先に `work_plan` で段を1つずつ進め、" +
  "最後の段に来てから `finished` で呼び直す。途中で止めたなら `stopped` にする。" +
  REPORT_CHANGED_FIELDS_ONLY_TEXT +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/** `task.outcome` が `finished` なのに `workPlanClosing` が `stopped` で段の残った `report` を差し戻すときの戻り値。 */
export const REPORT_FINISHED_BUT_STOPPED_REJECTION_TEXT =
  "`task.outcome` が `finished` なのに、workPlanClosing が `stopped` でワークプランに済んでいない段が残っている。" +
  "全部の段を終えたなら最後の段まで進めて `finished` にし、途中で止めたなら outcome を `stopped` か `awaiting-answer` にして呼び直すこと。" +
  REPORT_CHANGED_FIELDS_ONLY_TEXT +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/** `task.outcome` が `finished` なのに `checks` に `ng` の行がある `report` を差し戻すときの戻り値。`checks` の中身も写さない。 */
export const REPORT_FINISHED_WITH_NG_REJECTION_TEXT =
  "`task.outcome` が `finished` なのに、`checks` に `ng` の行がある。" +
  "落ちた確認を直して `ok` にしてから `finished` で呼び直すか、直せないなら outcome を `stopped` か `awaiting-answer` にして呼び直すこと。" +
  REPORT_CHANGED_FIELDS_ONLY_TEXT +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/** 背景のシェルが残っている `report` を差し戻すときの戻り値。残りのシェルの ID と `description` だけを載せる。 */
export function reportBackgroundRunningRejectionText(shells: readonly BackgroundTask[]): string {
  const listing = shells
    .map(
      (task) =>
        `\`${task.taskId}\`（${task.description === "" ? "背景のコマンド" : task.description}）`,
    )
    .join("、")
  return (
    `背景で動いているコマンドが残っている: ${listing}。` +
    "`TaskStop` で止めるか、待つなら待つと決めてから `report` を呼び直すこと。" +
    REPORT_CHANGED_FIELDS_ONLY_TEXT +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"
  )
}
