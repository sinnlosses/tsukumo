// 質問の添え書き（`question_brief` ツールで `AskUserQuestion` の前に渡す、1問ぶんの判断の材料）の形。
// 添え書きは会話の内容そのものなので、ログや状態ファイルには書かず、画面に出す経路だけで扱う。

import { z } from "zod"

import { type FigureBlock, figureBlockSchema } from "../report/report-block.ts"

export type QuestionBriefOption = {
  /** 質問の選択肢の `label` と突き合わせる字。 */
  readonly label: string
  /** 選ぶとあとで戻せない選択肢か。 */
  readonly irreversible: boolean
  readonly figures: readonly FigureBlock[]
}

/** 事実の出どころ。`checked` はこのターンで打って確かめた、`copied` は文書やタスクの本文から写した。 */
export type QuestionBriefFactBasis = "checked" | "copied"

export type QuestionBriefFact = {
  readonly text: string
  readonly basis: QuestionBriefFactBasis
}

export type QuestionBriefCertainty = "high" | "medium" | "low"

/** おすすめの理由と確度。どの選択肢を勧めるかは、質問のラベル末尾のおすすめの印だけが持つ。 */
export type QuestionBriefRecommended = {
  readonly reason: string
  readonly certainty: QuestionBriefCertainty
}

export type QuestionBrief = {
  /** どの質問の添え書きか。その質問の `header` と同じ字。 */
  readonly header: string
  readonly whyAsk: string
  readonly facts: readonly QuestionBriefFact[]
  readonly recommended?: QuestionBriefRecommended
  readonly options: readonly QuestionBriefOption[]
}

const questionBriefOptionSchema = z.object({
  label: z.string().describe("AskUserQuestion のその選択肢の label と同じ字"),
  irreversible: z.boolean().default(false).describe("選ぶとあとで戻せないなら true"),
  figures: z
    .array(figureBlockSchema)
    .default([])
    .describe(
      "この選択肢を選んだときの形を見せる図（report の部品と同じ形）。見た目・画面の形・データやコードの構造を選ばせるなら必ず付ける",
    ),
})

const questionBriefFactSchema = z.object({
  text: z.string().describe("事実を1文で"),
  basis: z
    .enum(["checked", "copied"])
    .describe(
      "出どころ。checked は今のターンで打って確かめた、copied は文書やタスクの本文から写した",
    ),
})

const questionBriefRecommendedSchema = z.object({
  reason: z.string().describe("勧める理由を1〜2文で"),
  certainty: z.enum(["high", "medium", "low"]).describe("勧めることへの確度。high・medium・low"),
})

export const questionBriefSchema = z.object({
  header: z.string().describe("どの質問の添え書きか。AskUserQuestion のその質問の header と同じ字"),
  whyAsk: z
    .string()
    .describe(
      "書き手だけでは決められない理由。利用者の目的・好みのどこが分からないかを1〜2文で。書けないなら聞かずに進める",
    ),
  facts: z
    .array(questionBriefFactSchema)
    .describe("利用者がまだ見ていない事実（ツールの出力・読んだファイル・数）。1〜5件"),
  recommended: questionBriefRecommendedSchema
    .optional()
    .describe(
      "おすすめの理由と確度。選択肢のラベルに (推奨) を付けた質問だけ書き、付けないなら省く",
    ),
  options: z.array(questionBriefOptionSchema).describe("選択肢ごとの印と図。質問の選択肢と同じ数"),
}) satisfies z.ZodType<QuestionBrief>
