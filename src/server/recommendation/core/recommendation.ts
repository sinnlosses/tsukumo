// おすすめのカードの問い合わせの指示文・依頼の文面・出力の形（zod。JSON Schema はそこから導く）・出力の検査・モデルと時間切れ。
// 純関数と定数だけで、`query()` は起こさない。

import { uniqueBy } from "remeda"
import { z } from "zod"

import type { RecommendationCard } from "../../../shared/recommendation/recommendation-card.ts"
import type { TaskDifficulty } from "../../../shared/repository/task-summary.ts"
import type { ModelAlias } from "../../../shared/session/run-setting-value.ts"
import { structuredOutputSchema } from "../../core/query/structured-output-schema.ts"
import type { StructuredQuery } from "../../core/query/structured-query.ts"
import type { RecommendationCandidate } from "./recommendation-candidate.ts"

/** 問い合わせ1回の時間切れ（ミリ秒）。 */
export const RECOMMENDATION_TIMEOUT_MS = 60_000

/** 理由の1行の上限（文字）。 */
const RECOMMENDATION_REASON_CHARS = 40

/** 「前回の続き」の候補のキー。タスクの候補のキーはタスクの ID。 */
const RESUME_KEY = "resume"

/** 難しさを依頼の文面に書く語。 */
const DIFFICULTY_WORD = {
  haiku: "軽い",
  sonnet: "ふつう",
  opus: "重い",
} as const satisfies Record<TaskDifficulty, string>

/** `query()` の `systemPrompt` をそのまま置き換える指示文。 */
const RECOMMENDATION_INSTRUCTION = `あなたは、これから作業を始める利用者に、並べてある始め方それぞれのおすすめの理由を書いて見せる役目だけを持つ。

渡された候補は、先に手を付けるとよい順にもう選んで並べてある。候補を選び直さず、並べ替えず、すべての候補に理由を1行ずつ書く。

## 候補

- \`key: ${RESUME_KEY}\` は「前回の続き」。前のセッションでやり残したことの続きだが、中身は渡されない
- ほかの候補はタスク。\`key\` はタスクの ID で、要約と、並べた決め手が添えてある
  - 印: 利用者が付けた「急ぎ」「大事」。付いていなければ「なし」
  - 待っているタスク: このタスクが済むと着手できるようになるタスクの件数
  - 難しさ: 軽い・ふつう・重い。分からなければ「不明」
  - 前の作業: 「済んでいる」は、前の作業が済んで着手できるようになったタスク。「なし」は単独のタスク

## 理由の書き方

- 次の3つのどれか1つが読んで分かる言い方にする。添えてある決め手に当てはまるものから選ぶ
  - 効き目: 印が「急ぎ」か「大事」、または待っているタスクが1件以上（先に片づけたい・あとの作業が動く）
  - つながり: 前の作業が「済んでいる」（前の作業の続きから入れる）
  - 軽さ: 難しさが「軽い」（小さく片づく・肩ならしにちょうどいい）
- 難しさが「軽い」でないタスクに「軽さ」を書かない。待っているタスクが0件のタスクに「あとの作業が動く」と書かない
- 当てはまる決め手が無いタスクは、要約から読める効き目（何が良くなるか）を書く
- 「前回の続き」の理由は「つながり」で書く（中身は知らないので、中身を推し量って書かない）
- 候補どうしで同じ言い回しを繰り返さない
- 数を競わせる言い方（「最速」「いちばん多い」「最も」「No.1」など）はしない
- タスクの ID を理由に書かない（カードに ID が並んで出る）
- ${String(RECOMMENDATION_REASON_CHARS)}字まで、改行を含めない。です・ます調にしない

## 出力

- \`cards\` に、渡された順のまま、すべての候補の \`key\`（候補の key をそのまま）と \`reason\` を並べる
- 同じ key を2回書かない`

