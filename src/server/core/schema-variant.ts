// `report` の入力をモデルにどう渡すか。
// `a2ui` は A2UI のカタログの部品の平らな一覧 `components` だけで受ける。

export const REPORT_SCHEMA_VARIANTS = ["a2ui"] as const satisfies readonly string[]

export type ReportSchemaVariant = (typeof REPORT_SCHEMA_VARIANTS)[number]
