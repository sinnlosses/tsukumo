// `plot` の申告（列の型・基数・関係）と利用者の図の既定から、形と必須の注記を決める決定表と、置いてはならない形の規則。

import type { FigureForm, ReportPlot } from "./figure-grammar.ts"

/**
 * 行の図派・文派のどちらの形を採るか。語は利用者の図の既定（`FigurePreference`）と同じ。
 * `shared/session` は `shared/report` を読むので、ここから既定の型を読むと循環する。
 */
export type FigureLean = "chart" | "text"

/** 必須の注記の種類。値や差は組まず、何を添えるかだけを言う。 */
const FIGURE_NOTES = [
  "unit",
  "difference",
  "differencePercent",
  "extremes",
  "top",
  "medianRange",
  "percent",
  "trendTitle",
  "reference",
  "duration",
  "outlier",
  "unitInHeader",
] as const

export type FigureNote = (typeof FIGURE_NOTES)[number]

/** 基数の境。どれも目安で、実証された閾値ではない。 */
export const CARDINALITY_BOUNDS = {
  pair: 2,
  few: 7,
  many: 20,
  partMax: 5,
  pieMax: 3,
  keyFiguresMax: 4,
  numberLineMax: 6,
  seriesMax: 4,
  trendMin: 5,
  changeItemsMax: 8,
  rangeMin: 4,
  correlateMin: 10,
} as const satisfies Readonly<Record<string, number>>

export type FigureDeclaration = Pick<ReportPlot, "data" | "relation">

/** 申告から数えた特徴。行の条件はこれだけを見る。 */
export type DeclarationShape = {
  readonly relation: ReportPlot["relation"]
  readonly rows: number
  readonly columns: number
  readonly labels: number
  readonly ordered: number
  readonly times: number
  readonly quantities: number
}

export type FigureDecisionRow = {
  readonly name: string
  /** 文書の表に出す条件の1句。 */
  readonly condition: string
  readonly matches: (shape: DeclarationShape) => boolean
  readonly chart: FigureForm
  readonly text: FigureForm
  readonly note: FigureNote
}

export type FigureChannel = "label" | "x" | "y"

export type FigureDecision = {
  readonly row: string
  readonly form: FigureForm
  readonly note: FigureNote
  readonly encoding: readonly { readonly column: string; readonly channel: FigureChannel }[]
}

const B = CARDINALITY_BOUNDS

