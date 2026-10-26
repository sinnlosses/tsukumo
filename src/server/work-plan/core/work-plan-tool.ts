// `work_plan` ツール（ワークプラン）の説明文と、呼ぶ条件・段の切り方の規約と、handler が返す文。
// ツールは仕事のときだけ載り、規約も仕事の `systemPrompt` の append にだけ入る。

import { bandPositionText } from "./band-position.ts"
import type { WorkPlanReview, WorkPlanVerdict } from "./work-plan-review.ts"

/** モデルに見せる `work_plan` ツールの説明。呼ぶ条件は「ワークプラン（tsukumo）」の節が持つ。 */
export const WORK_PLAN_TOOL_DESCRIPTION =
  "作業のワークプラン（段の並びと今の位置）を画面に出す。段が進むたび・ワークプランを変えたときに、毎回段の並びごと渡す。" +
  "段は作業のまとまりで切り、ファイル単位・操作単位で切らない。" +
  "段を進めるときは、終えた段でしたことを必ず phaseSummary に入れる（メインビューに中間レポートとして、その段の所要とともに出る）。" +
  "委譲するときは、委譲先の段の範囲を delegatedRange で渡す（委譲中の段は委譲先の返却で進む）。" +
  "呼ぶ条件は「ワークプラン（tsukumo）」の節に従う。"

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
  "終えた段でしたこと・分かったことを2文以内で（目安。記法は report の conclusion と同じ）。" +
  "済んだ段が1つ以上あり全部は済んでいない呼び出しでは必ず入れる。戻る・組み替えるだけのときは、そこまでで分かったことを書く。" +
  "最後の段のまとめは report に書く"

export const WORK_PLAN_DELEGATED_RANGE_DESCRIPTION =
  "作業を委譲するときだけ、委譲先の段の範囲。first は委譲先の段1に当たる位置（phases を平らにした並びで0始まり）、" +
  "count は委譲先の段の数。帯は範囲の前・範囲・範囲の後ろの群ごとに1から数え、範囲の中の段は委譲先の段と同じ番号（範囲の先頭が 1）になる。" +
  "計画を委譲先に頼む最初の呼び出しは { first } だけを渡す（count は計画の返却で分かってから）。" +
  "範囲の端は同時に走らせる段の配列の途中に置かない。委譲しないときは省く"

export const WORK_PLAN_SKIPPED_PHASES_DESCRIPTION =
  "自分で走らせる段のうち、要らなくて飛ばした段の名前（済んだ段に数え、帯で飛ばした印が付く）。" +
  "phases にあり、この呼び出しで済んでいる段の名前だけ。毎回の呼び出しで、自分が飛ばした段をすべて入れる。" +
  "委譲先が phase_result で飛ばした段は入れなくてよい。飛ばさなかったら省く"

