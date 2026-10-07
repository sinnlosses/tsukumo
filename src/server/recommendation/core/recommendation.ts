// おすすめの札の問い合わせの指示文・依頼の文面・出力の形（JSON Schema）・出力の検査・モデルと時間切れ。
// 純関数と定数だけで、`query()` は起こさない。

import { isPlainObject, uniqueBy } from "remeda"

import {
  MAX_RECOMMENDATION_CARDS,
  type RecommendationCard,
} from "../../../shared/recommendation/recommendation-card.ts"
import type { RecommendationCandidate } from "./recommendation-candidate.ts"
import type { StructuredQuery } from "./structured-query.ts"

/** 問い合わせを起こすモデル（軽いもの）。 */
export const RECOMMENDATION_MODEL = "haiku"

/** 問い合わせ1回の時間切れ（ミリ秒）。 */
export const RECOMMENDATION_TIMEOUT_MS = 60_000

/** 理由の1行の上限（文字）。 */
export const RECOMMENDATION_REASON_CHARS = 40

/** 「前回の続き」の候補のキー。タスクの候補のキーはタスクの ID。 */
const RESUME_KEY = "resume"

/** `query()` の `systemPrompt` をそのまま置き換える指示文。 */
export const RECOMMENDATION_INSTRUCTION = `あなたは、これから作業を始める利用者に、どれから始めるとよいかを選んで見せる役目だけを持つ。

渡された候補から、始めるのにおすすめのものを1〜${String(MAX_RECOMMENDATION_CARDS)}件、おすすめの順に選び、それぞれに理由を1行で書く。

## 候補

- \`key: ${RESUME_KEY}\` は「前回の続き」。前のセッションでやり残したことの続きだが、中身は渡されない
- ほかの候補はタスク。\`key\` はタスクの ID で、要約と、そのタスクを待っている未完了のタスクの ID が添えてある

## 理由の書き方

- 次の3つのどれか1つが読んで分かる言い方にする
  - 効き目: ほかの作業より先に効いてくる・あとの作業が楽になる・困りごとが減る
  - 軽さ: 小さく片づく・肩ならしにちょうどいい・時間のとれる日にまとめてやるとよい
  - つながり: 前の作業の続きから入れる
- 「前回の続き」を選ぶときの理由は「つながり」で書く（中身は知らないので、中身を推し量って書かない）
- 数を競わせる言い方（「最速」「いちばん多い」「最も」「No.1」など）はしない
- タスクの ID を理由に書かない（札に ID が並んで出る）
- ${String(RECOMMENDATION_REASON_CHARS)}字まで、改行を含めない。です・ます調にしない

## 出力

- \`cards\` に、おすすめの順で \`key\`（候補の key をそのまま）と \`reason\` を並べる
- 同じ key を2回書かない`

/** 候補の並びから `query()` に渡すものを組む。 */
export function recommendationQuery(
  candidates: readonly RecommendationCandidate[],
): StructuredQuery {
  return {
    model: RECOMMENDATION_MODEL,
    systemPrompt: RECOMMENDATION_INSTRUCTION,
    prompt: ["## 候補", ...candidates.map(candidateLine)].join("\n"),
    schema: recommendationSchema(candidates),
  }
}

/**
 * 受け取った `structured_output` を検査して札の並びにする。
 * 候補に無いキー・前に出たキー・空か改行入りか上限超えの理由の件は1件ずつ落とし、{@link MAX_RECOMMENDATION_CARDS} 件で切る。
 * 形そのものが崩れている・1件も残らないときは `undefined`（何も配らない側に倒す）。
 */
export function parseRecommendationResult(
  value: unknown,
  candidates: readonly RecommendationCandidate[],
): readonly RecommendationCard[] | undefined {
  if (!isPlainObject(value) || !Array.isArray(value.cards)) {
    return undefined
  }
  const cards = value.cards
    .map((entry) => toCard(entry, candidates))
    .filter((card): card is RecommendationCard => card !== undefined)
  const kept = uniqueBy(cards, cardKey).slice(0, MAX_RECOMMENDATION_CARDS)
  return kept.length === 0 ? undefined : kept
}

/** 候補1件を依頼の文面の1行にする。 */
function candidateLine(candidate: RecommendationCandidate): string {
  if (candidate.kind === "resume") {
    return `- key: ${RESUME_KEY} / 前回の続き（中身は渡さない）`
  }
  const waitedBy = candidate.waitedBy.length === 0 ? "なし" : candidate.waitedBy.join(", ")
  return `- key: ${candidate.id} / 待っているタスク: ${waitedBy} / 要約: ${candidate.summary}`
}

/** 出力の JSON Schema（`outputFormat: { type: "json_schema", schema }` にそのまま渡す）。`key` は候補のキーに限る。 */
function recommendationSchema(
  candidates: readonly RecommendationCandidate[],
): Readonly<Record<string, unknown>> {
  return {
    type: "object",
    properties: {
      cards: {
        type: "array",
        minItems: 1,
        maxItems: MAX_RECOMMENDATION_CARDS,
        items: {
          type: "object",
          properties: {
            key: { type: "string", enum: candidates.map(candidateKey) },
            reason: { type: "string" },
          },
          required: ["key", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["cards"],
    additionalProperties: false,
  }
}

/** `cards` の1件を検査して札にする（候補に無いキー・理由の崩れは `undefined`）。 */
function toCard(
  value: unknown,
  candidates: readonly RecommendationCandidate[],
): RecommendationCard | undefined {
  if (!isPlainObject(value) || typeof value.key !== "string") {
    return undefined
  }
  const reason = toReason(value.reason)
  const candidate = candidates.find((each) => candidateKey(each) === value.key)
  if (reason === undefined || candidate === undefined) {
    return undefined
  }
  return candidate.kind === "resume"
    ? { kind: "resume", reason }
    : { kind: "task", taskId: candidate.id, reason }
}

/** 空でない・改行を含まない・{@link RECOMMENDATION_REASON_CHARS} 字以下の1行（前後の空白は落とす）。 */
function toReason(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed === "" ||
    trimmed.includes("\n") ||
    [...trimmed].length > RECOMMENDATION_REASON_CHARS
    ? undefined
    : trimmed
}

function candidateKey(candidate: RecommendationCandidate): string {
  return candidate.kind === "resume" ? RESUME_KEY : candidate.id
}

function cardKey(card: RecommendationCard): string {
  return card.kind === "resume" ? RESUME_KEY : card.taskId
}