/** 上から当てて最初に当たった行を採る。 */
export const FIGURE_DECISION_ROWS = [
  {
    name: "one-value",
    condition: "Q が 1 列・1 行",
    matches: (shape) => shape.quantities === 1 && shape.rows === 1,
    chart: "text",
    text: "text",
    note: "unit",
  },
  {
    name: "bullet",
    condition: `compare、N か O が 1 列・Q が 2 列（値と目標）・1〜${String(B.numberLineMax)} 行`,
    matches: (shape) =>
      shape.relation === "compare" &&
      shape.labels === 1 &&
      shape.quantities === 2 &&
      shape.times === 0 &&
      between(shape.rows, 1, B.numberLineMax),
    chart: "bullet",
    text: "table",
    note: "reference",
  },
  {
    name: "key-figures",
    condition: `Q だけが 2〜${String(B.keyFiguresMax)} 列・1 行`,
    matches: (shape) =>
      shape.rows === 1 &&
      shape.quantities === shape.columns &&
      between(shape.quantities, 2, B.keyFiguresMax),
    chart: "stats",
    text: "stats",
    note: "unit",
  },
  {
    name: "two-compare",
    condition: `compare、N か O が 1 列・Q が 1 列・${String(B.pair)} 行`,
    matches: (shape) =>
      shape.relation === "compare" && isLabeledQuantity(shape) && shape.rows === B.pair,
    chart: "bar",
    text: "text",
    note: "difference",
  },
  {
    name: "number-line",
    condition: `compare か distribution、Q の 1 列だけ・2〜${String(B.numberLineMax)} 行`,
    matches: (shape) =>
      (shape.relation === "compare" || shape.relation === "distribution") &&
      shape.columns === 1 &&
      shape.quantities === 1 &&
      between(shape.rows, 2, B.numberLineMax),
    chart: "numberLine",
    text: "table",
    note: "extremes",
  },
  {
    name: "part",
    condition: `part、N か O が 1 列・Q が 1 列・2〜${String(B.partMax)} 行`,
    matches: (shape) =>
      shape.relation === "part" && isLabeledQuantity(shape) && between(shape.rows, 2, B.partMax),
    chart: "bar",
    text: "table",
    note: "percent",
  },
  {
    name: "change-two-points",
    condition: `change、T が 1 列・Q が 1 列・${String(B.pair)} 行`,
    matches: (shape) =>
      shape.relation === "change" &&
      shape.times === 1 &&
      shape.quantities === 1 &&
      shape.labels === 0 &&
      shape.rows === B.pair,
    chart: "text",
    text: "text",
    note: "differencePercent",
  },
  {
    name: "change-items",
    condition: `change、N か O が 1 列・Q が 2 列（前と後）・2〜${String(B.changeItemsMax)} 行`,
    matches: (shape) =>
      shape.relation === "change" &&
      shape.labels === 1 &&
      shape.quantities === 2 &&
      shape.times === 0 &&
      between(shape.rows, 2, B.changeItemsMax),
    chart: "line",
    text: "table",
    note: "differencePercent",
  },
  {
    name: "trend",
    condition: `trend、T が 1 列・Q が 1〜${String(B.seriesMax)} 列・${String(B.trendMin)} 行以上`,
    matches: (shape) =>
      shape.relation === "trend" &&
      shape.times === 1 &&
      shape.labels === 0 &&
      between(shape.quantities, 1, B.seriesMax) &&
      shape.rows >= B.trendMin,
    chart: "line",
    text: "table",
    note: "trendTitle",
  },
  {
    name: "range",
    condition: `range、N か O が 1 列・Q か T が 2 列（始まりと終わり）・${String(B.rangeMin)} 行以上`,
    matches: (shape) =>
      shape.relation === "range" &&
      shape.labels === 1 &&
      ((shape.quantities === 2 && shape.times === 0) ||
        (shape.times === 2 && shape.quantities === 0)) &&
      shape.rows >= B.rangeMin,
    chart: "bar",
    text: "table",
    note: "duration",
  },
  {
    name: "correlate",
    condition: `correlate、Q が 2 列・${String(B.correlateMin)} 行以上`,
    matches: (shape) =>
      shape.relation === "correlate" &&
      shape.quantities === 2 &&
      shape.times === 0 &&
      shape.labels <= 1 &&
      shape.rows >= B.correlateMin,
    chart: "scatter",
    text: "table",
    note: "outlier",
  },
  {
    name: "few-compare",
    condition: `compare か rank、N か O が 1 列・Q が 1 列・3〜${String(B.few)} 行`,
    matches: (shape) =>
      isCompare(shape) && isLabeledQuantity(shape) && between(shape.rows, 3, B.few),
    chart: "bar",
    text: "table",
    note: "extremes",
  },
  {
    name: "many-rank",
    condition: `compare か rank、N か O が 1 列・Q が 1 列・${String(B.few + 1)}〜${String(B.many)} 行`,
    matches: (shape) =>
      isCompare(shape) && isLabeledQuantity(shape) && between(shape.rows, B.few + 1, B.many),
    chart: "bar",
    text: "table",
    note: "top",
  },
  {
    name: "distribution",
    condition: `Q が 1 列（N か O は 1 列まで）・${String(B.many + 1)} 行以上`,
    matches: (shape) =>
      shape.quantities === 1 && shape.times === 0 && shape.labels <= 1 && shape.rows > B.many,
    chart: "histogram",
    text: "table",
    note: "medianRange",
  },
] as const satisfies readonly FigureDecisionRow[]

const FALLBACK_ROW = "fallback"

/** 置いてはならない形の規則（Draco の hard 制約に当たるもの）。 */
export const FIGURE_HARD_RULES = [
  {
    name: "unordered-line",
    rule: "T も O も無い申告に line（change の前と後の Q の 2 列は順序に数える）",
    violates: (shape: DeclarationShape, form: FigureForm) =>
      form === "line" &&
      shape.times === 0 &&
      shape.ordered === 0 &&
      !(shape.relation === "change" && shape.quantities === 2),
  },
  {
    name: "single-value-figure",
    rule: "Q が 1 値だけの申告に text・stats・table 以外",
    violates: (shape: DeclarationShape, form: FigureForm) =>
      shape.quantities === 1 &&
      shape.rows === 1 &&
      form !== "text" &&
      form !== "stats" &&
      form !== "table",
  },
  {
    name: "crowded-pie",
    rule: `${String(B.pieMax + 1)} 行以上の申告に pie`,
    violates: (shape: DeclarationShape, form: FigureForm) =>
      form === "pie" && shape.rows > B.pieMax,
  },
  {
    name: "edgeless-graph",
    rule: "graph（plot は辺を申告できない）",
    violates: (_shape: DeclarationShape, form: FigureForm) => form === "graph",
  },
] as const satisfies readonly FigureHardRule[]

