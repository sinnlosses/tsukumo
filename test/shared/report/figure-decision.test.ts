import { describe, expect, it } from "vitest"

import {
  CARDINALITY_BOUNDS,
  FIGURE_DECISION_ROWS,
  FIGURE_HARD_RULES,
  type FigureDeclaration,
  type FigureDecision,
  plotFormOf,
} from "../../../src/shared/report/figure-decision.ts"
import type { FigureForm } from "../../../src/shared/report/figure-grammar.ts"
import {
  FIGURE_PREFERENCES,
  type FigurePreference,
} from "../../../src/shared/session/session-default.ts"

/** 書き手が形を書かなかったときの決定表の答え。 */
const figureDecision = (sample: FigureDeclaration, preference: FigurePreference) =>
  plotFormOf(sample, "auto", preference).decision

/** 書き手がその形を書いたとき、置いてはならない形として採られなかった規則の名前。 */
function forbiddenFormOf(sample: FigureDeclaration, form: FigureForm): string | undefined {
  const resolution = plotFormOf(sample, form, "chart")
  return resolution.kind === "refused" ? resolution.rule : undefined
}

type ColumnType = FigureDeclaration["data"][number]["type"]
type Relation = FigureDeclaration["relation"]

/** 型の並びと行の数から、架空の値で埋めた申告を組む。列の名前は型と位置から付ける。 */
function declaration(relation: Relation, types: readonly ColumnType[], rows: number) {
  return {
    relation,
    data: types.map((type, index) => ({
      name: `${type}${String(index + 1)}`,
      type,
      values: Array.from({ length: rows }, (_, row) =>
        type === "Q" ? row + 1 : `${type}${String(index + 1)}-${String(row + 1)}`,
      ),
    })),
  } satisfies FigureDeclaration
}

/** どの行にも当たらなかったときの行の名前。 */
const FALLBACK_ROW = "fallback"

type RowName = (typeof FIGURE_DECISION_ROWS)[number]["name"]

const B = CARDINALITY_BOUNDS

/** 行ごとに、その行に当たる申告を1つ。 */
const ROW_SAMPLES = {
  "one-value": declaration("compare", ["Q"], 1),
  bullet: declaration("compare", ["N", "Q", "Q"], 3),
  "key-figures": declaration("compare", ["Q", "Q", "Q"], 1),
  "two-compare": declaration("compare", ["N", "Q"], 2),
  "number-line": declaration("compare", ["Q"], 4),
  part: declaration("part", ["N", "Q"], 4),
  "change-two-points": declaration("change", ["T", "Q"], 2),
  "change-items": declaration("change", ["N", "Q", "Q"], 5),
  trend: declaration("trend", ["T", "Q", "Q"], 6),
  range: declaration("range", ["N", "T", "T"], 5),
  correlate: declaration("correlate", ["N", "Q", "Q"], 12),
  "few-compare": declaration("rank", ["N", "Q"], 5),
  "many-rank": declaration("compare", ["O", "Q"], 12),
  distribution: declaration("distribution", ["N", "Q"], 30),
} satisfies Record<RowName, FigureDeclaration>

const FIGURE_FORMS_DRAWN: readonly FigureForm[] = [
  "bar",
  "line",
  "pie",
  "numberLine",
  "bullet",
  "scatter",
  "histogram",
]

