import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { mainViewDraftOf } from "../../../../../../../src/browser/domain/main-view/a2ui-draft-view.ts"
import { reportEvents } from "../../../../../../../src/server/session-driver/core/sdk-report-message.ts"
import { mainViewEntries } from "../../../../../../../src/shared/session/main-view-entry.ts"
import type { MainViewReportRegions } from "../../../../../../../src/shared/session/main-view-shape.ts"
import { applySessionEvent } from "../../../../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { STAGED_PARTS } from "../../../../../../fixture/a2ui-component.ts"

// `Markdown`（本物は react-markdown 一式で重い）を、渡された塊の文字列をそのまま出す代役に差し替える。
// 2つの描き方が同じ塊を同じ入れ子で渡すかは、代役の DOM の一致で確かめられる。
vi.mock(
  "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx",
  () => ({
    detailBlockClassName: "detail-block",
    arrangedBlockClassNames: {
      row: "report-block-row",
      rowCell: "report-block-row-cell",
      panel: "report-block-panel",
    },
    leafFrameClassNames: {},
    textLeafClassNames: {},
    noteLeafClassNames: {},
    tableLeafClassNames: {},
    matrixLeafClassNames: {},
    compareLeafClassNames: {},
    statsLeafClassNames: {},
    checksClassName: () => undefined,
    tagToneClassName: () => "",
    FoldedTableBody: (props: { readonly children: ReactNode }) => <tbody>{props.children}</tbody>,
    InlineCodeText: (props: { readonly text: string }) => <>{props.text}</>,
    InlineMarkdown: (props: { readonly text: string }) => <>{props.text}</>,
    NoteLabel: (props: { readonly label: string }) => <span>{props.label}</span>,
    Markdown: (props: { readonly text: string }) =>
      props.text.startsWith("## ") ? (
        <h4>{props.text.slice(3)}</h4>
      ) : (
        <div data-markdown-stub="yes">{props.text}</div>
      ),
  }),
)

const { Report } =
  await import("../../../../../../../src/browser/components/page/conversation/components/main-view/report.tsx")

afterEach(() => {
  cleanup()
})

const LONG = "架空の長い段落。".repeat(30)

const PARTS = [
  {
    id: "root",
    component: "Report",
    conclusion: ["架空の結論。"],
    children: ["s1", "s2", "p0"],
  },
  { id: "s1", component: "Section", heading: "架空の表", children: ["t1", "m1", "p1"] },
  { id: "t1", component: "Markdown", markdown: "架空の段落。", aside: "架空の出典" },
  { id: "m1", component: "Note", tone: "memo", text: "架空の覚え書き。" },
  { id: "p1", component: "Markdown", markdown: LONG },
  { id: "s2", component: "Section", heading: "架空の二", children: ["p2"] },
  { id: "p2", component: "Markdown", markdown: "架空の二の段落。" },
  { id: "p0", component: "Markdown", markdown: "架空の根の段落。" },
]

