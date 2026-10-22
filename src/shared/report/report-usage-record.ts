// `report` の塊の使われ方の記録の行の形。1行 = 描いた `report` 1回。
// 書いてよいのは時刻・セッションID・塊と記法の名前・数だけで、塊の中身・逃げ道の文字は入れない。

import type { ReportArgumentChars, ReportArgumentField } from "./report-argument-chars.ts"
import type { RecordedFigureNoneReason, RecordedReportFigure } from "./report-block.ts"
import type { ForbiddenBlock, RecordedReportShapeTag, ReportShapeTag } from "./report-shape-tag.ts"
import type { ReportGenre, ReportTaskOutcome } from "./report-task.ts"
import type { ReportSchemaVariant } from "./schema-variant.ts"

/** 行の形の版。形か数え方を変えたら上げ、古い行と見分ける。 */
export const REPORT_USAGE_FORMAT_VERSION = 18 satisfies number

/** 札が許さない塊の組と、その回に出た数（版13から）。 */
export type ForbiddenShapeBlockUsage = {
  readonly shapeTag: ReportShapeTag
  readonly blockKind: ForbiddenBlock["kind"]
  readonly count: number
}

/** 節の札と、札が許さない塊の使われ方（版13から）。 */
export type ReportShapeTagUsage = {
  /** 節の順の札。札を省いた節は `unspecified`。`figure` の図は節に数えない。 */
  readonly sectionShapeTags: readonly RecordedReportShapeTag[]
  /** 札が許さない塊を1つ以上含む節の数。 */
  readonly forbiddenShapeSectionCount: number
  /** 札が許さない塊の組ごとの数。0の組は入れない。 */
  readonly forbiddenShapeBlocks: readonly ForbiddenShapeBlockUsage[]
}

/**
 * `figure` の欄の記録（版6から）。`figureKind` は図の塊の `kind` か `none`、`noneReason` は `none` のときだけ。
 * 中身は持たない。
 */
export type ReportFigureUsage =
  | { readonly figureKind: Exclude<RecordedReportFigure["kind"], "none"> }
  | { readonly figureKind: "none"; readonly noneReason: RecordedFigureNoneReason }

export type ReportUsageRecord = ReportFigureUsage &
  ReportShapeTagUsage & {
    readonly v: typeof REPORT_USAGE_FORMAT_VERSION
    /** ISO 8601（オフセット付き）。行だけで時刻が決まる。 */
    readonly at: string
    /** claude 側のセッションID。 */
    readonly sessionId: string
    /** その回に出た塊の種類（重複無し）。 */
    readonly blockKinds: readonly string[]
    /** その回に出た塊の欄（重複無し。版3から。`blockAside` は版12から、`beforeAfterRegion` は版15から）。 */
    readonly blockFields: readonly string[]
    /** その回に逃げ道（`markdown` の塊）の外側に出た記法の種類（重複無し）。 */
    readonly notations: readonly string[]
    /** その回に逃げ道の HTML の容れ物の中に出た記法の種類（重複無し）。 */
    readonly containedNotations: readonly string[]
    /** その回に逃げ道に出た、塊の無い記法の種類（重複無し）。 */
    readonly escapeNotations: readonly string[]
    /** 知らない種類で境界で落とした塊の数。 */
    readonly unknownBlockCount: number
    /** `files` の塊に `modified` の項目があるか（版4から）。 */
    readonly hasModifiedFiles: boolean
    /** `beforeAfter` か `image` の塊が1つでもあるか（版4から）。 */
    readonly hasBeforeAfterOrImage: boolean
    /** `task` を渡した最終レポートか（版4から）。 */
    readonly forTask: boolean
    /** 段1の図（`image`・`mermaid`・`graph`・`svg`。`beforeAfter` の側を含む）が1つでもあるか（版5から）。 */
    readonly hasFigure: boolean
    /** このターンにメインが画像のファイルを `Read` したのに `image` の塊が無いか（版5から）。 */
    readonly readImageWithoutImageBlock: boolean
    /** `text`・`list`・表のセルに出た強調の対の数の合計（版7から）。 */
    readonly emphasisCount: number
    /** `graph` の辺の数の合計（版7から）。 */
    readonly graphEdgeCount: number
    /** `graph` の辺のうちラベルの無いものの数の合計（版7から）。 */
    readonly graphUnlabeledEdgeCount: number
    /** `graph` の節点数。複数あれば最大（版7から）。 */
    readonly graphNodeCount: number
    /** `checks` に `unverified` の行が1つでもあるか（版8から）。 */
    readonly hasUnverifiedCheck: boolean
    /** `unverified` の行があり、その全部の `howToVerify` が空でないか（版8から）。 */
    readonly hasHowToVerify: boolean
    /** `task` の報告の種類。`task` の無いレポートは `none`（版9から）。 */
    readonly taskGenre: ReportGenre | "unspecified" | "none"
    /** `task` の終わり方。`task` の無いレポートは `none`（版9から）。 */
    readonly taskOutcome: ReportTaskOutcome | "none"
    /** `favor` が空でないか（版9から）。 */
    readonly hasFavor: boolean
    /** 本文に出典（URL）か `path:line` があるか、`code` の塊に `path` があるか（版9から）。 */
    readonly hasSourceReference: boolean
    /** 行が2つ以下の表が1つでもあるか（版10から）。 */
    readonly shortTable: boolean
    /** 引数の字数。全体と最上位の欄ごと（版14から）。渡した欄だけを数え、引き継いだ欄は数えない。 */
    readonly argumentChars: ReportArgumentChars
    /** 渡さずに、直前に差し戻した呼び出しから引き継いだ欄の名前（版16から）。 */
    readonly inheritedFields: readonly ReportArgumentField[]
    /** どちらの型の渡し方で受けたか（版17から）。 */
    readonly reportSchema: ReportSchemaVariant
  }

/**
 * 差し戻した `report` 1回の記録の行。受け付けの行と同じファイルに入り、`kind` の有無で見分ける（受け付けの行に `kind` は無い）。
 * 書いてよいのは時刻・セッションID・差し戻しの種類の名前・引数の字数・引き継いだ欄の名前・型の渡し方だけ。
 */
export type ReportRejectionRecord = {
  readonly v: typeof REPORT_USAGE_FORMAT_VERSION
  readonly kind: "rejected"
  /** ISO 8601（オフセット付き）。 */
  readonly at: string
  readonly sessionId: string
  readonly reasons: readonly string[]
  /** 差し戻した呼び出しの引数の字数（版14から）。 */
  readonly argumentChars: ReportArgumentChars
  /** 差し戻した呼び出しが引き継いだ欄の名前（版16から）。 */
  readonly inheritedFields: readonly ReportArgumentField[]
  /** どちらの型の渡し方で受けたか（版17から）。 */
  readonly reportSchema: ReportSchemaVariant
}
