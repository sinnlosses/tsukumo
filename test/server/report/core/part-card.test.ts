import { describe, expect, it } from "vitest"
import { z } from "zod"

import { partCardOf } from "../../../../src/server/report/core/part-card.ts"
import { namedWriterBlockSchema } from "../../../../src/shared/report/report-block.ts"
import { arrangedBlockSchemasOf } from "../../../../src/shared/report/row-panel-block.ts"
import { descriptionsIn, missingDescriptions } from "../../../fixture/json-schema-description.ts"

const LEAF_BRANCHES = namedWriterBlockSchema.options
const { rowBlockSchema, panelBlockSchema } = arrangedBlockSchemasOf(namedWriterBlockSchema)
const ARRANGED_BRANCHES = [rowBlockSchema, panelBlockSchema]
const BRANCHES = [...LEAF_BRANCHES, ...ARRANGED_BRANCHES]
const KINDS = BRANCHES.map((branch) => branch.shape.kind.value)

describe("partCardOf", () => {
  it.each(BRANCHES.map((branch) => [branch.shape.kind.value, branch] as const))(
    "%s の例は、その部品の schema を通る",
    (kind, branch) => {
      const example = exampleIn(cardText(kind))

      expect(branch.safeParse(example).success).toBe(true)
    },
  )

  it.each(LEAF_BRANCHES.map((branch) => [branch.shape.kind.value, branch] as const))(
    "%s のカードは、部品の JSON Schema の説明を1つも落とさない",
    (kind, branch) => {
      const descriptions = descriptionsIn(z.toJSONSchema(branch, { io: "input" }))

      expect(missingDescriptions(descriptions, cardText(kind))).toEqual([])
    },
  )

  it.each(ARRANGED_BRANCHES.map((branch) => [branch.shape.kind.value, branch] as const))(
    "%s のカードは、子の部品の型を展開せず名前で指し、自分の欄の説明は落とさない",
    (kind, branch) => {
      const { $defs: _definitions, ...own } = z.toJSONSchema(branch, { io: "input" })
      const text = cardText(kind)

      expect(missingDescriptions(descriptionsIn(own), text)).toEqual([])
      expect(text).toContain("ReportBlock[]")
      expect(text).not.toContain("type ReportBlock")
      expect(text).not.toContain("type GraphBlock")
    },
  )

  it("説明の照合は、説明を1つ消したカードの欠けを見つける", () => {
    const branch = namedWriterBlockSchema.options.find(
      (option) => option.shape.kind.value === "graph",
    )
    const descriptions = descriptionsIn(z.toJSONSchema(branch ?? z.never(), { io: "input" }))
    const removed = descriptions[0] ?? ""
    const text = cardText("graph").replace(`// ${removed.split("\n")[0] ?? ""}\n`, "")

    expect(removed).not.toBe("")
    expect(missingDescriptions(descriptions, text)).toEqual([removed])
  })

  it.each(["files", "", "Graph"])("知らない種類 %j には、引ける種類の一覧を返す", (kind) => {
    const card = partCardOf(kind)

    expect(card.kind).toBe("unknown-kind")
    for (const known of KINDS) {
      expect(card.text).toContain(known)
    }
  })

  it("引ける種類は files を除く19種類の葉と row・panel", () => {
    expect(KINDS).toHaveLength(21)
    expect(KINDS).not.toContain("files")
    expect(KINDS).toEqual(expect.arrayContaining(["row", "panel"]))
  })
})

function cardText(kind: string): string {
  const card = partCardOf(kind)
  if (card.kind !== "card") {
    throw new Error(`${kind} のカードが組めなかった`)
  }
  return card.text
}

/** カードの「例:」の次の行を JSON として読む。 */
function exampleIn(text: string): unknown {
  const lines = text.split("\n")
  return JSON.parse(lines[lines.indexOf("例:") + 1] ?? "")
}