const ROW_PARTS = [
  { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1"] },
  { id: "s1", component: "Section", heading: "架空の並び", children: ["p1", "r1", "p4"] },
  { id: "p1", component: "Markdown", markdown: "架空の前。" },
  { id: "r1", component: "Row", children: ["c1", "p3"] },
  { id: "c1", component: "Card", child: "p2" },
  { id: "p2", component: "Markdown", markdown: "架空の左。" },
  { id: "p3", component: "Markdown", markdown: "架空の右。" },
  { id: "p4", component: "Markdown", markdown: "架空の後ろ。" },
]

const INTERACTIVE_PARTS = [
  { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1"] },
  { id: "s1", component: "Section", heading: "架空の操作", children: ["pick", "t1"] },
  {
    id: "pick",
    component: "ChoicePicker",
    label: "架空の種別",
    options: [
      { label: "甲", value: "甲" },
      { label: "乙", value: "乙" },
    ],
    value: { path: "/view/t1/filter" },
  },
  {
    id: "t1",
    component: "Table",
    title: "架空の表",
    columns: ["架空の名", "架空の種別", "架空の数"],
    rows: [
      ["ぼ", "甲", "10"],
      ["あ", "乙", "9"],
      ["ん", "甲", "100"],
    ],
    sortable: true,
    filterable: true,
  },
]

/** 表の本文の行の先頭のセルを、描かれた順に返す。 */
function bodyRowNames(container: HTMLElement): readonly string[] {
  return [...container.querySelectorAll("tbody tr")].map(
    (row) => row.firstElementChild?.textContent ?? "",
  )
}

describe("操作できる Table と ChoicePicker", () => {
  it("見出しを押すと並びが変わり、押し直すと降順、もう一度で元に戻る", () => {
    const body = regionsOf({ components: INTERACTIVE_PARTS })
    const { container } = render(<Report reveal={false} turnId={1} className="" body={body} />)
    expect(bodyRowNames(container)).toEqual(["ぼ", "あ", "ん"])

    fireEvent.click(screen.getByRole("button", { name: "架空の数" }))
    expect(bodyRowNames(container)).toEqual(["あ", "ぼ", "ん"])

    fireEvent.click(screen.getByRole("button", { name: /架空の数/ }))
    expect(bodyRowNames(container)).toEqual(["ん", "ぼ", "あ"])

    fireEvent.click(screen.getByRole("button", { name: /架空の数/ }))
    expect(bodyRowNames(container)).toEqual(["ぼ", "あ", "ん"])
  })

  it("ChoicePicker の選択で行が絞られ、選び直すと戻る", () => {
    const body = regionsOf({ components: INTERACTIVE_PARTS })
    const { container } = render(<Report reveal={false} turnId={1} className="" body={body} />)

    fireEvent.click(screen.getByRole("button", { name: "乙" }))
    expect(bodyRowNames(container)).toEqual(["あ"])

    fireEvent.click(screen.getByRole("button", { name: "甲" }))
    expect(bodyRowNames(container)).toEqual(["ぼ", "ん"])

    fireEvent.click(screen.getByRole("button", { name: "甲" }))
    expect(bodyRowNames(container)).toEqual(["ぼ", "あ", "ん"])
  })

  it("どの行にも当たらない選びでは、見出しの行だけの表と「該当する行はありません」が出る", () => {
    const parts = INTERACTIVE_PARTS.map((part) =>
      part.id === "pick"
        ? { ...part, options: [...(part.options ?? []), { label: "丙", value: "丙" }] }
        : part,
    )
    const body = regionsOf({ components: parts })
    const { container } = render(<Report reveal={false} turnId={1} className="" body={body} />)

    fireEvent.click(screen.getByRole("button", { name: "丙" }))

    expect(bodyRowNames(container)).toEqual([])
    expect([...container.querySelectorAll("thead th")].map((cell) => cell.textContent)).toEqual([
      "架空の名",
      "架空の種別",
      "架空の数",
    ])
    expect(screen.getByText("該当する行はありません")).toBeTruthy()
  })

  it("sortable・filterable を使わない Table は部品が直接描き、ボタンを出さない", () => {
    const plainParts = INTERACTIVE_PARTS.filter((part) => part.id !== "pick").map((part) =>
      part.id === "t1" ? { ...part, sortable: undefined, filterable: undefined } : part,
    )
    const body = regionsOf({
      components: plainParts.map((part) =>
        part.id === "s1" ? { ...part, children: ["t1"] } : part,
      ),
    })
    const { container } = render(<Report reveal={false} turnId={1} className="" body={body} />)

    expect(screen.queryAllByRole("button")).toEqual([])
    expect(
      [...container.querySelectorAll("[data-report-region] table tbody tr")].map(
        (row) => row.firstElementChild?.textContent,
      ),
    ).toEqual(["ぼ", "あ", "ん"])
  })
})

describe("Divider", () => {
  const dividerParts = (axis: object) => [
    { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1"] },
    { id: "s1", component: "Section", heading: "架空の区切り", children: ["p1", "d1", "p2"] },
    { id: "p1", component: "Markdown", markdown: "架空の前。" },
    { id: "d1", component: "Divider", ...axis },
    { id: "p2", component: "Markdown", markdown: "架空の後ろ。" },
  ]

  it("Section の中の 2 つの部品の間に罫が 1 つ引かれる", () => {
    const body = regionsOf({ components: dividerParts({}) })
    const { container } = render(<Report reveal={false} turnId={1} className="" body={body} />)

    const rules = [...container.querySelectorAll("[data-report-region] hr")]
    expect(rules).toHaveLength(1)
    expect(rules[0]?.previousElementSibling?.textContent).toBe("架空の前。")
    expect(rules[0]?.nextElementSibling?.textContent).toBe("架空の後ろ。")
    expect(rules[0]?.getAttribute("aria-orientation")).toBeNull()
  })

  it("axis が vertical なら縦の罫になる", () => {
    const body = regionsOf({ components: dividerParts({ axis: "vertical" }) })
    const { container } = render(<Report reveal={false} turnId={1} className="" body={body} />)

    expect(container.querySelector("hr")?.getAttribute("aria-orientation")).toBe("vertical")
  })
})

describe("Quote", () => {
  it("Section の中の Quote は欄の Markdown を通らず、文と出典を直接描く", () => {
    const body = regionsOf({
      components: [
        { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1"] },
        { id: "s1", component: "Section", heading: "架空の引用", children: ["p1", "q1"] },
        { id: "p1", component: "Markdown", markdown: "架空の前。" },
        { id: "q1", component: "Quote", text: "架空の引用の一文", source: "架空の出典" },
      ],
    })
    const { container } = render(<Report reveal={false} turnId={1} className="" body={body} />)

    const paragraphs = [...container.querySelectorAll('[data-report-region="section"] p')].map(
      (paragraph) => paragraph.textContent,
    )
    expect(paragraphs).toEqual(["架空の引用の一文", "— 架空の出典"])
    expect(
      [...container.querySelectorAll("[data-markdown-stub]")].some((stub) =>
        stub.textContent.includes("架空の引用の一文"),
      ),
    ).toBe(false)
  })
})

describe("頭とお願い（A2UI の面）", () => {
  it("結論・数の札・お願いは欄の Markdown を通らず、値から直接描く", () => {
    const keyFigures = [
      { before: "", value: "14", total: "", label: "架空の区画", series: [], better: "" },
      { before: "", value: "9", total: "", label: "架空の未了", series: [], better: "" },
      { before: "", value: "21", total: "", label: "架空の済み", series: [], better: "" },
    ]
    const body = regionsOf({
      components: PARTS.map((part) =>
        part.id === "root" ? { ...part, keyFigures, favor: "架空のお願い。" } : part,
      ),
    })
    const { container } = render(<Report reveal={false} turnId={1} className="" body={body} />)

    const head = container.querySelector('[data-report-region="head"]')
    expect(head?.querySelector(":scope > div > p")?.textContent).toBe("架空の結論。")
    expect(head?.querySelectorAll("b")[0]?.textContent).toBe("14")
    const favor = container.querySelector('[data-report-region="favor"]')
    expect(favor?.id).toBe(body.favor.id)
    expect(favor?.textContent).toContain("お願い")
    expect(favor?.textContent).toContain("架空のお願い。")
    const stubs = [...container.querySelectorAll("[data-markdown-stub]")].map(
      (stub) => stub.textContent,
    )
    expect(stubs.some((text) => text.includes("架空の結論。") || text.includes("架空の区画"))).toBe(
      false,
    )
  })
})

describe("部品の一覧のある本文（A2UI の面）", () => {
  it("配置の部品の無い一覧は、欄の Markdown で描いたときと本文の根の中の DOM が同じで、面の入れ物が 1 枚だけ挟まる", () => {
    const withComponents = regionsOf({ components: PARTS })
    const withoutComponents: MainViewReportRegions = { ...withComponents, a2ui: { kind: "none" } }
    expect(withComponents.a2ui.kind).toBe("surface")

    const bodyWithoutHead = (container: HTMLElement) => {
      const body = container.querySelector("[data-report-body]")?.cloneNode(true)
      if (!(body instanceof HTMLElement)) {
        throw new Error("本文の根が無い")
      }
      body.querySelector('[data-report-region="head"]')?.remove()
      return body.innerHTML
    }
    const surface = render(<Report reveal={false} turnId={1} className="" body={withComponents} />)
    const surfaceBody = bodyWithoutHead(surface.container)
    const hosts = surface.container.querySelectorAll("a2ui-react-report").length
    const otherHosts = [...surface.container.querySelectorAll("[data-report-body] *")].filter(
      (element) => element.localName.startsWith("a2ui-"),
    ).length
    cleanup()
    const plain = render(<Report reveal={false} turnId={1} className="" body={withoutComponents} />)

    expect(surfaceBody).toBe(bodyWithoutHead(plain.container))
    expect(surfaceBody).toContain("架空の覚え書き。")
    expect([hosts, otherHosts]).toEqual([1, 0])
  })

  it("演出は面の中の本文の根に掛かる（根を描いた時点で本文が揃っている）", () => {
    const body = regionsOf({ components: PARTS })
    const { container } = render(<Report reveal={true} turnId={1} className="" body={body} />)

    expect(container.querySelector("[data-report-body]")?.hasAttribute("data-revealing")).toBe(true)
  })

  it("Row は節の欄の中に子の数だけ区画を並べ、Card は枠で包み、前後の葉は欄の塊のまま", () => {
    const body = regionsOf({ components: ROW_PARTS })
    const { container } = render(<Report reveal={false} turnId={1} className="" body={body} />)

    const region = container.querySelector('[data-report-section="0"]')
    const row = region?.querySelector(':scope > [class*="report-block-row"]')
    const cells = row?.querySelectorAll(':scope > [class*="report-block-row-cell"]')
    expect(cells?.length).toBe(2)
    expect(cells?.[0]?.querySelector('[class*="report-block-panel"]')?.textContent).toBe(
      "架空の左。",
    )
    expect(cells?.[1]?.textContent).toBe("架空の右。")
    expect(
      [...(region?.children ?? [])].map((child) =>
        child === row ? "row" : (child.textContent ?? ""),
      ),
    ).toEqual(["架空の並び", "架空の前。", "row", "架空の後ろ。"])
    expect(region?.firstElementChild?.tagName).toBe("H4")
  })

  it("記法の字を含む見出しは、h4 を React で描かず欄の Markdown に任せる", () => {
    const body = regionsOf({
      components: ROW_PARTS.map((part) =>
        part.component === "Section" ? { ...part, heading: "架空の `code` 見出し" } : part,
      ),
    })
    const { container } = render(<Report reveal={false} turnId={1} className="" body={body} />)

    const region = container.querySelector('[data-report-section="0"]')
    expect(region?.firstElementChild?.textContent).toBe("架空の `code` 見出し")
  })

  it("Row のある本文でも、欄の並びと見出しの数は欄の Markdown で描いたときと同じ", () => {
    const withComponents = regionsOf({ components: ROW_PARTS })
    const surface = render(<Report reveal={false} turnId={1} className="" body={withComponents} />)
    const regionsWith = regionAttributes(surface.container)
    cleanup()
    const plain = render(
      <Report
        reveal={false}
        turnId={1}
        className=""
        body={{ ...withComponents, a2ui: { kind: "none" } }}
      />,
    )

    expect(regionsWith).toEqual(regionAttributes(plain.container))
  })

  it("部品の一覧が伸びた本文で描き直すと、同じ面のまま増えた葉が出る", () => {
    const early = mainViewDraftOf("toolu_drafted", STAGED_PARTS.slice(0, 3))?.regions
    const grown = mainViewDraftOf("toolu_drafted", STAGED_PARTS)?.regions
    if (early === undefined || grown === undefined) {
      throw new Error("根のある一覧から草稿が作れなかった")
    }
    const { container, rerender } = render(
      <Report reveal={false} turnId={1} className="" body={early} />,
    )
    const host = container.querySelector("a2ui-react-report")
    expect(container.textContent).not.toContain("架空の段落三")

    rerender(<Report reveal={false} turnId={1} className="" body={grown} />)

    expect(container.textContent).toContain("架空の段落三")
    expect(container.querySelector("a2ui-react-report")).toBe(host)
  })
})

function regionsOf(input: Readonly<Record<string, unknown>>): MainViewReportRegions {
  const [event] = reportEvents("toolu_fictional", input, [])
  if (event?.kind !== "report") throw new Error("report にならなかった")
  const entry = mainViewEntries(applySessionEvent(INITIAL_SESSION_STATE, event, 0)).find(
    (candidate) => candidate.kind === "report",
  )
  if (entry?.kind !== "report") throw new Error("レポートの記録が無い")
  return entry.regions
}

function regionAttributes(container: HTMLElement): readonly string[] {
  return [...container.querySelectorAll("[data-report-region]")].map(
    (region) =>
      `${region.getAttribute("data-report-region") ?? ""}:${region.getAttribute("data-report-section") ?? ""}`,
  )
}
