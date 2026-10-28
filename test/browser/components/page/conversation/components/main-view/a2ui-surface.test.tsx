import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { reportEvents } from "../../../../../../../src/server/session-driver/core/sdk-report-message.ts"
import { mainViewEntries } from "../../../../../../../src/shared/session/main-view-entry.ts"
import type { MainViewReportRegions } from "../../../../../../../src/shared/session/main-view-shape.ts"
import { applySessionEvent } from "../../../../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"

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
    Markdown: (props: { readonly text: string }) => (
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
    figure: "fig",
    children: ["s1", "s2", "p0"],
  },
  { id: "fig", component: "Mermaid", title: "架空の図", source: "flowchart TD\n  A --> B" },
  { id: "s1", component: "Section", heading: "架空の表", children: ["t1", "m1", "p1"] },
  {
    id: "t1",
    component: "Table",
    title: "架空の表の題",
    columns: ["架空の列", "架空の数"],
    rows: [["架空の値", "1"]],
    aside: "架空の出典",
  },
  { id: "m1", component: "Note", tone: "memo", text: "架空の覚え書き。" },
  { id: "p1", component: "Paragraph", text: LONG },
  { id: "s2", component: "Section", heading: "架空の二", children: ["p2"] },
  { id: "p2", component: "Paragraph", text: "架空の二の段落。" },
  { id: "p0", component: "Paragraph", text: "架空の根の段落。" },
]

const ROW_PARTS = [
  { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1"] },
  { id: "s1", component: "Section", heading: "架空の並び", children: ["p1", "r1", "p4"] },
  { id: "p1", component: "Paragraph", text: "架空の前。" },
  { id: "r1", component: "Row", children: ["c1", "p3"] },
  { id: "c1", component: "Card", child: "p2" },
  { id: "p2", component: "Paragraph", text: "架空の左。" },
  { id: "p3", component: "Paragraph", text: "架空の右。" },
  { id: "p4", component: "Paragraph", text: "架空の後ろ。" },
]

describe("部品の一覧のある本文（A2UI の面）", () => {
  it("配置の部品の無い一覧は、欄の Markdown で描いたときと本文の根の中の DOM が同じで、面の入れ物が 1 枚だけ挟まる", () => {
    const withComponents = regionsOf({ components: PARTS })
    const withoutComponents: MainViewReportRegions = { ...withComponents, a2ui: { kind: "none" } }
    expect(withComponents.a2ui.kind).toBe("surface")

    const surface = render(<Report reveal={false} turnId={1} className="" body={withComponents} />)
    const surfaceBody = surface.container.querySelector("[data-report-body]")?.innerHTML
    const hosts = surface.container.querySelectorAll("a2ui-react-report").length
    const otherHosts = [...surface.container.querySelectorAll("[data-report-body] *")].filter(
      (element) => element.localName.startsWith("a2ui-"),
    ).length
    cleanup()
    const plain = render(<Report reveal={false} turnId={1} className="" body={withoutComponents} />)

    expect(surfaceBody).toBe(plain.container.querySelector("[data-report-body]")?.innerHTML)
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
    ).toEqual(["## 架空の並び", "架空の前。", "row", "架空の後ろ。"])
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
