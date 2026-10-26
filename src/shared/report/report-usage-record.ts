// `report` の塊の使われ方の記録の行の形。1行 = 描いた `report` 1回。
// 書いてよいのは時刻・セッションID・塊と記法の名前・数だけで、塊の中身・逃げ道の文字は入れない。

import { z } from "zod"

import { REPORT_ARGUMENT_FIELDS } from "./report-argument-size.ts"
import { REPORT_FIGURE_NONE_REASONS, reportFigureSchema } from "./report-block.ts"
import { REPORT_SHAPE_TAGS } from "./report-shape-tag.ts"
import { REPORT_GENRES, reportTaskSchema } from "./report-task.ts"
import { REPORT_SCHEMA_VARIANTS } from "./schema-variant.ts"

/**
 * 行の形の版。形か数え方を変えたら上げ、古い行と見分ける。
 * 欄を足したら版を上げ、集計は `MIN_FORMAT_VERSION` より古い行を読まない。
 * 集計は版で分母を切らず、欄を記録した行を分母にする。
 */
export const REPORT_USAGE_FORMAT_VERSION = 22 satisfies number

/** どの駆動で起こしたプロセスの行か（版19から）。`fake` は疑似セッションで、集計は既定で除く。 */
const reportUsageDriverSchema = z.enum(["sdk", "fake"])

export type ReportUsageDriver = z.infer<typeof reportUsageDriverSchema>

/** 引数の字数。全体と最上位の欄ごと（版14から）。渡した欄だけを数え、引き継いだ欄は数えない。 */
const argumentCharsSchema = z
  .object({
    total: z.number(),
    fields: z.partialRecord(z.enum(REPORT_ARGUMENT_FIELDS), z.number()).readonly(),
  })
  .readonly()

/** 引き継いだ欄の名前（版16から）。 */
const inheritedFieldsSchema = z.array(z.enum(REPORT_ARGUMENT_FIELDS)).readonly()

/** どちらの型の渡し方で受けたか（版17から）。 */
const reportSchemaVariantSchema = z.enum(REPORT_SCHEMA_VARIANTS)

/** 札が許さない塊の組と、その回に出た数（版13から）。 */
const forbiddenShapeBlockUsageSchema = z
  .object({
    shapeTag: z.enum(REPORT_SHAPE_TAGS),
    blockKind: z.enum(["table", "list", "text"]),
    count: z.number(),
  })
  .readonly()

export type ForbiddenShapeBlockUsage = z.infer<typeof forbiddenShapeBlockUsageSchema>

/** 節の札と、札が許さない塊の使われ方（版13から）。 */
const reportShapeTagUsageSchema = z
  .object({
    /** 節の順の札。札を省いた節は `unspecified`。`figure` の図は節に数えない。 */
    sectionShapeTags: z.array(z.enum([...REPORT_SHAPE_TAGS, "unspecified"])).readonly(),
    /** 節の順の、節の中の塊の種類（重複無し）。`sectionShapeTags` と同じ並び（版19から）。 */
    sectionBlockKinds: z.array(z.array(z.string()).readonly()).readonly(),
    /** 札が許さない塊を1つ以上含む節の数。 */
    forbiddenShapeSectionCount: z.number(),
    /** 札が許さない塊の組ごとの数。0の組は入れない。 */
    forbiddenShapeBlocks: z.array(forbiddenShapeBlockUsageSchema).readonly(),
  })
  .readonly()

export type ReportShapeTagUsage = z.infer<typeof reportShapeTagUsageSchema>

const FIGURE_KINDS = reportFigureSchema.options
  .map((option) => option.shape.kind.value)
  .filter((kind): kind is Exclude<typeof kind, "none"> => kind !== "none")

const figureKindFields = { figureKind: z.literal(FIGURE_KINDS) }

const noneFigureFields = {
  figureKind: z.literal("none"),
  noneReason: z.enum([...REPORT_FIGURE_NONE_REASONS, "unrecorded"]),
}

/**
 * `figure` の欄の記録（版6から）。`figureKind` は図の塊の `kind` か `none`、`noneReason` は `none` のときだけ。
 * 中身は持たない。
 */
const reportFigureUsageSchema = z.union([
  z.object(figureKindFields).readonly(),
  z.object(noneFigureFields).readonly(),
])

export type ReportFigureUsage = z.infer<typeof reportFigureUsageSchema>

