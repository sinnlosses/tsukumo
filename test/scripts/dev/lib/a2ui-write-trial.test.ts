import { describe, expect, test } from "vitest"

import {
  catalogCard,
  extractComponents,
  judgeComponents,
  requestedCards,
  trialConditions,
  type CatalogDocument,
} from "../../../../scripts/dev/lib/a2ui-write-trial.ts"
import {
  buildReportCatalogDocument,
  REPORT_COMPONENT_SCHEMAS,
} from "../../../../src/shared/report/a2ui-report-catalog.ts"

const report = {
  id: "root",
  component: "Report",
  conclusion: ["架空の結論"],
  children: ["s1"],
}
const section = { id: "s1", component: "Section", heading: "架空の節", children: ["p1"] }
const paragraph = { id: "p1", component: "Paragraph", text: "架空の地の文" }

describe("judgeComponents", () => {
  test("規約に沿った一覧は違反が無く、節の数を数える", () => {
    const judged = judgeComponents([report, section, paragraph])

    expect(judged.faults).toEqual([])
    expect(judged.sectionCount).toBe(1)
  })

  test("必須の欄を欠いた部品は入力検査の層で落ちる", () => {
    const judged = judgeComponents([report, section, { id: "p1", component: "Paragraph" }])

    expect(judged.faults.map((fault) => fault.source)).toEqual(["schema"])
    expect(judged.retryText).toContain("Input validation error")
  })

  test("Report の子に Paragraph を置くと構造の検査で落ちる", () => {
    const judged = judgeComponents([{ ...report, children: ["s1", "p1"] }, section, paragraph])

    expect(judged.faults).toEqual([{ source: "structure", code: "report-child-not-section" }])
    expect(judged.retryText).toContain("VALIDATION_FAILED")
  })

  test("filterable の無い表を ChoicePicker が結ぶと path の整合の違反になる", () => {
    const table = {
      id: "t1",
      component: "Table",
      title: "架空の表",
      columns: ["案件", "種別"],
      rows: [["架空の案件", "甲"]],
    }
    const picker = {
      id: "pick",
      component: "ChoicePicker",
      label: "種別",
      options: [{ label: "甲", value: "甲" }],
      value: { path: "/view/t1/filter" },
    }

    const judged = judgeComponents([
      report,
      { ...section, children: ["pick", "t1"] },
      picker,
      table,
    ])

    expect(judged.faults).toEqual([{ source: "structure", code: "filter-target-not-filterable" }])
    expect(judged.usedControls).toBe(true)
  })

  test("配列でない出力は入力検査の層で落ちる", () => {
    expect(judgeComponents(undefined).faults).toEqual([
      { source: "schema", code: "not-a-json-array" },
    ])
  })
})

describe("extractComponents", () => {
  test("コードフェンスの中の配列を取る", () => {
    expect(extractComponents('```json\n[{"id":"root"}]\n```')).toEqual([{ id: "root" }])
  })

  test("前後に説明があっても配列を取る", () => {
    expect(extractComponents('次のとおり。\n[{"id":"a"}]\n以上。')).toEqual([{ id: "a" }])
  })

  test("配列が無ければ undefined", () => {
    expect(extractComponents("配列は無い")).toBeUndefined()
  })
})

describe("requestedCards", () => {
  test("CARD の行で引かれた、カタログにある部品名だけを重複なく取る", () => {
    expect(requestedCards("CARD Table\nCARD Table\nCARD Unknown\nCARD Row")).toEqual([
      "Table",
      "Row",
    ])
  })
})

describe("catalogCard", () => {
  const document = buildReportCatalogDocument()

  test("全部の部品でカードが組め、断片から再帰で辿った参照先の定義が全部残る", () => {
    for (const name of Object.keys(REPORT_COMPONENT_SCHEMAS)) {
      const card = catalogCard(name, document, undefined)
      const embedded: unknown = JSON.parse(card.text)

      expect(localReferencesOf(embedded)).toSatisfy((references: readonly string[]) =>
        references.every((reference) => card.definitions.includes(reference)),
      )
    }
  })

  test("定義を持つ部品（BeforeAfter）のカードは、その定義を含む", () => {
    expect(catalogCard("BeforeAfter", document, undefined).definitions).toContain("BeforeAfterSide")
  })

  test("参照先の定義が文書に欠けていれば投げる", () => {
    const rest = Object.fromEntries(
      Object.entries(document.$defs).filter(([name]) => name !== "BeforeAfterSide"),
    )
    const broken: CatalogDocument = { ...document, $defs: rest }

    expect(() => catalogCard("BeforeAfter", broken, undefined)).toThrow("BeforeAfterSide")
  })
})

describe("trialConditions", () => {
  test("載せ方 2 つで 32 件、操作できる部品の題材は 8 件", () => {
    const conditions = trialConditions()

    expect(conditions).toHaveLength(32)
    expect(conditions.filter((entry) => entry.topic === "T3" || entry.topic === "T4")).toHaveLength(
      8,
    )
  })
})

function localReferencesOf(node: unknown): readonly string[] {
  if (Array.isArray(node)) {
    return node.flatMap(localReferencesOf)
  }
  if (typeof node !== "object" || node === null) {
    return []
  }
  return Object.entries(node).flatMap(([key, value]) =>
    key === "$ref" && typeof value === "string" && value.startsWith("#/$defs/")
      ? [value.slice("#/$defs/".length)]
      : localReferencesOf(value),
  )
}
