// レポートの使われ方の集計が読む記録の1行の形と、疑似セッションの行の見分け方。
// 読むのは `MIN_FORMAT_VERSION` から現行の版までの行で、形は欄の有無で決まる2つ。
// 欄を足したら、下限の版の行に無い欄は `.optional()` で足し、下限を上げたら形を畳む。

import { z } from "zod"

import { REPORT_USAGE_FORMAT_VERSION } from "../../src/shared/report/report-usage-record.ts"

/** 読む版の下限。これより古い行は読まない。 */
const MIN_FORMAT_VERSION = 17

const figureFieldSchema = z.union([
  z.object({ figureKind: z.literal("none"), noneReason: z.string() }),
  z.object({ figureKind: z.string() }),
])

const argumentCharsSchema = z.object({
  total: z.number(),
  fields: z.record(z.string(), z.number()),
})

const baseRecordShape = {
  blockKinds: z.array(z.string()),
  notations: z.array(z.string()),
  containedNotations: z.array(z.string()),
  escapeNotations: z.array(z.string()),
  unknownBlockCount: z.number(),
  blockFields: z.array(z.string()),
  hasModifiedFiles: z.boolean(),
  hasBeforeAfterOrImage: z.boolean(),
  forTask: z.boolean(),
  hasFigure: z.boolean(),
  readImageWithoutImageBlock: z.boolean(),
  emphasisCount: z.number(),
  graphEdgeCount: z.number(),
  graphUnlabeledEdgeCount: z.number(),
  graphNodeCount: z.number(),
  hasUnverifiedCheck: z.boolean(),
  hasHowToVerify: z.boolean(),
  taskGenre: z.string(),
  taskOutcome: z.string(),
  hasFavor: z.boolean(),
  hasSourceReference: z.boolean(),
  shortTable: z.boolean(),
  sectionShapeTags: z.array(z.string()),
  forbiddenShapeSectionCount: z.number(),
  forbiddenShapeBlocks: z.array(
    z.object({ shapeTag: z.string(), blockKind: z.string(), count: z.number() }),
  ),
  argumentChars: argumentCharsSchema,
  inheritedFields: z.array(z.string()),
}

const versionSchema = z.number().int().min(MIN_FORMAT_VERSION).max(REPORT_USAGE_FORMAT_VERSION)

const baseRecordSchema = z.object({ v: versionSchema, ...baseRecordShape }).and(figureFieldSchema)

/** 節ごとの塊の欄（`sectionBlockKinds`）を持つ行。`keyFigures` の欄は、記録した行にだけある。 */
const sectionBlockRecordSchema = z
  .object({
    v: versionSchema,
    ...baseRecordShape,
    sectionBlockKinds: z.array(z.array(z.string())),
    listStyles: z.array(z.string()),
    mermaidKinds: z.array(z.string()),
    driver: z.enum(["sdk", "fake"]),
    hasKeyFigures: z.boolean().optional(),
    conclusionNumbersWithoutKeyFigures: z.boolean().optional(),
  })
  .and(figureFieldSchema)

export const recordSchema = z.union([sectionBlockRecordSchema, baseRecordSchema])
export type UsageRecord = z.infer<typeof recordSchema>
export type SectionBlockRecord = z.infer<typeof sectionBlockRecordSchema>

export type KeyFiguresRow = {
  readonly forTask: boolean
  readonly hasKeyFigures: boolean
  readonly conclusionNumbersWithoutKeyFigures: boolean
}

/** `keyFigures` の欄を記録した行だけを、欄の揃った形で返す。 */
export function keyFiguresRowOf(record: SectionBlockRecord): readonly KeyFiguresRow[] {
  const { forTask, hasKeyFigures, conclusionNumbersWithoutKeyFigures } = record
  return hasKeyFigures === undefined || conclusionNumbersWithoutKeyFigures === undefined
    ? []
    : [{ forTask, hasKeyFigures, conclusionNumbersWithoutKeyFigures }]
}

/** 差し戻した呼び出しの行（`kind: "rejected"`）。受け付けの行には `kind` が無い。 */
export const rejectionSchema = z.object({
  v: z.number().int().min(MIN_FORMAT_VERSION).max(REPORT_USAGE_FORMAT_VERSION),
  kind: z.literal("rejected"),
  reasons: z.array(z.string()),
  argumentChars: argumentCharsSchema,
  inheritedFields: z.array(z.string()),
})
export type RejectionRecord = z.infer<typeof rejectionSchema>

/** 疑似セッションの印。`driver` を持たない行は `sessionId` が固定の値で見分ける。 */
const FAKE_SESSION_ID = "fake-session"

const fakeMarkSchema = z.object({
  driver: z.string().optional(),
  sessionId: z.string().optional(),
})

/** 疑似セッションの行か。`driver` を持つ行はそれで、持たない行は `sessionId` が固定の値か。 */
export function isFakeSessionRow(raw: unknown): boolean {
  const mark = fakeMarkSchema.safeParse(raw)
  if (!mark.success) {
    return false
  }
  return mark.data.driver === undefined
    ? mark.data.sessionId === FAKE_SESSION_ID
    : mark.data.driver === "fake"
}
