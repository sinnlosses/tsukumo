// `report` の部品ごとの `components` の例。例の値はすべて架空。

import { mapValues, omit } from "remeda"
import type { z } from "zod"

import { LEAF_COMPONENT_KINDS, type REPORT_COMPONENT_SCHEMAS } from "./a2ui-report-catalog.ts"
import type { namedWriterBlockSchema } from "./report-block.ts"

type LeafBlockInput = z.input<typeof namedWriterBlockSchema>

type LeafKind = LeafBlockInput["kind"]

const LEAF_BLOCK_EXAMPLES = {
  text: { kind: "text", text: "架空の取り込みは 120 件中 8 件が上限で切れていた。" },
  list: {
    kind: "list",
    style: "flow",
    items: [
      { label: "受付", text: "依頼を1件ずつ受け取る", source: "intake.ts" },
      { label: "検査", text: "形を確かめる", branch: "崩れあり → 差し戻し", branchTone: "ng" },
      { label: "保存", text: "通ったものだけを書く" },
    ],
  },
  table: {
    kind: "table",
    title: "架空の設定の上限を 30 から 60 にすると、切れる件数が 8 から 0 に減る",
    columns: ["上限", "切れた件数", "状態"],
    rows: [
      ["30", "8", { status: "ng", text: "切れる" }],
      { cells: ["60", { from: "8", to: "0" }, { status: "ok", text: "切れない" }], emphasis: true },
    ],
  },
  matrix: {
    kind: "matrix",
    title: "架空の機能ごとの対応",
    columns: ["手元", "共有"],
    rows: [
      { name: "書き出し", cells: ["ok", "warn"] },
      { name: "読み込み", cells: ["ok", "na"] },
    ],
  },
  compare: {
    kind: "compare",
    title: "架空の置き場の案",
    sides: [
      { heading: "案A: 1つのファイル", points: ["読む場所が1つ", "行が多い"] },
      { heading: "案B: 種類ごとのファイル", points: ["探しやすい", "参照が増える"] },
    ],
  },
  beforeAfter: {
    kind: "beforeAfter",
    title: "架空の手順の前後",
    before: { kind: "points", points: ["手で3回打つ"] },
    after: { kind: "code", language: "sh", source: "make all" },
  },
  note: { kind: "note", tone: "warn", text: "架空の書き出しは戻せない。" },
  stats: {
    kind: "stats",
    items: [
      { before: "8", value: "0", label: "切れた件数", better: "down" },
      { value: "120", label: "取り込んだ件数", series: [90, 105, 120] },
      { value: "3", total: "4", label: "通った段" },
    ],
  },
  code: { kind: "code", language: "ts", source: "export const LIMIT = 60" },
  mermaid: {
    kind: "mermaid",
    title: "架空の依頼は検査を通ってから保存される",
    source: "sequenceDiagram\n  受付->>検査: 渡す\n  検査->>保存: 通ったもの",
  },
  graph: {
    kind: "graph",
    direction: "LR",
    title: "架空の依頼は検査で2つに分かれる",
    source: "受付 -> 検査: 渡す\n検査 -> 保存: 通ったもの\n検査 -> 差し戻し: 落ちたもの",
  },
  chart: {
    kind: "chart",
    title: "架空の待ち時間は3日で半分になった",
    chartKind: "bar",
    labels: ["1日目", "2日目", "3日目"],
    series: [{ name: "待ち時間（秒）", values: [40, 30, 20] }],
  },
  svg: {
    kind: "svg",
    title: "架空の2つの枠の重なり",
    width: 200,
    height: 100,
    shapes: [
      { kind: "rect", x: 10, y: 10, width: 80, height: 60, label: "手元" },
      { kind: "rect", x: 60, y: 30, width: 80, height: 60, label: "共有", tone: "a" },
      { kind: "line", x1: 90, y1: 40, x2: 140, y2: 40, arrow: true, label: "写す" },
    ],
  },
  timeline: {
    kind: "timeline",
    title: "架空の検査の段が2分延びた",
    rows: [
      { name: "準備", start: "10:00", end: "10:05" },
      { name: "検査", start: "10:05", end: "10:10", extra: ["10:12"], lane: "検査役" },
    ],
    events: [{ at: "10:10", label: "再試" }],
  },
  options: {
    kind: "options",
    title: "架空の置き場の採否",
    items: [
      { name: "種類ごとのファイル", verdict: "adopt", reason: "探す場所が種類で決まる" },
      { name: "1つのファイル", verdict: "reject", reason: "行が多く読み切れない" },
    ],
  },
  claims: {
    kind: "claims",
    items: [
      { claim: "架空の上限は 60 で足りる", certainty: "confirmed", basis: "120 件で切れなかった" },
      {
        claim: "件数が倍でも足りる",
        certainty: "inferred",
        howToVerify: "240 件の架空の入力で取り込みを打つ",
      },
    ],
  },
  image: {
    kind: "image",
    path: "shots/sample.png",
    caption: "架空の一覧の行が3行から5行に増えた",
    notes: ["右上の帯に件数が出る"],
  },
  plot: {
    kind: "plot",
    question: "どの日の待ち時間を先に詰めるか",
    data: [
      { name: "日", type: "O", values: ["1日目", "2日目", "3日目"] },
      { name: "待ち時間（秒）", type: "Q", values: [40, 30, 20] },
    ],
    relation: "compare",
  },
  markdown: { kind: "markdown", markdown: "> 架空の引用の1行" },
} satisfies { readonly [K in LeafKind]: Extract<LeafBlockInput, { kind: K }> }

