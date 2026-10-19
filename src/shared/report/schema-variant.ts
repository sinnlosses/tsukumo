// `report` の塊の型をモデルにどう渡すか。
// `json-schema` は引数の JSON Schema に塊の型を全部書く。
// `short-type` は `figure` と `sections` を緩い形で受け、塊の型を `sections` の欄の説明に短い型の表記で書く（受理の検査は同じ zod）。

export const REPORT_SCHEMA_VARIANTS = [
  "json-schema",
  "short-type",
] as const satisfies readonly string[]

export type ReportSchemaVariant = (typeof REPORT_SCHEMA_VARIANTS)[number]
