import { describe, expect, it } from "vitest"
import { z } from "zod"

import { partCardOf } from "../../../../src/server/report/core/part-card.ts"
import { REPORT_COMPONENT_SCHEMAS } from "../../../../src/shared/report/a2ui-report-catalog.ts"
import { descriptionsIn } from "../../../fixture/json-schema-description.ts"

const ENTRIES = Object.entries(REPORT_COMPONENT_SCHEMAS)
const NAMES = ENTRIES.map(([name]) => name)

describe("partCardOf", () => {
  it.each(ENTRIES)("%s の例は、その部品の schema を通る", (name, schema) => {
    const example = examplesIn(cardText(name))

    const own = example.filter((part) => part.component === name)
    expect(own).toHaveLength(1)
    expect(schema.safeParse(own[0]).success).toBe(true)
  })

  it.each(ENTRIES)(
    "%s のカードは、部品の JSON Schema の説明を1つも落とさない（$defs の中も含む）",
    (name, schema) => {
      const descriptions = descriptionsIn(z.toJSONSchema(schema, { io: "input" }))

      expect(missing(descriptions, cardText(name))).toEqual([])
    },
  )

  it("説明の照合は、説明を1つ消したカードの欠けを見つける", () => {
    const descriptions = descriptionsIn(
      z.toJSONSchema(REPORT_COMPONENT_SCHEMAS.Graph, { io: "input" }),
    )
    const removed = descriptions[0] ?? ""
    const text = cardText("Graph").replace(JSON.stringify(removed).slice(1, -1), "")

    expect(removed).not.toBe("")
    expect(missing(descriptions, text)).toContain(removed)
  })

  it("$defs を持つ部品のカードは $defs ごと載せる", () => {
    for (const name of ["BeforeAfter", "Graph", "Svg"]) {
      expect(cardText(name)).toContain('"$defs"')
    }
  })

  it.each(["table", "graph", "files", ""])(
    "知らない名前 %j には、引ける名前の一覧を返す",
    (name) => {
      const card = partCardOf(name)

      expect(card.kind).toBe("unknown-component")
      for (const known of NAMES) {
        expect(card.text).toContain(known)
      }
    },
  )

  it("引ける名前は 26 部品", () => {
    expect(NAMES).toHaveLength(26)
  })
})

function cardText(name: string): string {
  const card = partCardOf(name)
  if (card.kind !== "card") {
    throw new Error(`${name} のカードが組めなかった`)
  }
  return card.text
}

/** カードの JSON のまま入った説明のうち、載っていないもの。 */
function missing(descriptions: readonly string[], text: string): readonly string[] {
  return descriptions.filter(
    (description) => !text.includes(JSON.stringify(description).slice(1, -1)),
  )
}

/** カードの「例」の次の行を JSON の配列として読む。 */
function examplesIn(text: string) {
  const lines = text.split("\n")
  const index = lines.findIndex((line) => line.startsWith("例"))
  return z.array(z.looseObject({ component: z.string() })).parse(JSON.parse(lines[index + 1] ?? ""))
}
