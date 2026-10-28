import { describe, expect, test } from "vitest"
import { z } from "zod"

import { isFaultTopic, requestFor } from "../../../../scripts/dev/lib/a2ui-trial-topic.ts"
import {
  catalogCard,
  extractComponents,
  judgeComponents,
  requestedCards,
  systemPromptFor,
  toolDefinitionChars,
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

describe("混ぜる形", () => {
  const prompt = systemPromptFor("mixed", undefined)
  const loaded = z
    .object({
      $defs: z.record(z.string(), z.unknown()),
      components: z.record(z.string(), z.unknown()),
    })
    .parse(JSON.parse(prompt.split("\n\n").find((part) => part.startsWith('{"catalogId"')) ?? ""))

  test("載せる部品だけの JSON Schema と、残りの部品の名前を持つ", () => {
    const loadedNames = Object.keys(loaded.components)
    const restNames = Object.keys(REPORT_COMPONENT_SCHEMAS).filter(
      (name) => !loadedNames.includes(name),
    )

    expect(loadedNames).toEqual(expect.arrayContaining(["Report", "Section", "Table"]))
    expect(restNames).toEqual(expect.arrayContaining(["Chart", "ChoicePicker"]))
    expect(loadedNames.length + restNames.length).toBe(Object.keys(REPORT_COMPONENT_SCHEMAS).length)
    for (const name of restNames) {
      expect(prompt).toContain(`- ${name}: `)
    }
    expect(prompt).not.toContain("- Table: ")
  })

  test("載せた部品の断片が参照する $defs は全部残る", () => {
    const references = localReferencesOf(loaded.components)

    expect(references.every((reference) => reference in loaded.$defs)).toBe(true)
  })

  test("ツール定義の字数は、全部載せより小さく、名前の列挙だけより大きい", () => {
    const full = toolDefinitionChars("full").total
    const names = toolDefinitionChars("names").total
    const mixed = toolDefinitionChars("mixed").total

    expect(mixed).toBeLessThan(full)
    expect(mixed).toBeGreaterThan(names)
  })
})

describe("trialConditions", () => {
  test("載せ方 3 つで 128 件、操作できる部品の題材は 24 件", () => {
    const conditions = trialConditions()

    expect(conditions).toHaveLength(128)
    expect(conditions.filter((entry) => entry.topic === "T3" || entry.topic === "T4")).toHaveLength(
      24,
    )
  })

  test("規約を破らせない題材は載せ方ごとに 32 件で、条件の id は重ならない", () => {
    const conditions = trialConditions()

    for (const loading of ["full", "names", "mixed"] as const) {
      expect(
        conditions.filter((entry) => entry.loading === loading && !isFaultTopic(entry.topic)),
      ).toHaveLength(32)
    }
    expect(new Set(conditions.map((entry) => entry.id)).size).toBe(conditions.length)
  })

  test("規約を破らせる題材は A が 8 件、B と C が 12 件", () => {
    const faulty = trialConditions().filter((entry) => isFaultTopic(entry.topic))

    expect(faulty.filter((entry) => entry.loading === "full")).toHaveLength(8)
    expect(faulty.filter((entry) => entry.loading === "names")).toHaveLength(12)
    expect(faulty.filter((entry) => entry.loading === "mixed")).toHaveLength(12)
  })
})

describe("requestFor", () => {
  test("違反の指示は最初の依頼にだけ添え、再試行の依頼には添えない", () => {
    expect(requestFor("T5", 2, true)).toContain("優先する")
    expect(requestFor("T5", 2, false)).not.toContain("優先する")
  })

  test("規約を破らせない題材は violate が真でも指示を添えない", () => {
    expect(requestFor("T1", 2, true)).toBe(requestFor("T1", 2, false))
  })
})

describe("規約を破らせる題材の違反", () => {
  const nestedSection = {
    id: "s2",
    component: "Section",
    heading: "架空の入れ子",
    children: ["p1"],
  }
  const layer = (id: string, component: string, child: string): unknown =>
    component === "Card" ? { id, component, child } : { id, component, children: [child] }

  test.each([
    [
      "Report の子に節でない部品",
      [{ ...report, children: ["s1", "p1"] }, section, paragraph],
      "report-child-not-section",
    ],
    [
      "節の中の節",
      [report, { ...section, children: ["s2", "p1"] }, nestedSection, paragraph],
      "nested-section",
    ],
    [
      "配置の 5 重の入れ子",
      [
        report,
        { ...section, children: ["l1"] },
        layer("l1", "Row", "l2"),
        layer("l2", "Column", "l3"),
        layer("l3", "Card", "l4"),
        layer("l4", "Row", "l5"),
        layer("l5", "Card", "p1"),
        paragraph,
      ],
      "deep-layout",
    ],
    [
      "どこからも参照されない部品",
      [
        report,
        section,
        paragraph,
        { id: "n1", component: "Note", tone: "info", text: "架空の補足" },
      ],
      "unreferenced-component",
    ],
  ])("%s は構造の検査で落ちる", (_label, components, code) => {
    const judged = judgeComponents(components)

    expect(judged.faults.map((fault) => fault.code)).toContain(code)
    expect(judged.retryText).toContain("VALIDATION_FAILED")
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