/** 葉の部品の例。塊の例から `kind` を除き、`id` と `component` を足す。 */
const LEAF_EXAMPLES = mapValues(LEAF_COMPONENT_KINDS, (kind, component) => [
  { id: "p1", component, ...omit(LEAF_BLOCK_EXAMPLES[kind], ["kind"]) },
])

/** 部品の名前ごとの `components` の例。根と節と配置の部品は、子の ID が例の中で閉じるように葉を添える。 */
export const PART_EXAMPLES = {
  ...LEAF_EXAMPLES,
  Report: [
    {
      id: "root",
      component: "Report",
      conclusion: ["架空の取り込みは上限を 60 にすると切れなくなった。"],
      figureNone: "short-answer",
      children: ["s1"],
    },
    { id: "s1", component: "Section", heading: "架空の結果", children: ["p1"] },
    { id: "p1", component: "Paragraph", text: "架空の取り込みは 120 件すべてが通った。" },
  ],
  Section: [
    { id: "s1", component: "Section", heading: "架空の結果", children: ["p1", "n1"] },
    { id: "p1", component: "Paragraph", text: "架空の取り込みは 120 件すべてが通った。" },
    { id: "n1", component: "Note", tone: "warn", text: "架空の書き出しは戻せない。" },
  ],
  Row: [
    { id: "r1", component: "Row", children: ["p1", "p2"], justify: "spaceBetween" },
    { id: "p1", component: "Paragraph", text: "架空の左の欄。" },
    { id: "p2", component: "Paragraph", text: "架空の右の欄。" },
  ],
  Column: [
    { id: "c1", component: "Column", children: ["p1", "p2"] },
    { id: "p1", component: "Paragraph", text: "架空の上の段。" },
    { id: "p2", component: "Paragraph", text: "架空の下の段。" },
  ],
  Card: [
    { id: "k1", component: "Card", child: "p1" },
    { id: "p1", component: "Paragraph", text: "架空の枠の中の一文。" },
  ],
  Tabs: [
    {
      id: "t1",
      component: "Tabs",
      tabs: [
        { title: "案A", child: "p1" },
        { title: "案B", child: "p2" },
      ],
    },
    { id: "p1", component: "Paragraph", text: "架空の案Aの説明。" },
    { id: "p2", component: "Paragraph", text: "架空の案Bの説明。" },
  ],
  ChoicePicker: [
    {
      id: "tbl1",
      component: "Table",
      title: "架空の取り込みの結果",
      columns: ["状態", "件名"],
      rows: [
        [{ status: "ok", text: "通った" }, "架空の取り込み"],
        [{ status: "ng", text: "落ちた" }, "架空の書き出し"],
      ],
      filterable: true,
    },
    {
      id: "cp1",
      component: "ChoicePicker",
      label: "架空の表示",
      variant: "mutuallyExclusive",
      options: [
        { label: "すべて", value: "all" },
        { label: "落ちたものだけ", value: "ng" },
      ],
      value: { path: "/view/tbl1/filter" },
    },
  ],
} satisfies Record<keyof typeof REPORT_COMPONENT_SCHEMAS, readonly unknown[]>
