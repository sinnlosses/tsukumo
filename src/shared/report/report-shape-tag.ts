// 形の札（節が表す内容の形）の名前。使われ方の記録の過去の行が持つ札を読み戻すために残す。

export const REPORT_SHAPE_TAGS = [
  "cause",
  "connection",
  "position",
  "state",
  "time",
  "order",
  "quantity",
  "choice",
  "attribute",
  "mapping",
  "comparison",
  "boundary",
  "parallel",
  "single",
] as const

export type ReportShapeTag = (typeof REPORT_SHAPE_TAGS)[number]

/** 読み戻した札。`unspecified` は札を省いた節（欄の無かった頃の transcript を含む）。 */
export type RecordedReportShapeTag = ReportShapeTag | "unspecified"