/** 図の欄を除いた、受け付けた回の欄。 */
const acceptedFields = reportShapeTagUsageSchema.unwrap().extend({
  v: z.literal(REPORT_USAGE_FORMAT_VERSION),
  /** ISO 8601（オフセット付き）。行だけで時刻が決まる。 */
  at: z.string(),
  /** claude 側のセッションID。 */
  sessionId: z.string(),
  /** その回に出た塊の種類（重複無し）。 */
  blockKinds: z.array(z.string()).readonly(),
  /** その回に出た塊の欄（重複無し。版3から。`blockAside` は版12から、`beforeAfterRegion` は版15から）。 */
  blockFields: z.array(z.string()).readonly(),
  /** その回に逃げ道（`markdown` の塊）の外側に出た記法の種類（重複無し）。 */
  notations: z.array(z.string()).readonly(),
  /** その回に逃げ道の HTML の容れ物の中に出た記法の種類（重複無し）。 */
  containedNotations: z.array(z.string()).readonly(),
  /** その回に逃げ道に出た、塊の無い記法の種類（重複無し）。 */
  escapeNotations: z.array(z.string()).readonly(),
  /** その回に出た `list` の `style`（重複無し。版19から）。 */
  listStyles: z.array(z.string()).readonly(),
  /** その回に出た `mermaid` の図の種類（ソースの最初の語。重複無し。`figure` の図を含む。版19から）。 */
  mermaidKinds: z.array(z.string()).readonly(),
  /** どの駆動で起こしたプロセスの行か（版19から）。 */
  driver: reportUsageDriverSchema,
  /** 知らない種類で境界で落とした塊の数。 */
  unknownBlockCount: z.number(),
  /** `files` の塊に `modified` の項目があるか（版4から）。 */
  hasModifiedFiles: z.boolean(),
  /** `beforeAfter` か `image` の塊が1つでもあるか（版4から）。 */
  hasBeforeAfterOrImage: z.boolean(),
  /** `task` を渡した最終レポートか（版4から）。 */
  forTask: z.boolean(),
  /** 段1の図（`image`・`mermaid`・`graph`・`svg`。`beforeAfter` の側を含む）が1つでもあるか（版5から）。 */
  hasFigure: z.boolean(),
  /** このターンにメインが画像のファイルを `Read` したのに `image` の塊が無いか（版5から）。 */
  readImageWithoutImageBlock: z.boolean(),
  /** `text`・`list`・表のセルに出た強調の対の数の合計（版7から）。 */
  emphasisCount: z.number(),
  /** `graph` の辺の数の合計（版7から）。 */
  graphEdgeCount: z.number(),
  /** `graph` の辺のうちラベルの無いものの数の合計（版7から）。 */
  graphUnlabeledEdgeCount: z.number(),
  /** `graph` の節点数。複数あれば最大（版7から）。 */
  graphNodeCount: z.number(),
  /** `checks` に `unverified` の行が1つでもあるか（版8から）。 */
  hasUnverifiedCheck: z.boolean(),
  /** `unverified` の行があり、その全部の `howToVerify` が空でないか（版8から）。 */
  hasHowToVerify: z.boolean(),
  /** `task` の報告の種類。`task` の無いレポートは `none`（版9から）。 */
  taskGenre: z.enum([...REPORT_GENRES, "unspecified", "none"]),
  /** `task` の終わり方。`task` の無いレポートは `none`（版9から）。 */
  taskOutcome: z.enum([...reportTaskSchema.shape.outcome.options, "none"]),
  /** `favor` が空でないか（版9から）。 */
  hasFavor: z.boolean(),
  /** 本文に出典（URL）か `path:line` があるか、`code` の塊に `path` があるか（版9から）。 */
  hasSourceReference: z.boolean(),
  /** 行が2つ以下の表が1つでもあるか（版10から）。 */
  shortTable: z.boolean(),
  /** `keyFigures` が1つ以上あるか（版20から）。 */
  hasKeyFigures: z.boolean(),
  /** `keyFigures` が無いのに、結論の文にインラインコードの外の数が3つ以上あるか（版20から）。 */
  conclusionNumbersWithoutKeyFigures: z.boolean(),
  /** 引数の字数。全体と最上位の欄ごと（版14から）。渡した欄だけを数え、引き継いだ欄は数えない。 */
  argumentChars: argumentCharsSchema,
  /** 渡さずに、直前に差し戻した呼び出しから引き継いだ欄の名前（版16から）。 */
  inheritedFields: inheritedFieldsSchema,
  /** どちらの型の渡し方で受けたか（版17から）。 */
  reportSchema: reportSchemaVariantSchema,
})

/** 受け付けた `report` 1回の記録の行。 */
export const reportUsageRecordSchema = z.discriminatedUnion("figureKind", [
  acceptedFields.extend(figureKindFields).readonly(),
  acceptedFields.extend(noneFigureFields).readonly(),
])

export type ReportUsageRecord = z.infer<typeof reportUsageRecordSchema>

/**
 * 差し戻した `report` 1回の記録の行。受け付けの行と同じファイルに入り、`kind` の有無で見分ける（受け付けの行に `kind` は無い）。
 * 書いてよいのは時刻・セッションID・差し戻しの種類の名前・引数の字数・引き継いだ欄の名前・型の渡し方だけ。
 * `kind` が `counted` の行は、通した `report` が当たった数えるだけの条の名前を同じ形で持つ（版21から）。差し戻しの集計に混ぜない。
 * `nextCall` は `rejected` の行だけが持ち、次の呼び出しの結果。次が来ないまま記録を閉じたときは持たない（版22から）。
 */
export const reportRejectionRecordSchema = z
  .object({
    v: z.literal(REPORT_USAGE_FORMAT_VERSION),
    kind: z.enum(["rejected", "counted"]),
    /** ISO 8601（オフセット付き）。 */
    at: z.string(),
    sessionId: z.string(),
    reasons: z.array(z.string()).readonly(),
    /** どの駆動で起こしたプロセスの行か（版19から）。 */
    driver: reportUsageDriverSchema,
    /** 差し戻した呼び出しの引数の字数（版14から）。 */
    argumentChars: argumentCharsSchema,
    /** 差し戻した呼び出しが引き継いだ欄の名前（版16から）。 */
    inheritedFields: inheritedFieldsSchema,
    /** どちらの型の渡し方で受けたか（版17から）。 */
    reportSchema: reportSchemaVariantSchema,
    /**
     * 同じセッションの次の `report` の呼び出し。`reasons` はその呼び出しが差し戻された理由で、受け付けなら空。
     * `chars` はその引数の字数の合計。
     */
    nextCall: z
      .object({ reasons: z.array(z.string()).readonly(), chars: z.number() })
      .readonly()
      .optional(),
  })
  .readonly()

export type ReportRejectionRecord = z.infer<typeof reportRejectionRecordSchema>
