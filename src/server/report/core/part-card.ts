// `report` の部品1種類の文法カード（型の表記と例1つ）。
// 型は `report` の定義と同じ部品の zod から組み、説明を手で写さない。例の値はすべて架空。

import type { z } from "zod"

import { namedWriterBlockSchema } from "../../../shared/report/report-block.ts"
import { arrangedBlockSchemasOf } from "../../../shared/report/row-panel-block.ts"
import { blockShortTypeText } from "./short-type-text.ts"

/** `report_part_card` ツールの説明文。 */
export const PART_CARD_TOOL_DESCRIPTION =
  "report の部品（sections の blocks と figure に置くもの）の型と例1つを、部品の種類を渡して引く。" +
  "型は report の定義の部品と同じ。部品の書き方に迷ったときに、使う前に引く"

/** `report_part_card` の `kind` の欄の説明。 */
export const PART_CARD_KIND_DESCRIPTION =
  "部品の種類（kind の値。例: table・graph・chart）。知らない種類には引ける種類の一覧を返す"

/** 種類を渡して引いた結果。知らない種類なら、引ける種類の一覧を言う文。 */
type PartCard =
  | { readonly kind: "card"; readonly text: string }
  | { readonly kind: "unknown-kind"; readonly text: string }

export function partCardOf(kind: string): PartCard {
  const branch = PART_BRANCHES.find((option) => option.shape.kind.value === kind)
  if (branch === undefined) {
    return {
      kind: "unknown-kind",
      text: `知らない部品の種類: ${JSON.stringify(kind)}。引ける種類: ${PART_KINDS.join(", ")}`,
    }
  }
  const partKind = branch.shape.kind.value
  const arranged = partKind === "row" || partKind === "panel"
  return {
    kind: "card",
    text: [
      `部品 ${partKind} の文法（report の定義の部品と同じ型）`,
      "型（TypeScript の表記。? の欄は省ける）:",
      blockShortTypeText(
        branch,
        `${partKind.charAt(0).toUpperCase()}${partKind.slice(1)}Block`,
        LEAF_UNION_NAMES,
      ),
      ...(arranged ? [ARRANGED_NOTES[partKind]] : []),
      "例:",
      JSON.stringify(PART_EXAMPLES[partKind]),
    ].join("\n"),
  }
}

const { rowBlockSchema, panelBlockSchema } = arrangedBlockSchemasOf(namedWriterBlockSchema)

// `row`・`panel` のカードで子の型を展開しない名前。葉の部品の合併を展開すると全部品の型が1枚に載る
const LEAF_UNION_NAMES: ReadonlySet<string> = new Set(["ReportBlock"])

// 型の表記は数の制約を落とすので、子の数はここで言う
const ARRANGED_NOTES = {
  row: "子は 2〜4 個で、report_part_card で各部品の型を引く。row と panel は子に入れられない",
  panel: "子は 1 個以上で、report_part_card で各部品の型を引く。row と panel は子に入れられない",
} as const satisfies Readonly<Record<"row" | "panel", string>>

const PART_BRANCHES = [...namedWriterBlockSchema.options, rowBlockSchema, panelBlockSchema]

type WriterBlockInput =
  | z.input<typeof namedWriterBlockSchema>
  | z.input<typeof rowBlockSchema>
  | z.input<typeof panelBlockSchema>

type PartKind = WriterBlockInput["kind"]

const PART_KINDS: readonly PartKind[] = PART_BRANCHES.map((option) => option.shape.kind.value)

const PART_EXAMPLES = {
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
  row: {
    kind: "row",
    blocks: [
      {
        kind: "stats",
        items: [
          { before: "8", value: "0", label: "切れた件数", better: "down" },
          { value: "120", label: "取り込んだ件数" },
          { value: "3", total: "4", label: "通った段" },
        ],
      },
      { kind: "code", language: "ts", source: "export const LIMIT = 60" },
    ],
  },
  panel: {
    kind: "panel",
    title: "架空の取り込みの結果",
    blocks: [
      {
        kind: "table",
        title: "架空の上限を 60 にすると切れる件数が 0 になる",
        columns: ["上限", "切れた件数"],
        rows: [
          ["30", "8"],
          ["60", "0"],
        ],
      },
    ],
  },
} satisfies { readonly [K in PartKind]: Extract<WriterBlockInput, { kind: K }> }
