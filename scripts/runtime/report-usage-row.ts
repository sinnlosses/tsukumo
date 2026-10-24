// レポートの使われ方の集計が読む記録の1行の形（版ごとの欄の違い）と、疑似セッションの行の見分け方。
// 欄を足した版を `*_FORMAT_VERSION` で名指し、集計の表の分母を版で切る。

import { z } from "zod"

/** 欄（`blockFields`）を記録する前の版。 */
export const FIELDLESS_FORMAT_VERSION = 2

const commonRecordShape = {
  blockKinds: z.array(z.string()),
  notations: z.array(z.string()),
  containedNotations: z.array(z.string()),
  escapeNotations: z.array(z.string()),
  unknownBlockCount: z.number(),
}

/** 欄を記録し、前後図・画像の有無を記録する前の版。 */
const VISUALLESS_FORMAT_VERSION = 3

/** modified の表の分母になる最初の版（前後図・画像の有無を記録した）。 */
export const MODIFIED_FORMAT_VERSION = 4

const visualRecordShape = {
  blockFields: z.array(z.string()),
  hasModifiedFiles: z.boolean(),
  hasBeforeAfterOrImage: z.boolean(),
  forTask: z.boolean(),
  ...commonRecordShape,
}

/** 段1の図の有無を記録し、`figure` を記録する前の版。 */
export const FIGURE_FIELDLESS_FORMAT_VERSION = 5

const figureRecordShape = {
  hasFigure: z.boolean(),
  readImageWithoutImageBlock: z.boolean(),
  ...visualRecordShape,
}

const figureFieldSchema = z.union([
  z.object({ figureKind: z.literal("none"), noneReason: z.string() }),
  z.object({ figureKind: z.string() }),
])

/** `figure` を記録し、強調と graph の数を記録する前の版。 */
const COUNTLESS_FORMAT_VERSION = 6

/** 強調と graph の数の表の分母になる最初の版。 */
export const COUNT_FORMAT_VERSION = 7

const countRecordShape = {
  emphasisCount: z.number(),
  graphEdgeCount: z.number(),
  graphUnlabeledEdgeCount: z.number(),
  graphNodeCount: z.number(),
}

/** 確かめ方の表の分母になる最初の版。 */
export const HOW_TO_VERIFY_FORMAT_VERSION = 8

const howToVerifyRecordShape = {
  hasUnverifiedCheck: z.boolean(),
  hasHowToVerify: z.boolean(),
}

/** 報告の種類の表の分母になる最初の版。 */
export const GENRE_FORMAT_VERSION = 9

const genreRecordShape = {
  taskGenre: z.string(),
  taskOutcome: z.string(),
  hasFavor: z.boolean(),
  hasSourceReference: z.boolean(),
}

/** 2行以下の表の割合の分母になる最初の版。 */
export const SHORT_TABLE_FORMAT_VERSION = 10

const shortTableRecordShape = {
  shortTable: z.boolean(),
}

/** `stats` の `series` / `better` を欄で数える最初の版（行の形は版10と同じ）。 */
const SERIES_FORMAT_VERSION = 11

/** 欄 `blockAside` を記録し始めた版。行の形は版10と同じ。 */
const BLOCK_ASIDE_FORMAT_VERSION = 12

/** 節の札と、札が許さない塊の数を記録し始めた版。 */
export const SHAPE_TAG_FORMAT_VERSION = 13

const shapeTagRecordShape = {
  sectionShapeTags: z.array(z.string()),
  forbiddenShapeSectionCount: z.number(),
  forbiddenShapeBlocks: z.array(
    z.object({ shapeTag: z.string(), blockKind: z.string(), count: z.number() }),
  ),
}

/** 引数の字数を記録し始めた版。 */
export const ARGUMENT_CHARS_FORMAT_VERSION = 14

/** 欄 `beforeAfterRegion` を記録し始めた版。行の形は版14と同じ。 */
const REGION_FORMAT_VERSION = 15

/** 差し戻しから引き継いだ欄の名前（`inheritedFields`）を記録し始めた版。 */
const INHERITED_FIELDS_FORMAT_VERSION = 16

/** 型の渡し方（`reportSchema`）を記録し始めた版。 */
const REPORT_SCHEMA_FORMAT_VERSION = 17

/** 逃げ道の記法を構文木で数え始めた版。 */
const NOTATION_TREE_FORMAT_VERSION = 18

/** 節ごとの塊の種類・`list` の style・`mermaid` の図種・駆動を記録し始めた版。 */
export const SECTION_BLOCK_FORMAT_VERSION = 19

/** `keyFigures` の有無と、結論に数が並ぶのに無いかを記録し始めた版。 */
export const KEY_FIGURES_FORMAT_VERSION = 20

