import { describe, expect, it } from "vitest"

import {
  drawnEntryMarkdown,
  drawnEntryPresence,
  sectionDrawsAnything,
} from "../../../src/shared/report/drawn-entry-markdown.ts"
import { plotBlockSchema } from "../../../src/shared/report/figure-grammar.ts"
import type { ReportBlock, ReportBlockSection } from "../../../src/shared/report/report-block.ts"
import { reportLeafLayoutOf } from "../../../src/shared/report/report-leaf-value.ts"

type DrawnEntryPresence = ReturnType<typeof drawnEntryPresence>
type MarkdownEntryBlock = Parameters<typeof drawnEntryMarkdown>[0]

const PLAIN = { fold: "", aside: "" } as const

const memo = (text: string): ReportBlock => ({ kind: "note", tone: "memo", text, ...PLAIN })
const markdown = (value: string): ReportBlock => ({ kind: "markdown", markdown: value, ...PLAIN })
const text = (value: string, aside = ""): ReportBlock => ({
  kind: "text",
  text: value,
  fold: "",
  aside,
})

/** 節1つの塊の並びと、塊ごとに期待する有無。 */
const ROWS: readonly (readonly [string, readonly ReportBlock[], readonly DrawnEntryPresence[]])[] =
  [
    ["空白の text", [text("  ")], ["empty"]],
    ["text", [text("架空の本文。")], ["drawn"]],
    ["傍注のある空白の text", [text(" ", "架空の傍注")], ["drawn"]],
    ["空の markdown", [markdown("")], ["empty"]],
    ["空白だけの markdown", [markdown("  \n")], ["blank"]],
    ["markdown", [markdown("架空の **本文**")], ["drawn"]],
    ["memo を寄せた空の markdown", [markdown(""), memo("架空の覚え書き")], ["drawn", "empty"]],
    ["節の頭の memo", [memo("架空の覚え書き")], ["drawn"]],
    ["空の memo", [memo(" ")], ["empty"]],
    ["空白の info", [{ kind: "note", tone: "info", text: " ", ...PLAIN }], ["empty"]],
    ["warn", [{ kind: "note", tone: "warn", text: "架空の注意", ...PLAIN }], ["drawn"]],
    ["空白の quote", [{ kind: "quote", text: " ", source: "架空", ...PLAIN }], ["empty"]],
    ["quote", [{ kind: "quote", text: "架空の引用", source: "", ...PLAIN }], ["drawn"]],
    ["項目の無い list", [{ kind: "list", style: "bullet", items: [], ...PLAIN }], ["empty"]],
    [
      "list",
      [
        {
          kind: "list",
          style: "bullet",
          items: [
            { label: "", text: "架空", done: false, source: "", branch: "", branchTone: "warn" },
          ],
          ...PLAIN,
        },
      ],
      ["drawn"],
    ],
    [
      "行の無い table",
      [{ kind: "table", title: "", columns: ["架空"], rows: [], rest: "", ...PLAIN }],
      ["drawn"],
    ],
    [
      "空のセルだけの table",
      [{ kind: "table", title: "", columns: ["架空"], rows: [[""]], rest: "", ...PLAIN }],
      ["drawn"],
    ],
    ["image", [{ kind: "image", path: "架空.png", caption: "", notes: [], ...PLAIN }], ["drawn"]],
    [
      "image の beforeAfter",
      [
        {
          kind: "beforeAfter",
          title: "",
          before: { kind: "image", path: "架空.png" },
          after: { kind: "points", points: ["架空"] },
          ...PLAIN,
        },
      ],
      ["drawn"],
    ],
    [
      "matrix",
      [
        {
          kind: "matrix",
          title: "",
          columns: ["架空"],
          rows: [{ name: "架空", cells: ["ok"] }],
          ...PLAIN,
        },
      ],
      ["drawn"],
    ],
    [
      "compare",
      [
        {
          kind: "compare",
          title: "",
          sides: [
            { heading: "架空A", points: ["架空"] },
            { heading: "架空B", points: ["架空"] },
          ],
          ...PLAIN,
        },
      ],
      ["drawn"],
    ],
    [
      "stats",
      [
        {
          kind: "stats",
          items: [{ before: "", value: "1", total: "", label: "架空", series: [], better: "" }],
          ...PLAIN,
        },
      ],
      ["drawn"],
    ],
    [
      "options",
      [
        {
          kind: "options",
          title: "",
          items: [{ name: "架空", verdict: "adopt", reason: "架空" }],
          ...PLAIN,
        },
      ],
      ["drawn"],
    ],
    [
      "claims",
      [
        {
          kind: "claims",
          items: [{ claim: "架空", certainty: "confirmed", basis: "", howToVerify: "" }],
          ...PLAIN,
        },
      ],
      ["drawn"],
    ],
    [
      "files",
      [
        {
          kind: "files",
          title: "",
          items: [{ path: "a.ts", change: "added", note: "" }],
          ...PLAIN,
        },
      ],
      ["drawn"],
    ],
    [
      "timeline",
      [
        {
          kind: "timeline",
          title: "",
          rows: [{ name: "架空", start: "0:00", end: "0:01", extra: [], lane: "" }],
          events: [],
          emphasis: [],
          ...PLAIN,
        },
      ],
      ["drawn"],
    ],
    [
      "svg",
      [
        {
          kind: "svg",
          title: "",
          width: 10,
          height: 10,
          shapes: [{ kind: "text", x: 1, y: 1, text: "架空" }],
          legend: [],
          ...PLAIN,
        },
      ],
      ["drawn"],
    ],
    [
      "chart",
      [
        {
          kind: "chart",
          title: "",
          chartKind: "bar",
          labels: ["架空"],
          series: [{ name: "架空", values: [1] }],
          horizontal: false,
          emphasis: [],
          ...PLAIN,
        },
      ],
      ["drawn"],
    ],
    [
      "plot",
      [
        plotBlockSchema.parse({
          kind: "plot",
          question: "架空の題",
          relation: "part",
          data: [
            { name: "架空の工程", type: "N", values: ["甲", "乙"] },
            { name: "架空の件数", type: "Q", values: [1, 2] },
          ],
        }),
      ],
      ["drawn"],
    ],
    [
      "graph",
      [{ kind: "graph", title: "", direction: "LR", source: "A -> B", legend: [], ...PLAIN }],
      ["drawn"],
    ],
    [
      "code",
      [{ kind: "code", language: "", path: "", source: "", marks: [], ...PLAIN }],
      ["drawn"],
    ],
    [
      "mermaid",
      [{ kind: "mermaid", title: "", source: "sequenceDiagram\n  A->>B: 架空", ...PLAIN }],
      ["drawn"],
    ],
  ]

