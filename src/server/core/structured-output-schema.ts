// 使い捨ての `query()` の `outputFormat: { type: "json_schema", schema }` に渡す JSON Schema を、検査と同じ zod の形から出す。

import { z } from "zod"

/**
 * zod の形から `outputFormat` の `schema` に渡せる JSON Schema を出す。
 * `$schema` が 2020-12（`z.toJSONSchema` の既定）だと SDK の子プロセスが
 * `no schema with key or ref` で終了するので draft-7 で出す。
 * `.refine` は JSON Schema に出ない。`.transform`・`z.preprocess` を含む形は投げる。
 */
export function structuredOutputSchema(schema: z.ZodType): Readonly<Record<string, unknown>> {
  return z.toJSONSchema(schema, { target: "draft-7" })
}
