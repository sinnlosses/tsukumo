// `work_plan` ツール（段取り）の説明文と、呼ぶ条件・段の切り方の規約と、handler が返す文。
// ツールは仕事のときだけ載り、規約も仕事の `systemPrompt` の append にだけ入る。

import type { WorkPlanReview, WorkPlanVerdict } from "./work-plan-review.ts"

/** モデルに見せる `work_plan` ツールの説明。呼ぶ条件は「段取り（tsukumo）」の節が持つ。 */
export const WORK_PLAN_TOOL_DESCRIPTION =
  "作業の段取り（段の並びと今の位置）を画面に出す。段が進むたび・段取りを変えたときに、毎回段の並びごと渡す。" +
  "段は作業のまとまりで切り、ファイル単位・操作単位で切らない。" +
  "段を進めるときは、終えた段でしたことを必ず phaseSummary に入れる（メインビューに中間レポートとして、その段の所要とともに出る）。" +
  "委譲中も、返却を受けるたびにこのツールで段を進める。" +
  "呼ぶ条件は「段取り（tsukumo）」の節に従う。"

export const WORK_PLAN_PHASES_DESCRIPTION =
  "段の名前の並び（1つ以上。まとまりが1つなら1段でよい）。" +
  "「今の形を調べる」「ID の変換を両方の形に対応させる」「文書と検証を揃える」くらいのまとまりで、" +
  "「xxx.ts を修正」のようにファイルや操作で分けない。" +
  '同時に走らせる段は、名前の配列（2つ以上・重ならない名前）を1つの要素にして渡す（例: ["調べる", ["サーバを直す", "画面を直す"], "検証"]）'

export const WORK_PLAN_CURRENT_DESCRIPTION =
  "今の要素の位置（0始まり。同時に走らせる段の配列は1つの要素として数える）。" +
  "最後の段を閉じるのは report の workPlanClosing で、ここでは閉じない"

export const WORK_PLAN_FINISHED_IN_GROUP_DESCRIPTION =
  "current が同時に走らせる段の配列を指すとき、その中で済んだ段の名前。" +
  "配列の段を1つ済ませるたびに名前を足して呼び、最後の1段を済ませる呼び出しでは current を1つ進めてこの欄を空にする。" +
  "配列を指していないときは省く"

export const WORK_PLAN_PHASE_SUMMARY_DESCRIPTION =
  "終えた段でしたこと・分かったことを1〜2文で（記法は report の conclusion と同じ）。" +
  "済んだ段が1つ以上あり全部は済んでいない呼び出しでは必ず入れる。戻る・組み替えるだけのときは、そこまでで分かったことを書く。" +
  "最後の段のまとめは report に書く"

/** `WorkPlanReview` が差し戻した呼び出しに返す直し方。差し戻しの種類ごとに1つ。 */
export const WORK_PLAN_REJECTIONS = {
  malformed:
    "current は 0 から phases の要素の数までの整数にする。" +
    "同時に走らせる段の配列は、重ならない2つ以上の名前にする。" +
    "finishedInGroup には current が指す配列の中の名前だけを、全部にならないように入れる（配列を指していなければ省く）。" +
    "済んだ段が1つ以上あり全部は済んでいないときは、phaseSummary に終えた段のまとめを入れる。" +
    "phaseSummary は2文以内にする。直して呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "skipped-phase":
    "同じ段の並びのまま、1回の呼び出しで2つ以上の段を済ませている。" +
    "飛ばした段の中間レポートが出なくなるので、段は1つずつ済ませ（同時に走らせる段も finishedInGroup に1つずつ足す）、呼び出しごとに終えた段のまとめを " +
    "phaseSummary に入れて呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "empty-summary":
    "段を進めているのに phaseSummary が空。" +
    "中間レポートには終えた段でしたことが必ず出るので、phaseSummary に終えた段でしたことを1〜2文で入れて呼び直すこと。" +
    "最後の段を終えるときは work_plan で閉じず、report の workPlanClosing に finished を渡す。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
} as const satisfies Record<Exclude<WorkPlanVerdict["kind"], "accepted">, string>

/** `work_plan` の handler が返す文と、差し戻したか。 */
export type WorkPlanAnswer = { readonly text: string; readonly isError: boolean }

/** `work_plan` の呼び出し1つを判定して返す文を決める。 */
export function answerWorkPlanCall(review: WorkPlanReview, input: unknown): WorkPlanAnswer {
  const verdict = review.judge(input)
  return verdict.kind === "accepted"
    ? { text: "ok", isError: false }
    : { text: WORK_PLAN_REJECTIONS[verdict.kind], isError: true }
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
  段が2つ以上残った \`finished\`、\`task.outcome\` を \`finished\` で締めるのに \`stopped\` で段が残った \`report\` は tsukumo が差し戻す
- **作業を委譲するときも、段を進めるのは自分の \`work_plan\` だけ。** tsukumo は委譲先の返却を読まない
  - 並びはいつも \`phases\` で渡す。計画や受け入れを段にするかも自分で決める
  - **委譲先から返却を受けるたびに、返却の中身から終えた段のまとめを書いて \`work_plan\` で1段進める**。
    1回の返却で2段以上済んだら、段ごとに呼ぶ（2段以上まとめて進める呼び出しは差し戻される）
  - **同時に走らせる段は、\`phases\` の中で名前の配列にして1つの要素で渡す**（どれを同時に走らせるかは自分で決める）。
    委譲先がどの順で返っても、返却を受けた段の名前を \`finishedInGroup\` に足して1段ずつ呼ぶ。配列の最後の段を済ませる
    呼び出しでは \`current\` を1つ進め、\`finishedInGroup\` を空にする
  - 受け入れを済ませたら \`finished\` の \`report\` を渡す
- **セリフ・\`phaseSummary\`・レポートで段の番号や数を言うときは、帯の段で数える**。委譲先の返却や
  タスクの手順に書かれた段の番号・数をそのまま言わない
`
