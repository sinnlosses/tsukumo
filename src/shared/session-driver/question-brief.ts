// 質問の添え書き（`question_brief` ツールで `AskUserQuestion` の前に渡す、1問ぶんの判断の材料）の形。
// 添え書きは会話の内容そのものなので、ログや状態ファイルには書かず、画面に出す経路だけで扱う。

import { z } from "zod"

import { type FigureBlock, figureBlockSchema } from "../report/report-block.ts"

export type QuestionBriefOption = {
  /** 質問の選択肢の `label` と突き合わせる字。 */
  readonly label: string
  readonly pros: readonly string[]
  readonly cons: readonly string[]
  /** 判断の軸ごとの評価。`QuestionBrief.axes` と同じ並び・同じ数。 */
  readonly byAxis: readonly string[]
  /** 選ぶとあとで戻せない選択肢か。 */
  readonly irreversible: boolean
  readonly figures: readonly FigureBlock[]
}

export type QuestionBrief = {
  /** どの質問の添え書きか。その質問の `header` と同じ字。 */
  readonly header: string
  readonly background: string
  readonly axes: readonly string[]
  readonly options: readonly QuestionBriefOption[]
}

const questionBriefOptionSchema = z.object({
  label: z.string().describe("AskUserQuestion のその選択肢の label と同じ字"),
  pros: z.array(z.string()).default([]).describe("良い点。1項目1文"),
  cons: z.array(z.string()).default([]).describe("悪い点。1項目1文"),
  byAxis: z
    .array(z.string())
    .describe("判断の軸ごとの評価を短い語で。axes と同じ順・同じ数（表の1列になる）"),
  irreversible: z.boolean().default(false).describe("選ぶとあとで戻せないなら true"),
  figures: z
    .array(figureBlockSchema)
    .default([])
    .describe("この選択肢を選んだときの形を見せる図（report の塊と同じ形）"),
})

export const questionBriefSchema = z.object({
  header: z.string().describe("どの質問の添え書きか。AskUserQuestion のその質問の header と同じ字"),
  background: z.string().describe("背景。なぜ今聞くか・何が決まっていないかを2〜3文で"),
  axes: z.array(z.string()).describe("判断の軸。速さ・戻しやすさのような短い語"),
  options: z.array(questionBriefOptionSchema).describe("選択肢ごとの評価。質問の選択肢と同じ数"),
}) satisfies z.ZodType<QuestionBrief>