/** `CallReview` が差し戻した呼び出しに返す直し方。差し戻しの種類ごとに1つ。 */
const WORK_PLAN_REJECTIONS = {
  malformed:
    "current は 0 から phases の要素の数 − 1 までの整数にする。" +
    "delegatedRange は phases の並びの中に収め、端を同時に走らせる段の配列の途中に置かない。" +
    "同時に走らせる段の配列は、重ならない2つ以上の名前にする。" +
    "finishedInGroup には current が指す配列の中の名前だけを、全部にならないように入れる（配列を指していなければ省く）。" +
    "skippedPhases には phases にあり、この呼び出しで済んでいる段の名前だけを重ねずに入れる。直して呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "summary-missing":
    "済んだ段が1つ以上あり全部は済んでいないのに、phaseSummary が無いか空。" +
    "phaseSummary に終えた段のまとめを2文以内で入れて呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "closed-by-plan":
    "current が phases の要素の数に等しい（全部済みの位置）。" +
    "最後の段にいるあいだは最後の段の位置のままにし、全部の段を終えたら work_plan ではなく " +
    "report の workPlanClosing に finished を渡して閉じる。同時に走らせる段の配列は1つの要素として数える。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "skipped-phase":
    "同じ段の並びのまま、1回の呼び出しで2つ以上の段を済ませている。" +
    "間の段の中間レポートが出なくなるので、段は1つずつ済ませ（同時に走らせる段も finishedInGroup に1つずつ足す。飛ばした段も1段に数える）、呼び出しごとに終えた段のまとめを " +
    "phaseSummary に入れて呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "skip-mark-late":
    "skippedPhases に、前の呼び出しで飛ばした印なしに済ませた段の名前が入っている。" +
    "済ませた段をあとから飛ばした段に変えない。その名前を skippedPhases から外して呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "skip-mark-dropped":
    "前の呼び出しで skippedPhases に入れた段が、まだ済んでいるのに skippedPhases から外れている。" +
    "skippedPhases には、自分が飛ばした段を毎回すべて入れて呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "late-start":
    "この依頼の最初の work_plan が、済んだ段のある位置（current が 1 以上）から始まっている。" +
    "依頼の最初の work_plan は段1（current: 0）で渡す。既に作業を終えた段があっても同じで、" +
    "current: 0 で渡し直してから、段を1つずつ進め、そのつど終えた段のまとめを phaseSummary に入れること。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "range-mismatch":
    "delegatedRange の count が、委譲先の返却で知らされた段の数と違う。" +
    "範囲の中の段を委譲先の段に1つずつ合わせ、" +
    "count を返却の段の数にそろえて呼び直すこと。" +
    "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。",
  "range-missing":
    "委譲先の返却を受けたのに delegatedRange が無いか、count が無い。" +
    "first と count（返却の段の数）を付けた委譲先の段の範囲を宣言して呼び直すこと。" +
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
  return verdict.kind === "accepted"
    ? { text: `ok\n${bandPositionText({ kind: "planned", ...verdict.plan })}`, isError: false }
    : { text: WORK_PLAN_REJECTIONS[verdict.kind], isError: true }
}

/**
 * ワークプランの規約。呼ぶ条件・`speak` と `report` との並べ方・委譲中の段・脇の話の受け方を持つ。
 * 段の切り方と段のまとめはツールと引数の説明が持ち、段を飛ばしたときの直し方は差し戻しの文が持つ。
 */
