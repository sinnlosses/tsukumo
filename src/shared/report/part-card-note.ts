// 部品カード（`report_part_card`）の JSON Schema にだけ載せる、部品の欄の説明。
// `.describe` と違って zod の globalRegistry に入れないので、`report` の道具の定義には載らない。

import { z } from "zod"

/** カードにだけ載せる説明の置き場。鍵は {@link partCardNote} が返した schema。 */
export const PART_CARD_NOTES = z.registry<{ readonly description: string }>()

/** `schema` の写しに、カードにだけ載せる説明を付けて返す。元の `schema` には付けない。 */
export function partCardNote<Schema extends z.ZodType>(
  schema: Schema,
  description: string,
): Schema {
  const noted = schema.clone()
  PART_CARD_NOTES.add(noted, { description })
  return noted
}
