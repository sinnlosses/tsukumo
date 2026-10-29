// 旧い変種の `report` の引数（`sections`・`body`）を、節と塊の並びに読む。
//
// 会話の内容がここを通る。ログにもファイルにも書かない。

import { z } from "zod"

import { parseReportBody } from "../../../shared/report/body-fence.ts"
import { aside, fold, inlineText, omittable } from "../../../shared/report/report-block-field.ts"
import type { DeepReadonly } from "../../../shared/report/report-block-field.ts"
import {
  namedWriterBlockSchema,
  parseReportBlocks,
  REPORT_BLOCK_KINDS,
  type ReportBlock,
} from "../../../shared/report/report-block.ts"

const rowBlockSchema = z.object({
  kind: z.literal("row"),
  blocks: z.array(namedWriterBlockSchema).min(2).max(4),
  fold,
  aside,
})

const panelBlockSchema = z.object({
  kind: z.literal("panel"),
  title: inlineText,
  blocks: z.array(namedWriterBlockSchema).min(1),
  fold,
  aside,
})

const arrangedBlockSchema = z.discriminatedUnion("kind", [rowBlockSchema, panelBlockSchema])

/** 節に置いた塊。葉の塊か、葉を並べる `row`・`panel`。 */
export type LegacyBlock = ReportBlock | DeepReadonly<z.infer<typeof arrangedBlockSchema>>

export type LegacySection = {
  readonly heading: string
  readonly blocks: readonly LegacyBlock[]
}

export type ParsedLegacySections = {
  readonly sections: readonly LegacySection[]
  /** 知らない種類（{@link REPORT_BLOCK_KINDS} に無い `kind`）で落とした塊の数。 */
  readonly unknownBlockCount: number
}

/** 塊を1つずつ検証するために、節の見出しだけを先に読む形。 */
const looseSectionSchema = z.object({
  heading: omittable(z.string(), ""),
  blocks: z.array(z.unknown()),
})

const blockKindSchema = z.object({ kind: z.string() })

/**
 * `report` の引数の `sections` を取り出す。塊ごとに検証し、崩れた塊と知らない種類の塊は落とす
 * （塊1つの読み損ねでレポートを捨てない）。塊が残らない節と、配列でない値は無いものとする。
 */
export function parseLegacySections(value: unknown): ParsedLegacySections {
  const sections = z.array(z.unknown()).safeParse(value)
  if (!sections.success) {
    return { sections: [], unknownBlockCount: 0 }
  }
  const parsed = sections.data.flatMap((candidate) => {
    const section = looseSectionSchema.safeParse(candidate)
    return section.success ? [section.data] : []
  })
  return {
    sections: parsed.flatMap(({ heading, blocks }) => {
      const valid = blocks.flatMap(parseLegacyBlock)
      return valid.length === 0 ? [] : [{ heading, blocks: valid }]
    }),
    unknownBlockCount: parsed.flatMap(({ blocks }) => blocks).filter(isUnknownKindBlock).length,
  }
}

/**
 * `report` の `body`（Markdown。引数が文字列だったころの transcript の `body` も）を節1つに読む。
 * 知らない種類の塊は無いので `unknownBlockCount` は 0。空白だけの本文は節を持たない。
 */
export function parseLegacyBody(body: string): ParsedLegacySections & {
  /** `body` の型つきフェンスのうち、読めずに素のコードブロックへ落としたものの数。 */
  readonly brokenFenceCount: number
} {
  const { blocks, brokenFenceCount } = parseReportBody(body)
  return {
    sections: blocks.length === 0 ? [] : [{ heading: "", blocks }],
    unknownBlockCount: 0,
    brokenFenceCount,
  }
}

function parseLegacyBlock(block: unknown): readonly LegacyBlock[] {
  const arranged = arrangedBlockSchema.safeParse(block)
  return arranged.success ? [arranged.data] : parseReportBlocks([block])
}

function isUnknownKindBlock(block: unknown): boolean {
  const kind = blockKindSchema.safeParse(block)
  return kind.success && !REPORT_BLOCK_KINDS.some((known) => known === kind.data.kind)
}
