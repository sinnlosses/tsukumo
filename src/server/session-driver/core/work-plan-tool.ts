// `work_plan` ツール（段取り）の説明文と、呼ぶ条件・段の切り方の規約と、handler が返す文。
// ツールは仕事のときだけ載り、規約も仕事の `systemPrompt` の append にだけ入る。

import type { ClaimedTaskSteps } from "../../../shared/repository/task-workflow.ts"
import { parseWorkPlanCall, type WorkPlan } from "../../../shared/session/work-plan.ts"
import { taskWorkPlanReplyOf } from "./task-work-plan-reply.ts"
import type { WorkPlanReview, WorkPlanVerdict } from "./work-plan-review.ts"

/** モデルに見せる `work_plan` ツールの説明。呼ぶ条件は「段取り（tsukumo）」の節が持つ。 */
export const WORK_PLAN_TOOL_DESCRIPTION =
  "作業の段取り（段の並びと今の位置）を画面に出す。段が進むたび・段取りを変えたときに、毎回段の並びごと渡す。" +
  "着手したタスクを委譲で進めるときだけは phases を省き、tsukumo がタスクの `## やること` の段から並びを作る。" +
  "段は作業のまとまりで切り、ファイル単位・操作単位で切らない。" +
  "段を進めるときは、終えた段のまとめを phaseSummary に入れる（メインビューに中間レポートとして出る）。" +
  "委譲中の段は、委譲先の返却の段の番号で tsukumo が位置を決める。" +
  "呼ぶ条件は「段取り（tsukumo）」の節に従う。"

export const WORK_PLAN_PHASES_DESCRIPTION =
  "段の名前の並び（1つ以上。まとまりが1つなら1段でよい）。" +
  "「今の形を調べる」「ID の変換を両方の形に対応させる」「文書と検証を揃える」くらいのまとまりで、" +
  "「xxx.ts を修正」のようにファイルや操作で分けない。" +
  "着手したタスクを委譲で進めるときは省く（結果に tsukumo が作った並びが返る）"

export const WORK_PLAN_CURRENT_DESCRIPTION =
  "今の段の位置（0始まり）。最後の段を閉じるのは report の workPlanClosing で、ここでは閉じない"

export const WORK_PLAN_PHASE_SUMMARY_DESCRIPTION =
  "終えた段でしたこと・分かったことを1〜2文で（記法は report の conclusion と同じ）。" +
  "current が 0 より大きく段の数より小さい呼び出しでは必ず入れる。戻る・組み替えるだけのときは、そこまでで分かったことを書く。" +
  "最後の段のまとめは report に書く"

/** `WorkPlanReview` が差し戻した呼び出しに返す直し方。差し戻しの種類ごとに1つ。 */
export const WORK_PLAN_REJECTIONS = {
  malformed:
    "current は 0 から phases の数までの整数にする。" +
    "current が 0 より大きく phases の数より小さいときは、phaseSummary に終えた段のまとめを入れる。" +
    "phaseSummary は2文以内にする。直して呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "skipped-phase":
    "同じ段の並びのまま current を2つ以上進めている（委譲の返却で tsukumo が決めた位置から数える）。" +
    "飛ばした段の中間レポートが出なくなるので、段は1つずつ進め、呼び出しごとに終えた段のまとめを " +
    "phaseSummary に入れて呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "no-claimed-task":
    "phases を省いたが、この作業ツリーが着手したタスクの `## やること` から段を読めなかった" +
    "（着手したタスクが無い・2件以上ある・`### 1. 名前` の形の段が無い・Beads を読めない）。" +
    "phases に段の並びを渡して呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
} as const satisfies Record<Exclude<WorkPlanVerdict["kind"], "accepted">, string>

/** `work_plan` の handler が返す文と、差し戻したか。 */
export type WorkPlanAnswer = { readonly text: string; readonly isError: boolean }

/**
 * `work_plan` の呼び出し1つを判定して返す文を決める。
 * `phases` を省いた呼び出しのときだけ着手したタスクの段を読み、受け付けたら作った並びを結果の文に載せる。
 */
