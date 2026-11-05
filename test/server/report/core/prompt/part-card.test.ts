import { describe, expect, it } from "vitest"
import { z } from "zod"

import { partCardOf } from "../../../../../src/server/report/core/prompt/part-card.ts"
import { a2uiStructureFaults } from "../../../../../src/server/report/core/rules/structure.ts"
import { REPORT_COMPONENT_SCHEMAS } from "../../../../../src/shared/report/a2ui-report-catalog.ts"
import { descriptionsIn } from "../../../../fixture/json-schema-description.ts"

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
    for (const name of ["Compare", "Graph", "Svg"]) {
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

  it("引ける名前は 31 部品", () => {
    expect(NAMES).toHaveLength(31)
  })

  it.each(["ParameterSlider", "ParameterCheckBox", "Stats", "Paragraph", "Chart"])(
    "%s のカードに、式を結ぶ例が載り、構造の検査に通る",
    (name) => {
      const text = cardText(name)
      const heading = text.split("\n").findIndex((line) => line.startsWith("式を結ぶ例"))
      const parts = z.array(z.unknown()).parse(JSON.parse(text.split("\n")[heading + 1] ?? ""))

      expect(heading).toBeGreaterThan(0)
      expect(JSON.stringify(parts)).toMatch(/"call":"(expr|format)"/)
      expect(a2uiStructureFaults(parts)).toEqual([])
    },
  )

  it("式を結ぶ例の無い部品のカードに、式の例の節は載らない", () => {
    expect(cardText("Table")).not.toContain("式を結ぶ例")
  })

  it("Trace のカードに、状態と出力の欄と例が載る", () => {
    const text = cardText("Trace")

    expect(text).toContain('"status"')
    expect(text).toContain('"output"')
    expect(examplesIn(text)[0]?.component).toBe("Trace")
  })

  it("DescriptionList のカードに、名前と値の欄と例が載る", () => {
    const text = cardText("DescriptionList")

    expect(text).toContain('"term"')
    expect(text).toContain('"description"')
    expect(examplesIn(text)[0]?.component).toBe("DescriptionList")
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