function presencesOf(blocks: readonly ReportBlock[]): readonly DrawnEntryPresence[] {
  const values = reportLeafLayoutOf([{ heading: "", blocks }]).values[0] ?? []
  return blocks.map((block, index) => {
    const value = values[index]
    if (value === undefined) {
      throw new Error("塊の値が無い")
    }
    return drawnEntryPresence(block, value)
  })
}

describe("drawnEntryPresence", () => {
  it.each(ROWS)("%s", (_, blocks, expected) => {
    expect(presencesOf(blocks)).toEqual(expected)
  })
})

describe("sectionDrawsAnything", () => {
  const drawsOf = (section: ReportBlockSection): boolean =>
    sectionDrawsAnything(section, reportLeafLayoutOf([section]).values[0] ?? [])

  it("見出しか描くものがある塊があれば真で、空白だけの markdown は数えない", () => {
    expect(drawsOf({ heading: "", blocks: [markdown("  \n"), text(" ")] })).toBe(false)
    expect(drawsOf({ heading: "架空の節", blocks: [text(" ")] })).toBe(true)
    expect(drawsOf({ heading: " ", blocks: [memo("架空")] })).toBe(true)
    expect(drawsOf({ heading: "", blocks: [] })).toBe(false)
  })
})

const GUTTER_TEXT =
  '<div class="with-gutter">\n\n架空の本文。\n\n<div class="gutter">\n\n' +
  '<aside class="gutter-note">\n\n架空の傍注\n\n</aside>\n\n</div>\n\n</div>'

const MEMO_MERGED =
  '<div class="with-gutter">\n\n架空の本文\n\n<div class="gutter">\n\n' +
  '<aside class="gutter-note">\n\n<span class="gutter-note-label">メモ</span>架空の覚え書き\n\n</aside>\n\n</div>\n\n</div>'

describe("drawnEntryMarkdown", () => {
  const cases: readonly (readonly [string, MarkdownEntryBlock, string])[] = [
    ["markdown", { kind: "markdown", markdown: "架空の **本文**", ...PLAIN }, "架空の **本文**"],
    [
      "畳みのある markdown",
      { kind: "markdown", markdown: "架空", fold: "架空の畳み", aside: "" },
      "<details><summary>架空の畳み</summary>\n\n架空\n\n</details>",
    ],
    [
      "傍注のある text",
      { kind: "text", text: "架空の本文。", fold: "", aside: "架空の傍注" },
      GUTTER_TEXT,
    ],
    ["空白だけの markdown", { kind: "markdown", markdown: "  \n", ...PLAIN }, "  \n"],
    [
      "畳みのある text",
      { kind: "text", text: "架空の本文。", fold: "架空の畳み", aside: "" },
      "<details><summary>架空の畳み</summary>\n\n架空の本文。\n\n</details>",
    ],
  ]

  it.each(cases)("%s の字", (_, block, expected) => {
    const value = reportLeafLayoutOf([{ heading: "", blocks: [block] }]).values[0]?.[0]

    expect(value === undefined ? "" : drawnEntryMarkdown(block, value)).toBe(expected)
  })

  it("memo を寄せた塊は傍注の包みを持ち、寄せた memo の側は空になる", () => {
    const blocks = [
      { kind: "markdown", markdown: "架空の本文", ...PLAIN },
      { kind: "note", tone: "memo", text: "架空の覚え書き", ...PLAIN },
    ] as const
    const [first, second] = reportLeafLayoutOf([{ heading: "", blocks }]).values[0] ?? []

    expect(first === undefined ? "" : drawnEntryMarkdown(blocks[0], first)).toBe(MEMO_MERGED)
    expect(second === undefined ? "" : drawnEntryPresence(blocks[1], second)).toBe("empty")
  })
})
