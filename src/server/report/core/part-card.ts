// `report` の部品1種類の文法カード（JSON Schema と `components` の例1つ）。
// 型は `report` の定義と同じ部品の zod から出し、説明を手で写さない。

import { omit } from "remeda"
import { z } from "zod"

import { REPORT_COMPONENT_SCHEMAS } from "../../../shared/report/a2ui-report-catalog.ts"
import { PART_EXAMPLES } from "../../../shared/report/part-example-list.ts"

/** `report_part_card` ツールの説明文。 */
export const PART_CARD_TOOL_DESCRIPTION =
  "report の components に置く部品の JSON Schema と、components の例1つを、部品の名前を渡して引く。" +
  "JSON Schema は report の定義の部品と同じ。部品の書き方に迷ったときに、使う前に引く"

/** `report_part_card` の `component` の欄の説明。 */
export const PART_CARD_COMPONENT_DESCRIPTION =
  "部品の名前（component の値。例: Table・Graph・Chart）。知らない名前には引ける名前の一覧を返す"

/** 部品の名前を渡して引いた結果。知らない名前なら、引ける名前の一覧を言う文。 */
type PartCard =
  | { readonly kind: "card"; readonly text: string }
  | { readonly kind: "unknown-component"; readonly text: string }

export function partCardOf(component: string): PartCard {
  if (!isComponentName(component)) {
    return {
      kind: "unknown-component",
      text: `知らない部品の名前: ${JSON.stringify(component)}。引ける名前: ${COMPONENT_NAMES.join(", ")}`,
    }
  }
  return {
    kind: "card",
    text: [
      `部品 ${component} の文法（report の定義の部品と同じ JSON Schema）`,
      "JSON Schema:",
      JSON.stringify(
        omit(z.toJSONSchema(REPORT_COMPONENT_SCHEMAS[component], { io: "input" }), ["$schema"]),
      ),
      "例（components の要素。id は例の中で閉じている）:",
      JSON.stringify(PART_EXAMPLES[component]),
    ].join("\n"),
  }
}

const COMPONENT_NAMES = Object.keys(REPORT_COMPONENT_SCHEMAS)

function isComponentName(name: string): name is keyof typeof REPORT_COMPONENT_SCHEMAS {
  return Object.hasOwn(REPORT_COMPONENT_SCHEMAS, name)
}
