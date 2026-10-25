// 立ち絵1枚から作るダイアログの欄の値を生成する問い合わせの、指示文・依頼の文面・出力の形（`generatedCharacterSchema` から導く JSON Schema）・出力の検査。
// `query()` は起こさず、渡された口を呼ぶだけ。
// 材料は利用者が置いた立ち絵1枚だけで、会話・人格・ほかのパックは入れない。

import { isPlainObject } from "remeda"

import { parseCharacterPackName } from "../../../shared/character-pack/character.ts"
import {
  type GeneratedCharacter,
  generatedCharacterSchema,
} from "../../../shared/character-pack/generated-character.ts"
import { MAX_PERSONA_BODY_LENGTH } from "../../../shared/character-pack/persona-section.ts"
import type { ModelAlias } from "../../../shared/command.ts"
import {
  parsePromptImage,
  type PromptImageSource,
} from "../../../shared/session-driver/prompt-image.ts"
import { structuredOutputSchema } from "../../core/structured-output-schema.ts"
import { runWithDeadline, type StructuredQuery } from "../../core/structured-query.ts"

/** 問い合わせを起こすモデル。 */
const CHARACTER_GENERATION_MODEL = "opus" satisfies ModelAlias

/** 問い合わせ1回の締め切り（ミリ秒）。 */
const CHARACTER_GENERATION_TIMEOUT_MS = 120_000

/** 問い合わせを1回走らせて `structured_output` をそのまま返す口。 */
export type CharacterGenerationPort = (
  request: StructuredQuery,
  signal: AbortSignal,
) => Promise<unknown>

/**
 * 立ち絵の data URL から欄の値を生成する。
 * 画像として読めない・問い合わせが投げた・`signal` か締め切りで中断した・返った値が形に合わないときは undefined。
 */
export async function generateCharacter(
  query: CharacterGenerationPort,
  portrait: string,
  signal: AbortSignal,
): Promise<GeneratedCharacter | undefined> {
  const image = parsePromptImage(portrait)
  if (image === undefined) {
    return undefined
  }
  try {
    return await runWithDeadline(
      signal,
      CHARACTER_GENERATION_TIMEOUT_MS,
      async (bounded) =>
        toGeneratedCharacter(await query(characterGenerationQuery(image), bounded)),
      undefined,
    )
  } catch {
    return undefined
  }
}

/** 画像1枚から `query()` に渡すものを組む。 */
function characterGenerationQuery(image: PromptImageSource): StructuredQuery {
  return {
    kind: "character-generation",
    model: CHARACTER_GENERATION_MODEL,
    systemPrompt: CHARACTER_GENERATION_INSTRUCTION,
    prompt: "この立ち絵のキャラクターの id・名前・差し色2つ・人格を書いてください。",
    images: [image],
    schema: structuredOutputSchema(generatedCharacterSchema),
  }
}

/**
 * 受け取った `structured_output` を検査して欄の値にする。
 * id だけはパックの名前として通らなければ空文字に畳み、ほかの欄は残す（id は利用者が打てばよい）。
 * それ以外の欄が1つでも形に合わなければ undefined。
 */
function toGeneratedCharacter(value: unknown): GeneratedCharacter | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }
  const id = typeof value.id === "string" ? (parseCharacterPackName(value.id) ?? "") : ""
  const parsed = generatedCharacterSchema.safeParse({ ...value, id })
  return parsed.success ? parsed.data : undefined
}

const CHARACTER_GENERATION_INSTRUCTION = `あなたは、利用者が置いた立ち絵1枚から、ターミナルで利用者と一緒にソフトウェアの仕事をするキャラクターの設定を書く役目だけを持つ。書いたものは利用者が見直して直してから使う。

## 書くもの

- \`name\`: 画面や吹き出しに出る名前。立ち絵から受ける印象に合う短い名前（日本語でよい）
- \`id\`: 保存するフォルダの名前。名前をローマ字か英語にした、半角の小文字英数字とハイフンだけの40字までの語（例: \`kitsune-bi\`）
- \`accent\`: 仕事中の画面の差し色。立ち絵の主な色から採った \`#rrggbb\`。暗い地の上で文字や線の色として読める明るさにする
- \`chatAccent\`: 雑談中の画面の差し色。\`accent\` と並べて見分けられる、立ち絵の中の別の色の \`#rrggbb\`。明るさは \`accent\` と同じ考え方で選ぶ
- \`persona\`: ペルソナ（Markdown）。下の骨組みで書く

## 人格の骨組み

次の順に書く。全体で ${String(MAX_PERSONA_BODY_LENGTH / 2)} 字までを目安にする。

1. \`# <名前>\` の見出しと、何者かを言う導入を2〜3文。導入のあとに「この文面は人格と話し方だけを決める。ソフトウェアエンジニアリングの遂行能力と技術的な正確さは一切落とさず、振る舞いと発言の味付けだけを変える」という趣旨を1段落で書く
2. \`## どういう子か\`: 生い立ちを1〜2文と、性格の箇条書きを4〜6個
3. \`## 好きなもの\`: 雑談で聞かれたときの答えの拠り所であって毎回話題に出すものではない、と1文断ってから、3〜5個の箇条書き（何が好きかと、その理由）
4. \`## 口調・一人称\`: 一人称・相手の呼び方・語尾・笑い方・感嘆符の使い方を箇条書きで
5. \`## 変えないこと\`: コード品質・正確性・安全性の規範はキャラクター性より優先すること、技術的な判断の中身はふざけないこと、利用者が真剣なトーンやキャラなしの返答を求めたら合わせることを箇条書きで

## 書かないもの

- \`## 覚えたこと\` の見出しと節（あとで tsukumo が書き足す場所）
- 表情の名前・\`speak\` などのツールの呼び方・レポートの書き方・モデルごとの掛け声（どれも tsukumo の側が決める）
- 立ち絵から読み取れない固有の事実を、事実として断定すること（作品名・実在の人物との関係など）`