export type FigureHardRule = {
  readonly name: string
  /** 文書の表に出す置かない形の1句。 */
  readonly rule: string
  readonly violates: (shape: DeclarationShape, form: FigureForm) => boolean
}

export type FigureHardRuleName = (typeof FIGURE_HARD_RULES)[number]["name"]

/** 書き手の `form` の欄。`auto` は決定表に任せる。 */
export type PlotFormChoice = ReportPlot["form"]

export type PlotFormResolution =
  | { readonly kind: "decided"; readonly form: FigureForm; readonly decision: FigureDecision }
  | { readonly kind: "override"; readonly form: FigureForm; readonly decision: FigureDecision }
  | {
      readonly kind: "refused"
      readonly form: FigureForm
      readonly decision: FigureDecision
      readonly rule: FigureHardRuleName
    }

/**
 * 申告と利用者の既定から決めた形に、書き手の `form` を突き合わせる。
 * 置いてはならない形は採らず決定表の形にし、決定表と違う形は上書きとして通す。
 */
export function plotFormOf(
  declaration: FigureDeclaration,
  choice: PlotFormChoice,
  preference: FigureLean,
): PlotFormResolution {
  const decision = figureDecision(declaration, preference)
  if (choice === "auto") {
    return { kind: "decided", form: decision.form, decision }
  }
  const rule = forbiddenFormOf(declaration, choice)
  if (rule !== undefined) {
    return { kind: "refused", form: decision.form, decision, rule }
  }
  return choice === decision.form
    ? { kind: "decided", form: decision.form, decision }
    : { kind: "override", form: choice, decision }
}

/** 決定表の行・形・必須の注記と、列ごとの描き方を決める。 */
function figureDecision(declaration: FigureDeclaration, preference: FigureLean): FigureDecision {
  const shape = declarationShape(declaration)
  const row = FIGURE_DECISION_ROWS.find((candidate) => candidate.matches(shape))
  const form = row === undefined ? "table" : row[preference]
  return {
    row: row?.name ?? FALLBACK_ROW,
    form,
    note: row?.note ?? "unitInHeader",
    encoding: encodingOf(declaration, form),
  }
}

/** 申告に置いてはならない形なら、当たった規則の名前。 */
function forbiddenFormOf(
  declaration: FigureDeclaration,
  form: FigureForm,
): FigureHardRuleName | undefined {
  const shape = declarationShape(declaration)
  return FIGURE_HARD_RULES.find((rule) => rule.violates(shape, form))?.name
}

/** 申告の列を型ごとに数える。行の数は先頭の列の長さ。 */
function declarationShape(declaration: FigureDeclaration): DeclarationShape {
  const count = (type: ReportPlot["data"][number]["type"]) =>
    declaration.data.filter((column) => column.type === type).length
  return {
    relation: declaration.relation,
    rows: declaration.data[0]?.values.length ?? 0,
    columns: declaration.data.length,
    labels: count("N") + count("O"),
    ordered: count("O"),
    times: count("T"),
    quantities: count("Q"),
  }
}

/** 列を1つずつ描き方へ写す。散布だけは先頭の Q を横軸にする。 */
function encodingOf(declaration: FigureDeclaration, form: FigureForm): FigureDecision["encoding"] {
  const firstQuantity = declaration.data.findIndex((column) => column.type === "Q")
  return declaration.data.map((column, index) => ({
    column: column.name,
    channel:
      column.type === "N" || column.type === "O"
        ? "label"
        : column.type === "T" || (form === "scatter" && index === firstQuantity)
          ? "x"
          : "y",
  }))
}

function between(value: number, low: number, high: number): boolean {
  return value >= low && value <= high
}

function isCompare(shape: DeclarationShape): boolean {
  return shape.relation === "compare" || shape.relation === "rank"
}

/** 1 つの名義か順序の列と 1 つの量の列だけの申告。 */
function isLabeledQuantity(shape: DeclarationShape): boolean {
  return shape.labels === 1 && shape.quantities === 1 && shape.times === 0
}
