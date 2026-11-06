// 旧い `BeforeAfter`（a2ui の部品と、`components` 以前の `beforeAfter` の塊）を読む受け口。
// 旧い形は `Compare` の `before-after` に書き換えた生の値にして、`shared` の parse に渡す。`shared` は `Compare` だけを知る。
//
// 会話の内容がここを通る。ログにもファイルにも書かない。

import { isPlainObject } from "remeda"
import { z } from "zod"

import {
  type A2uiWrittenComponent,
  a2uiWrittenComponentSchema,
} from "../../../../shared/report/a2ui-report-catalog.ts"
import { compareSideSchema } from "../../../../shared/report/report-block-diagram.ts"
import { aside, fold, inlineText } from "../../../../shared/report/report-block-field.ts"

/** 書き手が書いた部品1つを、旧い `BeforeAfter` を書き換えてから読む。読めれば1件、形に合わなければ0件。 */
export function readWrittenComponent(raw: unknown): readonly A2uiWrittenComponent[] {
  const parsed = a2uiWrittenComponentSchema.safeParse(compareOfLegacyComponent(raw))
  return parsed.success ? [parsed.data] : []
}

/**
 * 旧い塊 `{kind: "beforeAfter", …}` を `Compare` の塊の生の値にする。`row`・`panel` の中の塊も同じ。
 * 旧い塊でない値と、旧い形に合わない値はそのまま返す。
 */
export function compareOfLegacyBlock(raw: unknown): unknown {
  if (!isPlainObject(raw)) {
    return raw
  }
  if (raw.kind === "beforeAfter") {
    const fields = compareFieldsOf(raw)
    return fields === undefined ? raw : { kind: "compare", ...fields }
  }
  if ((raw.kind === "row" || raw.kind === "panel") && Array.isArray(raw.blocks)) {
    return { ...raw, blocks: raw.blocks.map(compareOfLegacyBlock) }
  }
  return raw
}

/** `retrospective` の `blocks` の旧い塊を書き換える。ほかの値はそのまま返す。 */
export function compareOfLegacyRetrospective(raw: unknown): unknown {
  return isPlainObject(raw) && Array.isArray(raw.blocks)
    ? { ...raw, blocks: raw.blocks.map(compareOfLegacyBlock) }
    : raw
}

/**
 * 旧い部品 `{component: "BeforeAfter", …}` を `Compare` の `before-after` の生の値にする。
 * 旧い部品でない値と、旧い形に合わない値はそのまま返す（後ろの parse が落とす）。
 */
function compareOfLegacyComponent(raw: unknown): unknown {
  if (!isPlainObject(raw) || raw.component !== "BeforeAfter") {
    return raw
  }
  const fields = compareFieldsOf(raw)
  return fields === undefined ? raw : { id: raw.id, component: "Compare", ...fields }
}

/** 旧い `BeforeAfter` の欄。側は `Compare` の側から見出しを除いた形。 */
const legacyBeforeAfterSchema = z.object({
  title: inlineText,
  before: compareSideSchema,
  after: compareSideSchema,
  fold,
  aside,
})

/** 旧い欄を `Compare` の欄（`id`・`kind`・`component` を除く）にする。側の見出しは空で、札は「前」「後」になる。形に合わなければ undefined。 */
function compareFieldsOf(raw: unknown) {
  const parsed = legacyBeforeAfterSchema.safeParse(raw)
  return parsed.success
    ? {
        title: parsed.data.title,
        relation: "before-after" as const,
        sides: [
          { ...parsed.data.before, heading: "" },
          { ...parsed.data.after, heading: "" },
        ],
        fold: parsed.data.fold,
        aside: parsed.data.aside,
      }
    : undefined
}
