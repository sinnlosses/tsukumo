// `work_plan` ツール（ワークプラン）の説明文と、呼ぶ条件・段の切り方の規約と、handler が返す文。
// ツールは仕事のときだけ載り、規約も仕事の `systemPrompt` の append にだけ入る。

import { bandPositionText, delegatedRangeLine } from "./band-position.ts"
import type { WorkPlanReview, WorkPlanVerdict } from "./work-plan-review.ts"

/** モデルに見せる `work_plan` ツールの説明。呼ぶ条件は「ワークプラン（tsukumo）」の節が持つ。 */
export const WORK_PLAN_TOOL_DESCRIPTION =
  "作業のワークプラン（フェーズの並びと今の位置）を画面に出す。フェーズが進むたび・ワークプランを変えたときに、毎回並びごと渡す。" +
  "フェーズは作業のまとまりで切り、ファイル単位・操作単位で切らない。" +
  "進めるときは、終えたフェーズでしたことを必ず phaseSummary に入れる（メインビューに中間レポートとして、その所要とともに出る）。" +
  "委譲するときは、委譲先の範囲を delegatedRange で渡す（範囲の中は委譲先の返却で進み、フェーズの数は返却の値で埋まる）。" +
  "呼ぶ条件は「ワークプラン（tsukumo）」の節に従う。"

export const WORK_PLAN_PHASES_DESCRIPTION =
  "フェーズの名前の並び（1つ以上。まとまりが1つなら1つでよい）。" +
  "「今の形を調べる」「ID の変換を両方の形に対応させる」「文書と検証を揃える」くらいのまとまりで、" +
  "「xxx.ts を修正」のようにファイルや操作で分けない。" +
  '並列のフェーズは、名前の配列（2つ以上・重ならない名前）を1つの要素にして渡す（例: ["調べる", ["サーバを直す", "画面を直す"], "検証"]）'

export const WORK_PLAN_CURRENT_DESCRIPTION =
  "今の要素の位置（0始まり。並列のフェーズの配列は1つの要素として数える）。" +
  "最後のフェーズを閉じるのは report の workPlanClosing で、ここでは閉じない"

export const WORK_PLAN_FINISHED_IN_GROUP_DESCRIPTION =
  "current が並列のフェーズの配列を指すとき、その中で済んだ名前。" +
  "1つ済ませるたびに名前を足して呼び、最後の1つを済ませる呼び出しでは current を1つ進めてこの欄を空にする。" +
  "配列を指していないときは省く"

export const WORK_PLAN_PHASE_SUMMARY_DESCRIPTION =
  "終えたフェーズでしたこと・分かったことを2文以内で（目安。記法は report の conclusion と同じ）。" +
  "済んだフェーズが1つ以上あり全部は済んでいない呼び出しでは必ず入れる。戻る・組み替えるだけのときは、そこまでで分かったことを書く。" +
  "最後のまとめは report に書く"

export const WORK_PLAN_DELEGATED_RANGE_DESCRIPTION =
  "作業を委譲するときだけ、委譲先のフェーズの範囲。first は委譲先のフェーズ1に当たる位置（phases を平らにした並びで0始まり。省くと current の次）、" +
  "count は委譲先のフェーズの数（委譲先の返却を受けたあとは返却の値で埋まるので省く）。" +
  "プログレスバーは範囲の前・範囲・範囲の後ろの群ごとに1から数え、範囲の中は委譲先と同じ番号（範囲の先頭が 1）になる。" +
  "範囲の端は並列のフェーズの配列の途中に置かない。委譲しないときは省く"

export const WORK_PLAN_SKIPPED_PHASES_DESCRIPTION =
  "自分で走らせるフェーズのうち、要らなくて飛ばしたものの名前（済みに数え、プログレスバーで飛ばした印が付く）。" +
  "phases にあり、この呼び出しで済んでいる名前だけ。毎回の呼び出しで、自分が飛ばしたフェーズをすべて入れる。" +
  "委譲先が phase_result で飛ばしたフェーズは入れなくてよい。飛ばさなかったら省く"

