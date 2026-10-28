// `report` の塊の型をモデルにどう渡すか。
// `json-schema` は引数の JSON Schema に塊の型を全部書く。
// `short-type` は `figure` と `sections` を緩い形で受け、塊の型を `sections` の欄の説明に短い型の表記で書く（受理の検査は同じ zod）。
// `body-fence` は本文を Markdown の `body`（型つきフェンス入り）で受け、旧い `sections` は緩い形で残す。`body` と `sections` は同じ呼び出しに併記できない。
// `a2ui` は A2UI のカタログの部品の平らな一覧 `components` だけで受ける。

export const REPORT_SCHEMA_VARIANTS = [
  "json-schema",
  "short-type",
  "body-fence",
  "a2ui",
] as const satisfies readonly string[]

export type ReportSchemaVariant = (typeof REPORT_SCHEMA_VARIANTS)[number]