const keyFiguresRecordShape = {
  hasKeyFigures: z.boolean(),
  conclusionNumbersWithoutKeyFigures: z.boolean(),
}

const sectionBlockRecordShape = {
  sectionBlockKinds: z.array(z.array(z.string())),
  listStyles: z.array(z.string()),
  mermaidKinds: z.array(z.string()),
  driver: z.enum(["sdk", "fake"]),
}

/** 疑似セッションの行の印。`driver` を持たない行は `sessionId` が固定の値で見分ける。 */
const FAKE_SESSION_ID = "fake-session"

const fakeMarkSchema = z.object({
  driver: z.string().optional(),
  sessionId: z.string().optional(),
})

const argumentCharsSchema = z.object({
  total: z.number(),
  fields: z.record(z.string(), z.number()),
})

export const recordSchema = z.union([
  z.object({ v: z.literal(FIELDLESS_FORMAT_VERSION), ...commonRecordShape }),
  z.object({
    v: z.literal(VISUALLESS_FORMAT_VERSION),
    blockFields: z.array(z.string()),
    ...commonRecordShape,
  }),
  z.object({ v: z.literal(MODIFIED_FORMAT_VERSION), ...visualRecordShape }),
  z.object({ v: z.literal(FIGURE_FIELDLESS_FORMAT_VERSION), ...figureRecordShape }),
  z.object({ v: z.literal(COUNTLESS_FORMAT_VERSION), ...figureRecordShape }).and(figureFieldSchema),
  z
    .object({
      v: z.literal(COUNT_FORMAT_VERSION),
      ...figureRecordShape,
      ...countRecordShape,
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.literal(HOW_TO_VERIFY_FORMAT_VERSION),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.literal(GENRE_FORMAT_VERSION),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
      ...genreRecordShape,
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.literal(SHORT_TABLE_FORMAT_VERSION),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
      ...genreRecordShape,
      ...shortTableRecordShape,
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.union([z.literal(SERIES_FORMAT_VERSION), z.literal(BLOCK_ASIDE_FORMAT_VERSION)]),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
      ...genreRecordShape,
      ...shortTableRecordShape,
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.literal(SHAPE_TAG_FORMAT_VERSION),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
      ...genreRecordShape,
      ...shortTableRecordShape,
      ...shapeTagRecordShape,
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.union([z.literal(ARGUMENT_CHARS_FORMAT_VERSION), z.literal(REGION_FORMAT_VERSION)]),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
      ...genreRecordShape,
      ...shortTableRecordShape,
      ...shapeTagRecordShape,
      argumentChars: argumentCharsSchema,
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.union([
        z.literal(INHERITED_FIELDS_FORMAT_VERSION),
        z.literal(REPORT_SCHEMA_FORMAT_VERSION),
        z.literal(NOTATION_TREE_FORMAT_VERSION),
      ]),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
      ...genreRecordShape,
      ...shortTableRecordShape,
      ...shapeTagRecordShape,
      argumentChars: argumentCharsSchema,
      inheritedFields: z.array(z.string()),
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.literal(SECTION_BLOCK_FORMAT_VERSION),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
      ...genreRecordShape,
      ...shortTableRecordShape,
      ...shapeTagRecordShape,
      argumentChars: argumentCharsSchema,
      inheritedFields: z.array(z.string()),
      ...sectionBlockRecordShape,
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.literal(KEY_FIGURES_FORMAT_VERSION),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
      ...genreRecordShape,
      ...shortTableRecordShape,
      ...shapeTagRecordShape,
      argumentChars: argumentCharsSchema,
      inheritedFields: z.array(z.string()),
      ...sectionBlockRecordShape,
      ...keyFiguresRecordShape,
    })
    .and(figureFieldSchema),
])
export type UsageRecord = z.infer<typeof recordSchema>

/** 差し戻した呼び出しの行（`kind: "rejected"`）。受け付けの行には `kind` が無い。 */
export const rejectionSchema = z.object({
  v: z.number().int().min(VISUALLESS_FORMAT_VERSION).max(KEY_FIGURES_FORMAT_VERSION),
  kind: z.literal("rejected"),
  reasons: z.array(z.string()),
  argumentChars: argumentCharsSchema.optional(),
  inheritedFields: z.array(z.string()).optional(),
})
export type RejectionRecord = z.infer<typeof rejectionSchema>

/** 疑似セッションの行か。`driver` を持つ行（版19以降）はそれで、持たない行は `sessionId` が固定の値か。 */
export function isFakeSessionRow(raw: unknown): boolean {
  const mark = fakeMarkSchema.safeParse(raw)
  if (!mark.success) {
    return false
  }
  return mark.data.driver === undefined
    ? mark.data.sessionId === FAKE_SESSION_ID
    : mark.data.driver === "fake"
}
