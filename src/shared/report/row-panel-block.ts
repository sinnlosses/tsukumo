// 節の中で部品を横に並べる `row` と、題つきの枠 `panel` の形。子は葉の部品だけで、`row`・`panel` は入らない。

import { z } from "zod"

import { aside, fold, inlineText } from "./report-block-field.ts"
import type { ReportBlock, SectionBlock } from "./report-block.ts"

/**
 * 葉の部品の合併から `row` と `panel` の形を組む。
 * 葉の合併（`namedWriterBlockSchema`）は実行時に import せず引数で受ける（読み込みの循環を作らない）。
 */
export function arrangedBlockSchemasOf<Leaf extends z.ZodType>(leaf: Leaf) {
  return {
    rowBlockSchema: z.object({
      kind: z.literal("row"),
      blocks: z.array(leaf).min(2).max(4),
      fold,
      aside,
    }),
    panelBlockSchema: z.object({
      kind: z.literal("panel"),
      title: inlineText,
      blocks: z.array(leaf).min(1),
      fold,
      aside,
    }),
  }
}

/** 節の塊の並びの `row`・`panel` のすぐ後ろに、その子を挟んだ並び。容れ物自身の欄と子の欄の両方を見るときに使う。 */
export function blocksWithChildrenOf(blocks: readonly SectionBlock[]): readonly SectionBlock[] {
  return blocks.flatMap((block): readonly SectionBlock[] =>
    block.kind === "row" || block.kind === "panel" ? [block, ...block.blocks] : [block],
  )
}

/** `row`・`panel` を子の並びに開いた葉の部品の並び。書き手の順のまま。 */
export function leafBlocksOf(blocks: readonly SectionBlock[]): readonly ReportBlock[] {
  return blocks.flatMap((block): readonly ReportBlock[] =>
    block.kind === "row" || block.kind === "panel" ? block.blocks : [block],
  )
}