describe("決定表の行", () => {
  it("行は既存の札の表（14 札）より大きくならず、15 行以内に収まる", () => {
    expect(FIGURE_DECISION_ROWS.length).toBeLessThanOrEqual(15)
  })

  it.each(FIGURE_DECISION_ROWS)("$name の申告は、その行の形と注記を既定ごとに返す", (row) => {
    const sample = ROW_SAMPLES[row.name]
    expect(figureDecision(sample, "chart")).toMatchObject({
      row: row.name,
      form: row.chart,
      note: row.note,
    })
    expect(figureDecision(sample, "text")).toMatchObject({
      row: row.name,
      form: row.text,
      note: row.note,
    })
  })

  it("どの行にも当たらない申告は表にし、単位を列見出しに置く注記を返す", () => {
    const decision = figureDecision(declaration("correlate", ["N", "N"], 3), "chart")
    expect(decision).toMatchObject({ row: FALLBACK_ROW, form: "table", note: "unitInHeader" })
  })

  it("行の名前は重ならない", () => {
    const names = FIGURE_DECISION_ROWS.map((row) => row.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe("基数の境の前後", () => {
  const rowAt = (relation: Relation, types: readonly ColumnType[], rows: number) =>
    figureDecision(declaration(relation, types, rows), "chart").row

  it.each([
    ["few-compare と many-rank", "rank", ["N", "Q"], B.few, "few-compare", "many-rank"],
    ["many-rank と distribution", "rank", ["N", "Q"], B.many, "many-rank", "distribution"],
    ["part の上限", "part", ["N", "Q"], B.partMax, "part", FALLBACK_ROW],
    ["trend の下限", "trend", ["T", "Q"], B.trendMin - 1, FALLBACK_ROW, "trend"],
    ["correlate の下限", "correlate", ["Q", "Q"], B.correlateMin - 1, FALLBACK_ROW, "correlate"],
    ["range の下限", "range", ["N", "Q", "Q"], B.rangeMin - 1, FALLBACK_ROW, "range"],
    ["number-line の上限", "compare", ["Q"], B.numberLineMax, "number-line", FALLBACK_ROW],
    [
      "change-items の上限",
      "change",
      ["N", "Q", "Q"],
      B.changeItemsMax,
      "change-items",
      FALLBACK_ROW,
    ],
  ] as const)("%s: %i 行と1行多い申告で行が変わる", (_name, relation, types, rows, at, after) => {
    expect(rowAt(relation, types, rows)).toBe(at)
    expect(rowAt(relation, types, rows + 1)).toBe(after)
  })

  it(`pie は ${String(B.pieMax)} 行まで置け、1行多いと置けない`, () => {
    expect(forbiddenFormOf(declaration("part", ["N", "Q"], B.pieMax), "pie")).toBeUndefined()
    expect(forbiddenFormOf(declaration("part", ["N", "Q"], B.pieMax + 1), "pie")).toBe(
      "crowded-pie",
    )
  })
})

describe("文派の落ち", () => {
  it.each(FIGURE_DECISION_ROWS)("$name の文派の形は図でない", (row) => {
    expect(["text", "table", "stats"]).toContain(row.text)
  })

  it("図派で図になる申告は、文派では表か文になる", () => {
    const sample = ROW_SAMPLES["few-compare"]
    expect(figureDecision(sample, "chart").form).toBe("bar")
    expect(figureDecision(sample, "text").form).toBe("table")
    expect(figureDecision(ROW_SAMPLES["two-compare"], "text").form).toBe("text")
  })
})

describe("必須の注記", () => {
  it.each(FIGURE_DECISION_ROWS.filter((row) => FIGURE_FORMS_DRAWN.includes(row.chart)))(
    "図を返す $name は、表の既定でない注記（値・差・傾向）を返す",
    (row) => {
      expect(row.note).not.toBe("unitInHeader")
    },
  )
})

describe("置いてはならない形", () => {
  it.each([
    ["unordered-line", declaration("compare", ["N", "Q"], 5), "line"],
    ["single-value-figure", declaration("compare", ["N", "Q"], 1), "bar"],
    ["crowded-pie", declaration("part", ["N", "Q"], 5), "pie"],
    ["edgeless-graph", declaration("compare", ["N", "Q"], 3), "graph"],
  ] as const)("%s に当たる", (rule, sample, form) => {
    expect(forbiddenFormOf(sample, form)).toBe(rule)
  })

  it.each([
    ["T のある申告の line", declaration("trend", ["T", "Q"], 5), "line"],
    ["O のある申告の line", declaration("compare", ["O", "Q"], 5), "line"],
    ["1 値の申告の stats", declaration("compare", ["Q"], 1), "stats"],
    ["3 部分の pie", declaration("part", ["N", "Q"], 3), "pie"],
  ] as const)("%s は当たらない", (_name, sample, form) => {
    expect(forbiddenFormOf(sample, form)).toBeUndefined()
  })

  it("規則の名前は重ならない", () => {
    const names = FIGURE_HARD_RULES.map((rule) => rule.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it.each(FIGURE_DECISION_ROWS)("$name の形はどの既定でも規則に当たらない", (row) => {
    for (const preference of FIGURE_PREFERENCES) {
      const sample = ROW_SAMPLES[row.name]
      expect(forbiddenFormOf(sample, figureDecision(sample, preference).form)).toBeUndefined()
    }
  })
})

describe("書き手の上書き", () => {
  const sample = ROW_SAMPLES["part"]

  it("auto と決定表と同じ形は決定表のまま", () => {
    expect(plotFormOf(sample, "auto", "chart")).toMatchObject({ kind: "decided", form: "bar" })
    expect(plotFormOf(sample, "bar", "chart")).toMatchObject({ kind: "decided", form: "bar" })
  })

  it("決定表と違い規則に当たらない形は、上書きとして通す", () => {
    expect(plotFormOf(sample, "table", "chart")).toMatchObject({
      kind: "override",
      form: "table",
      decision: { form: "bar" },
    })
  })

  it("規則に当たる形は採らず、決定表の形で描く", () => {
    expect(plotFormOf(sample, "pie", "chart")).toMatchObject({
      kind: "refused",
      form: "bar",
      rule: "crowded-pie",
    })
  })

  it("上書きは利用者の既定で決まった形と比べる", () => {
    expect(plotFormOf(sample, "table", "text")).toMatchObject({ kind: "decided", form: "table" })
  })
})

/** 申告の列の名前のうち、描き方に1回ずつ残っていないもの。 */
function missingColumns(input: FigureDeclaration, decision: FigureDecision): readonly string[] {
  const remaining = decision.encoding.map((entry) => entry.column)
  const missing = input.data
    .map((column) => column.name)
    .filter((name) => {
      const index = remaining.indexOf(name)
      if (index === -1) return true
      remaining.splice(index, 1)
      return false
    })
  return [...missing, ...remaining]
}

describe("申告の列は描き方に全部残る", () => {
  const samples = [
    ...Object.values(ROW_SAMPLES),
    declaration("correlate", ["N", "N"], 3),
  ] satisfies readonly FigureDeclaration[]

  it.each(
    samples.flatMap((sample) =>
      FIGURE_PREFERENCES.map((preference) => [sample, preference] as const),
    ),
  )("%#: 列の名前が重なりも欠けもなく残る", (sample, preference) => {
    expect(missingColumns(sample, figureDecision(sample, preference))).toEqual([])
  })

  it("列が欠けた描き方は、残っていない列として見つかる", () => {
    const sample = ROW_SAMPLES["change-items"]
    const decision = figureDecision(sample, "chart")
    const dropped = { ...decision, encoding: decision.encoding.slice(1) }
    expect(missingColumns(sample, dropped)).toEqual(["N1"])
  })

  it("散布は先頭の Q を横軸、次の Q を縦軸にする", () => {
    expect(figureDecision(ROW_SAMPLES.correlate, "chart").encoding).toEqual([
      { column: "N1", channel: "label" },
      { column: "Q2", channel: "x" },
      { column: "Q3", channel: "y" },
    ])
  })
})