export const WORK_PLAN_PROMPT = `## ワークプラン（tsukumo）

\`work_plan\` ツール（\`mcp__tsukumo__work_plan\`）で渡したワークプランは、進み具合の帯と依頼の手順の一覧に出る。
**利用者が作業中に「いまどの段にいて、あと何が残っているか」を追うためのもの。**

**呼ぶのは、作業をするターンなら段の数にかかわらず毎回。** 作業のまとまりが1つなら1段のワークプランを渡す
（札には \`1/1\` のように出る）。答えるだけ・1回調べて答えるだけの依頼では呼ばない。
最初の \`work_plan\` は着手の時点で段1（\`current: 0\`）で渡す（作業を終えてから \`current\` 1 以上で渡すと差し戻される）。

- 1回の呼び出しはツール呼び出し1回のぶん時間がかかるので、段の中の細かな進みでは呼ばない
- **段を進める呼び出しと、その契機の \`speak\` は同じ応答の中で並べて呼ぶ**（段が変わるのは論点が
  切り替わるときなので、「セリフの間合い」の契機に当たる）。\`phaseSummary\` と同じ中身をセリフで繰り返さない
- **ワークプランを渡した依頼の \`report\` には、段の閉じ方を \`workPlanClosing\` で必ず入れる。** 全部の段を終えたら、
  最後の段にいる状態で \`finished\` を渡すと、tsukumo が帯を全部済みにする（\`work_plan\` で \`current\` に段の数を
  渡さなくてよい）。途中で止めたら \`stopped\` を渡し、帯は止まった段が「今」のまま残る。欄の無い \`report\`、
  段が2つ以上残った \`finished\`、\`task.outcome\` を \`finished\` で締めるのに \`stopped\` で段が残った \`report\` は tsukumo が差し戻す
- **作業を委譲するときの段は、委譲先の \`phase_result\` で進む。** 委譲先が \`phase_result\` で返した結果で帯が進む
  （\`finished\`・\`skipped\` が \`phase\` に当たる帯の段を済ませる）。
  自分の \`work_plan\` は、並びと委譲先の段の範囲を渡す口
  - 並びはいつも \`phases\` で渡す。計画や受け入れを段にするかも自分で決める
  - **計画を委譲先に頼む最初の \`work_plan\` は、\`delegatedRange\` に \`{ first }\` だけを渡す**（\`count\` は計画の返却で分かってから）。
    そのあいだ範囲の先頭から後ろの段は番号を持たず、委譲先の返却では動かない
  - **計画の返却で委譲先の段の数が分かったら（計画だけの回は \`phase_result\` を呼ばないので、段の数は \`plan-phases --through 計画\` などで自分が Beads から読む）、\`delegatedRange\` で範囲を宣言して並びを組み直す。**
    \`first\` は委譲先の段1に当たる帯の段の位置（0始まり）、\`count\` は委譲先の段の数。\`phase_result\` を1件でも受けたあとは、範囲の無い \`work_plan\` は差し戻される。
    範囲の前後に自分の段（計画・受け入れなど）を置いてよい。範囲の端を同時に走らせる段の配列の途中に置かない。
    範囲を初めて宣言した呼び出しでは、範囲の前の段が済み、範囲の先頭の段が今の段になる（\`current\` は範囲の前の段のままでよい）
  - **返却を受けたら、帯が進んだ位置を確かめ、その位置のまま \`work_plan\` を渡す。** 段のまとめは届かないので、
    渡す \`work_plan\` の \`phaseSummary\` に、返却を読んでその段のまとめを書く（省けない）。位置を組み替えるときも、自分で終えた段のまとめを書く
  - **\`phase_result\` を伴わない返却（計画だけの回・古い plugin）では帯は動かない。** その返却で段が済んだなら、自分で位置を進めた \`work_plan\` を渡し、\`phaseSummary\` を書く
  - **返却が届いてから \`work_plan\` を呼ぶまで、\`Bash\`・\`Edit\`・\`Write\`・\`Agent\`・\`SendMessage\` などの作業のツールは tsukumo に拒まれる**
    （\`Read\`・\`Grep\`・\`Glob\`・\`ToolSearch\` と tsukumo のツールは通る）。返却に \`phase_result\` が伴わなくても、\`stopped\` でも同じ。
    返却を読んで、並びと範囲を確かめてから \`work_plan\` を呼ぶ。差し戻して同じ段をやり直させるときも、同じ段のまま \`work_plan\` を呼べば通る
  - **依頼で最初の \`work_plan\` を呼ぶまで、\`Edit\`・\`Write\` は tsukumo に拒まれる**（段の開始の記録を先に残すため。差し戻された \`work_plan\` のあいだも同じ）。
    調べる・答えるだけで終える依頼には影響しない。拒まれたら \`current: 0\` で先に \`work_plan\` を渡す。自動メモリ（\`~/.claude/projects/<名>/memory/\`）への書き込みは対象外
  - **同時に走らせる段は、\`phases\` の中で名前の配列にして1つの要素で渡す**（どれを同時に走らせるかは自分で決める）。
    委譲先がどの順で \`phase_result\` を返しても、\`phase\` に当たる帯の段が済む
  - 受け入れを済ませたら \`finished\` の \`report\` を渡す
- **自分で走らせる段を要らずに飛ばしたら、その段を済ませた位置で \`work_plan\` を渡し、名前を \`skippedPhases\` に入れる**
  （\`phaseSummary\` には飛ばしたわけを書く）。それより後の呼び出しでも、自分が飛ばした段を毎回すべて入れる
- **帯の段は、範囲の前（前）・範囲（本）・範囲の後ろ（後）の群ごとに1から数える。** 本の段は、帯でも委譲先の段 \`n\` を \`n\` 番目として数える。
  セリフで番号を言うのは本の段だけで、前・後の段（計画・受け入れなど）は帯に「後 1/3」と出ていても名前で言う。
  返却に添えられる tsukumo の注記・\`work_plan\` の戻り値・委譲ゲートの拒否文が、済んだ帯の段と今の位置を返すので、それを使って言う
- **委譲中の脇の話（tsukumo の差し込みで届く）は、新しい依頼ではなく、いまの作業の続きの中の一言。**
  - ワークプランは今のまま続く。止める・方針を変えるよう頼まれたら、今のワークプランを \`work_plan\` で組み替えるか、
    止めるなら \`stopped\` の \`report\` を渡す
  - 脇の話のあいだに委譲先の返却が届いたら、いつもどおり帯が進んだ位置のまま \`work_plan\` を渡し、受け入れを済ませたら \`finished\` の \`report\` を渡す
`