/** 候補の並びと問い合わせを起こすモデルから `query()` に渡すものを組む。 */
export function recommendationQuery(
  candidates: readonly RecommendationCandidate[],
  model: ModelAlias,
): StructuredQuery {
  return {
    kind: "recommendation",
    images: [],
    model,
    systemPrompt: RECOMMENDATION_INSTRUCTION,
    prompt: ["## 候補", ...candidates.map(candidateLine)].join("\n"),
    schema: structuredOutputSchema(recommendationSchema(candidates)),
  }
}

/**
 * 受け取った `structured_output` を検査して、理由の付いた札を候補の順に並べる。
 * 候補に無いキー・前に出たキー・空か改行入りか上限超えの理由の件は1件ずつ落とす。
 * 形そのものが崩れている・1件も残らないときは `undefined`（何も配らない側に倒す）。
 */
export function parseRecommendationResult(
  value: unknown,
  candidates: readonly RecommendationCandidate[],
): readonly RecommendationCard[] | undefined {
  const outer = z.object({ cards: z.array(z.unknown()) }).safeParse(value)
  if (!outer.success) {
    return undefined
  }
  const written = uniqueBy(
    outer.data.cards
      .map((entry) => toCard(entry, candidates))
      .filter((card): card is RecommendationCard => card !== undefined),
    cardKey,
  )
  const kept = candidates.flatMap((candidate) => {
    const card = written.find((each) => cardKey(each) === candidateKey(candidate))
    return card === undefined ? [] : [card]
  })
  return kept.length === 0 ? undefined : kept
}

/** 候補1件を依頼の文面の1行にする。 */
function candidateLine(candidate: RecommendationCandidate): string {
  if (candidate.kind === "resume") {
    return `- key: ${RESUME_KEY} / 前回の続き（中身は渡さない）`
  }
  return [
    `- key: ${candidate.id}`,
    `印: ${markWords(candidate)}`,
    `待っているタスク: ${String(candidate.waitedBy.length)}件`,
    `難しさ: ${candidate.difficulty === undefined ? "不明" : DIFFICULTY_WORD[candidate.difficulty]}`,
    `前の作業: ${candidate.followsDoneWork ? "済んでいる" : "なし"}`,
    `要約: ${candidate.summary}`,
  ].join(" / ")
}

/** 利用者が高く付けた緊急度と重要度を、依頼の文面の語にする。どちらも高くなければ「なし」。 */
function markWords(candidate: Extract<RecommendationCandidate, { readonly kind: "task" }>): string {
  const words = [
    ...(candidate.urgency === "high" ? ["急ぎ"] : []),
    ...(candidate.importance === "high" ? ["大事"] : []),
  ]
  return words.length === 0 ? "なし" : words.join("・")
}

/** 札1件の形。`key` は候補のキーに限り、`reason` は空でない・改行を含まない・{@link RECOMMENDATION_REASON_CHARS} 字以下の1行（前後の空白は落とす）。 */
function cardSchema(candidates: readonly RecommendationCandidate[]) {
  return z.object({
    key: z.enum(candidates.map(candidateKey)),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(RECOMMENDATION_REASON_CHARS)
      .refine((reason) => !reason.includes("\n")),
  })
}

function recommendationSchema(candidates: readonly RecommendationCandidate[]) {
  return z.object({
    cards: z.array(cardSchema(candidates)).min(1).max(candidates.length),
  })
}

/** `cards` の1件を検査して札にする（候補に無いキー・理由の崩れは `undefined`）。 */
function toCard(
  value: unknown,
  candidates: readonly RecommendationCandidate[],
): RecommendationCard | undefined {
  const parsed = cardSchema(candidates).safeParse(value)
  if (!parsed.success) {
    return undefined
  }
  const { key, reason } = parsed.data
  const candidate = candidates.find((each) => candidateKey(each) === key)
  if (candidate === undefined) {
    return undefined
  }
  return candidate.kind === "resume"
    ? { kind: "resume", reason }
    : { kind: "task", taskId: candidate.id, reason }
}

function candidateKey(candidate: RecommendationCandidate): string {
  return candidate.kind === "resume" ? RESUME_KEY : candidate.id
}

function cardKey(card: RecommendationCard): string {
  return card.kind === "resume" ? RESUME_KEY : card.taskId
}