/** `CallReview` が差し戻した呼び出しに返す直し方。差し戻しの種類ごとに1つ。 */
const WORK_PLAN_REJECTIONS = {
  malformed:
    "current は 0 から phases の要素の数 − 1 までの整数にする。" +
    "delegatedRange は phases の並びの中に収め、端を並列のフェーズの配列の途中に置かない。" +
    "並列のフェーズの配列は、重ならない2つ以上の名前にする。" +
    "finishedInGroup には current が指す配列の中の名前だけを、全部にならないように入れる（配列を指していなければ省く）。" +
    "skippedPhases には phases にあり、この呼び出しで済んでいる名前だけを重ねずに入れる。直して呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "summary-missing":
    "済んだフェーズが1つ以上あり全部は済んでいないのに、phaseSummary が無いか空。" +
    "phaseSummary に終えたフェーズのまとめを2文以内で入れて呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "closed-by-plan":
    "current が phases の要素の数に等しい（全部済みの位置）。" +
    "最後のフェーズにいるあいだはその位置のままにし、全部終えたら work_plan ではなく " +
    "report の workPlanClosing に finished を渡して閉じる。並列のフェーズの配列は1つの要素として数える。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "skipped-phase":
    "同じ並びのまま、1回の呼び出しで2つ以上のフェーズを済ませている。" +
    "間の中間レポートが出なくなるので、1つずつ済ませ（並列のフェーズも finishedInGroup に1つずつ足す。飛ばしたフェーズも1つに数える）、呼び出しごとに終えたフェーズのまとめを " +
    "phaseSummary に入れて呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "skip-mark-late":
    "skippedPhases に、前の呼び出しで飛ばした印なしに済ませたフェーズの名前が入っている。" +
    "済ませたフェーズをあとから飛ばしたことにしない。その名前を skippedPhases から外して呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "skip-mark-dropped":
    "前の呼び出しで skippedPhases に入れたフェーズが、まだ済んでいるのに skippedPhases から外れている。" +
    "skippedPhases には、自分が飛ばしたフェーズを毎回すべて入れて呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
} as const satisfies Record<Exclude<WorkPlanVerdict["kind"], "accepted">, string>

/** `work_plan` の handler が返す文と、差し戻したか。 */
export type WorkPlanAnswer = { readonly text: string; readonly isError: boolean }

/** `work_plan` の呼び出し1つを判定して返す文を決める。 */
export function answerWorkPlanCall(
  review: { readonly judgeWorkPlan: WorkPlanReview["judge"] },
  input: unknown,
): WorkPlanAnswer {
  const verdict = review.judgeWorkPlan(input)
  if (verdict.kind !== "accepted") {
    return { text: WORK_PLAN_REJECTIONS[verdict.kind], isError: true }
  }
  const rangeLine = delegatedRangeLine(verdict.plan.delegatedRange)
  const lines = [
    "ok",
    bandPositionText({ kind: "planned", ...verdict.plan }),
    ...(rangeLine === "" ? [] : [rangeLine]),
  ]
  return { text: lines.join("\n"), isError: false }
}

/**
 * ワークプランの規約。呼ぶ条件・`speak` と `report` との並べ方・委譲中の段・脇の話の受け方を持つ。
 * 段の切り方と段のまとめはツールと引数の説明が持ち、段を飛ばしたときの直し方は差し戻しの文が持つ。
 */