export async function answerWorkPlanCall(
  review: WorkPlanReview,
  input: unknown,
  readClaimedTaskSteps: () => Promise<ClaimedTaskSteps>,
): Promise<WorkPlanAnswer> {
  const call = parseWorkPlanCall(input)
  if (call?.kind !== "from-task") {
    return answerOf(review.judge(input), () => "ok")
  }
  const claimed = await readClaimedTaskSteps()
  return answerOf(review.judgeFromTask(call, claimed), (plan) =>
    claimed.kind === "claimed" ? taskWorkPlanReplyOf(claimed.taskId, plan.phases) : "ok",
  )
}

/**
 * 段取りの規約。呼ぶ条件・`speak` と `report` との並べ方・委譲中の段を持つ。
 * 段の切り方と段のまとめはツールと引数の説明が持ち、段を飛ばしたときの直し方は差し戻しの文が持つ。
 */
export const WORK_PLAN_PROMPT = `## 段取り（tsukumo）

\`work_plan\` ツール（\`mcp__tsukumo__work_plan\`）で渡した段取りは、進み具合の帯と依頼の手順の一覧に出る。
**利用者が作業中に「いまどの段にいて、あと何が残っているか」を追うためのもの。**

**呼ぶのは、作業をするターンなら段の数にかかわらず毎回。** 作業のまとまりが1つなら1段の段取りを渡す
（札には \`1/1\` のように出る）。答えるだけ・1回調べて答えるだけの依頼では呼ばない。

- 1回の呼び出しはツール呼び出し1回のぶん時間がかかるので、段の中の細かな進みでは呼ばない
- **段を進める呼び出しと、その契機の \`speak\` は同じ応答の中で並べて呼ぶ**（段が変わるのは論点が
  切り替わるときなので、「セリフの間合い」の契機に当たる）。\`phaseSummary\` と同じ中身をセリフで繰り返さない
- **段取りを渡した依頼の \`report\` には、段の閉じ方を \`workPlanClosing\` で必ず入れる。** 全部の段を終えたら、
  最後の段にいる状態で \`finished\` を渡すと、tsukumo が帯を全部済みにする（\`work_plan\` で \`current\` に段の数を
  渡さなくてよい）。途中で止めたら \`stopped\` を渡し、帯は止まった段が「今」のまま残る。欄の無い \`report\`、
  段が2つ以上残った \`finished\`、タスクを \`shipped\` で締めるのに \`stopped\` で段が残った \`report\` は tsukumo が差し戻す
- **作業を背景で委譲するときは、段の進みを tsukumo が受け持つ。** 帯の段は「計画」「委譲先に任せる各段」「受け入れ」の
  並び。委譲先が1行目 \`段 n/N | …\` か \`計画 0/N | …\` で返すと、tsukumo が帯を段 n を済ませた位置
  （\`current\` n+1）へ進め、\`|\` より後ろをその段のまとめにする（\`止めた n/N | …\` では進めない。
  同じ返却を重ねても、古い番号の返却でも帯は戻らない）。
  - **この作業ツリーで着手したタスクを委譲するときは、\`phases\` を渡さず \`current\` だけを渡す。** tsukumo が
    タスクの \`## やること\` の段から並びを作り、結果に番号付きで返す。計画どおりに委譲するなら計画を済ませた位置
    （\`current\` 1）で、委譲先に計画を書かせるなら計画の段（\`current\` 0）で呼んでから委譲する
  - 委譲先に計画を書かせたときは、計画の返却で帯が1段進んだあと、\`phases\` を渡さずに今の位置（\`current\` 1）と
    計画のまとめで呼び直す。tsukumo が書き直した \`## やること\` を読み直して並びを作り直す
  - タスクに紐付かない作業を委譲するときは、並びを \`phases\` に渡す
  - 委譲のあいだは途中の \`work_plan\` を呼ばない（返却で決まった位置から2段以上進める呼び出しは差し戻される）。
    最後の段の返却で受け入れの段に入るので、受け入れを済ませたら \`finished\` の \`report\` を渡す
- **セリフ・\`phaseSummary\`・レポートで段の番号や数を言うときは、帯の段で数える**（委譲したときは
  「計画」と「受け入れ」も1段に数える）。委譲先の返却の \`n/N\` や、タスクの手順に書かれた段の番号・数を
  そのまま言わない
`

function answerOf(
  verdict: WorkPlanVerdict,
  acceptedText: (plan: WorkPlan) => string,
): WorkPlanAnswer {
  return verdict.kind === "accepted"
    ? { text: acceptedText(verdict.plan), isError: false }
    : { text: WORK_PLAN_REJECTIONS[verdict.kind], isError: true }
}