export const WORK_PLAN_PROMPT = `## ワークプラン（tsukumo）

\`work_plan\` ツール（\`mcp__tsukumo__work_plan\`）で渡したワークプランは、進み具合のプログレスバーと依頼の手順の一覧に出る。
**利用者が作業中に「いまどのフェーズにいて、あと何が残っているか」を追うためのもの。**

**呼ぶのは、作業をするターンならフェーズの数にかかわらず毎回。** 作業のまとまりが1つなら1フェーズで渡す
（カードには \`1/1\` のように出る）。答えるだけ・1回調べるだけの依頼では呼ばない。
最初の \`work_plan\` は着手の時点で \`current: 0\` で渡す。

- 呼び出しごとにツール1回ぶんの時間がかかるので、フェーズの中の細かな進みでは呼ばない
- **フェーズを進める呼び出しと、その契機の \`speak\` は同じ応答に並べて呼ぶ**（論点が
  切り替わるときなので、「セリフの間合い」の契機に当たる）。\`phaseSummary\` と同じ中身をセリフで繰り返さない
- **ワークプランを渡した依頼の \`report\` には、フェーズの閉じ方を \`workPlanClosing\` で必ず入れる。** 全部終えたら、
  最後のフェーズにいる状態で \`finished\` を渡すと、tsukumo がプログレスバーを全部済みにする（\`current\` をフェーズの数にしなくてよい）。
  途中で止めたら \`stopped\` を渡し、止まったフェーズが「今」のまま残る。欄の無い \`report\`、
  フェーズが2つ以上残った \`finished\`、\`task.outcome\` を \`finished\` で締めるのに \`stopped\` で残った \`report\` は tsukumo が差し戻す
- **委譲した作業のフェーズは、委譲先の \`phase_result\` で進む**（\`finished\`・\`skipped\` が \`phase\` に当たるフェーズを済ませる）。
  自分の \`work_plan\` では、並びと委譲先の範囲を渡す
  - 並びはいつも \`phases\` で渡す。計画や受け入れをフェーズにするかも自分で決める
  - **計画を委譲先に頼む最初の \`work_plan\` は、\`delegatedRange\` を \`{}\` で渡す**（数が未定のあいだ範囲の先頭から後ろは番号を持たず、委譲先の返却では動かない）
  - **\`phase_result\` を受けたあとは、範囲のフェーズの数を tsukumo が \`count\` で埋める。** 計画だけの回は \`phase_result\` を呼ばないので、
    その数（\`plan-phases --through 計画\` などで Beads から読む）を \`count\` に書いて並びを組み直す。
    範囲の前後に自分のフェーズ（計画・受け入れなど）を置いてよい。範囲の端を並列のフェーズの配列の途中に置かない。
    範囲を初めて宣言した呼び出しでは、範囲の前が済み、範囲の先頭が今のフェーズになる（\`current\` は範囲の前のままでよい）
  - **返却を受けたら、進んだ位置を確かめ、その位置のまま \`work_plan\` を渡す。** summary が無ければ、
    渡す \`work_plan\` の \`phaseSummary\` に、返却を読んでそのフェーズのまとめを書く（省けない）。位置を組み替えるときも、終えたフェーズのまとめを書く
  - **\`phase_result\` を伴わない返却（計画だけの回・古い plugin）ではプログレスバーは動かない。** その返却でフェーズが済んだなら、自分で位置を進めた \`work_plan\` を渡し、\`phaseSummary\` を書く
  - **返却が届いてから \`work_plan\` を呼ぶまで、\`Bash\`・\`Edit\`・\`Write\`・\`Agent\`・\`SendMessage\` などの作業のツールは tsukumo に拒まれる**
    （\`Read\`・\`Grep\`・\`Glob\`・\`ToolSearch\` と tsukumo のツールは通る）。返却に \`phase_result\` が伴わなくても、\`stopped\` でも同じ。
    返却を読んで、並びと範囲を確かめてから \`work_plan\` を呼ぶ。差し戻してやり直させるときも、同じフェーズのまま \`work_plan\` を呼べば通る
  - **依頼で最初の \`work_plan\` を呼ぶまで、\`Edit\`・\`Write\` は tsukumo に拒まれる**（開始の記録を先に残すため。差し戻された \`work_plan\` のあいだも同じ）。
    調べる・答えるだけで終える依頼には影響しない。拒まれたら \`current: 0\` で先に \`work_plan\` を渡す。自動メモリ（\`~/.claude/projects/<名>/memory/\`）への書き込みは対象外
  - **並列のフェーズは、\`phases\` の中で名前の配列にして1つの要素で渡す**（どれを並列にするかは自分で決める）。
    委譲先がどの順で \`phase_result\` を返しても、\`phase\` に当たるフェーズが済む
  - 受け入れを済ませたら \`finished\` の \`report\` を渡す
- **自分で走らせるフェーズを要らずに飛ばしたら、それを済ませた位置で \`work_plan\` を渡し、名前を \`skippedPhases\` に入れる**
  （\`phaseSummary\` には飛ばしたわけを書く）。それより後の呼び出しでも、自分が飛ばしたフェーズを毎回すべて入れる
- **プログレスバーのフェーズは、範囲の前（前）・範囲（本）・範囲の後ろ（後）の群ごとに1から数える。** 本は委譲先のフェーズ \`n\` を \`n\` 番目とする。
  セリフで番号を言うのは本だけで、前・後（計画・受け入れなど）は「後 1/3」と出ていても名前で言う。
  返却に添えられる tsukumo の注記・\`work_plan\` の戻り値・委譲ゲートの拒否文が、済んだフェーズと今の位置を返すので、それを使って言う
- **委譲中の補足メッセージ（tsukumo の差し込みで届く）は、新しい依頼ではなく、いまの作業の続きの中の一言。**
  - ワークプランは今のまま続く。止める・方針を変えるよう頼まれたら、今のワークプランを \`work_plan\` で組み替えるか、
    止めるなら \`stopped\` の \`report\` を渡す
  - 補足メッセージのあいだに委譲先の返却が届いたら、いつもどおり進んだ位置のまま \`work_plan\` を渡し、受け入れを済ませたら \`finished\` の \`report\` を渡す
`
