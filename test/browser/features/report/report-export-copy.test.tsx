import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { loadMarkdown } from "../../../../src/browser/features/report/markdown.tsx"
import { Markdown } from "../../../../src/browser/features/report/renderer/markdown-renderer.tsx"
import { ReportFold } from "../../../../src/browser/features/report/renderer/report-fold.tsx"
import { reportExport } from "../../../../src/browser/features/report/report-export-copy.ts"
import { Report } from "../../../../src/browser/features/report/report.tsx"
import { UNREADABLE_FILE_EXCERPT } from "../../../../src/shared/repository/file-excerpt.ts"
import { PLAIN_LEAF_VALUE, renderDirectLeaf } from "../../../fixture/direct-leaf-compare.tsx"
import { regionsOfParts } from "../../../fixture/report-region.ts"
import { stubRepositoryFileLink } from "../../../fixture/repository-file-link.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.head.replaceChildren()
  document.body.replaceChildren()
})

/** 写しの HTML を、文書に繋がない要素に読み戻す。 */
function parsed(html: string): Element {
  const holder = document.createElement("div")
  holder.innerHTML = html
  const [copy] = holder.children
  if (copy === undefined) throw new Error("写しが空")
  return copy
}

function firstChild(container: HTMLElement): Element {
  const root = container.firstElementChild
  if (root === null) throw new Error("根が描かれていない")
  return root
}

const COMPARE_VIEW_KEY = "tsukumo-compare-view:v1"

const side = (heading: string, point: string) => ({ kind: "points", heading, points: [point] })

const PARTS = [
  { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1"] },
  {
    id: "s1",
    component: "Section",
    heading: "架空の節",
    children: ["tabs", "pair", "k", "t1"],
  },
  {
    id: "tabs",
    component: "Tabs",
    tabs: [
      { title: "架空の一", child: "p1" },
      { title: "架空の二", child: "p2" },
    ],
  },
  { id: "p1", component: "Paragraph", text: "架空の段落一" },
  { id: "p2", component: "Paragraph", text: "架空の段落二" },
  {
    id: "pair",
    component: "Compare",
    title: "架空の対",
    relation: "before-after",
    sides: [side("今", "左A"), side("採ったあと", "右A")],
    fold: "",
    aside: "",
  },
  {
    id: "k",
    component: "ParameterSlider",
    name: "n",
    label: "架空の件数",
    min: 1,
    max: 4,
    step: 1,
    initial: 2,
  },
  {
    id: "t1",
    component: "Table",
    title: "架空の表",
    columns: ["架空の名", "架空の種別"],
    rows: [
      ["ぼ", "甲"],
      ["あ", "乙"],
      ["ん", "甲"],
    ],
    filterable: true,
    filterColumn: 1,
  },
]

describe("最終レポートの写し", () => {
  it("切り替えた形のまま写し、切り替えの口とつまみは値の1行に替え、隠れた中身は写さない", () => {
    const { container } = render(
      <Report
        reveal={false}
        turnId={1}
        className=""
        revealClassName=""
        blockClassName=""
        body={regionsOfParts(PARTS)}
      />,
    )
    fireEvent.click(screen.getByRole("tab", { name: "架空の二" }))
    fireEvent.click(screen.getByRole("button", { name: "採ったあとだけ" }))
    fireEvent.click(screen.getByRole("button", { name: /^甲/ }))
    const root = firstChild(container)
    const screenBefore = root.outerHTML

    const copy = parsed(reportExport(root).html)

    expect(root.outerHTML).toBe(screenBefore)
    expect(copy.querySelector('[role="tablist"]')).toBeNull()
    expect(copy.querySelector('[role="group"]')).toBeNull()
    expect(copy.querySelector("input")).toBeNull()
    expect(copy.querySelector("[data-report-export]")).toBeNull()
    const lines = [...copy.querySelectorAll("p")].map((line) => line.textContent)
    expect(lines).toEqual(expect.arrayContaining(["架空の二", "架空の件数: 2"]))
    expect(copy.textContent).toContain("架空の段落二")
    expect(copy.textContent).not.toContain("架空の段落一")
    expect(copy.textContent).toContain("右A")
    expect(copy.textContent).not.toContain("左A")
    const rows = (element: Element) =>
      [...element.querySelectorAll("tbody tr")].map((row) => row.textContent)
    expect(rows(copy)).toEqual(["ぼ甲", "ん甲"])
    expect(rows(copy)).toEqual(rows(root))
  })

  it.each([
    ["並べる", "side"],
    ["切り替え", "switch"],
    ["重ねる", "overlay"],
  ])(
    "画像の前後比べは「%s」の見せ方のまま写し、見せ方の口・見本・つまみを落とす",
    (choice, view) => {
      localStorage.removeItem(COMPARE_VIEW_KEY)
      const { container } = renderDirectLeaf(
        {
          id: "b1",
          component: "Compare",
          title: "架空の前後",
          relation: "before-after",
          sides: [
            { heading: "", kind: "image", path: "架空/before.png" },
            { heading: "", kind: "image", path: "架空/after.png" },
          ],
          fold: "",
          aside: "",
        },
        { kind: "shelved", toolUseId: "fictional-report", sizes: [], unshelved: [] },
        { ...PLAIN_LEAF_VALUE, captionNumber: { kind: "figure", ordinal: 1 } },
      )
      for (const image of container.querySelectorAll("img")) {
        Object.defineProperty(image, "naturalWidth", { value: 40 })
        Object.defineProperty(image, "naturalHeight", { value: 20 })
        fireEvent.load(image)
      }
      fireEvent.click(screen.getByRole("button", { name: choice }))
      const root = firstChild(container)
      const notZoom = (element: Element) =>
        [...element.querySelectorAll("button")].filter(
          (button) => button.getAttribute("aria-label") !== "この画像を拡大",
        )
      expect(root.querySelector("[data-view]")?.getAttribute("data-view")).toBe(view)
      expect(notZoom(root).length).toBeGreaterThan(0)

      const copy = parsed(reportExport(root).html)
      localStorage.removeItem(COMPARE_VIEW_KEY)

      expect(copy.querySelector("[data-view]")?.getAttribute("data-view")).toBe(view)
      expect(copy.querySelector('[role="group"]')).toBeNull()
      expect(copy.querySelector('input:not([type="checkbox"])')).toBeNull()
      expect(notZoom(copy)).toEqual([])
      const zoomed = [...copy.querySelectorAll('input[type="checkbox"]')].map(
        (toggle) => toggle.nextElementSibling?.querySelector("img") ?? undefined,
      )
      expect(zoomed.filter((image) => image !== undefined)).toHaveLength(2)
      expect(copy.querySelector("[data-report-export]")).toBeNull()
      expect(copy.querySelectorAll("img")).toHaveLength(2)
    },
  )

  it("コピーのボタンを落とし、押せるパスは押せない code の字にし、コードの中身は変えない", () => {
    const stub = stubRepositoryFileLink(["src/fictional.ts"], UNREADABLE_FILE_EXCERPT)
    const { container } = render(
      stub.wrap(
        <Markdown text={"見て `src/fictional.ts:12` を直した\n\n```ts\nconst 架空 = 1\n```"} />,
      ),
    )
    stub.restore()
    const root = container
    expect(root.querySelector('[role="button"]')).not.toBeNull()
    expect(root.querySelector("button")).not.toBeNull()
    const tooltip = root.querySelector('[role="tooltip"]')?.textContent ?? ""
    expect(tooltip).not.toBe("")

    const copy = parsed(reportExport(root).html)

    expect(copy.querySelector('[role="button"]')).toBeNull()
    expect(copy.querySelector("button")).toBeNull()
    expect(copy.querySelector('[role="tooltip"]')).toBeNull()
    const codes = [...copy.querySelectorAll("code")].map((code) => code.textContent)
    expect(codes).toEqual(expect.arrayContaining(["src/fictional.ts:12"]))
    expect(copy.querySelector("pre")?.textContent).toContain("const 架空 = 1")
    expect(copy.textContent).toBe(root.textContent?.replace(tooltip, ""))
  })

  it("畳みは保存したときの開き方の details にし、見出しと中身をそのまま移す", () => {
    const { container } = render(
      <>
        <Markdown text={"<details><summary>架空の見出し</summary>\n\n架空の中身\n\n</details>"} />
        <ReportFold trigger="架空の開いた見出し" defaultOpen={true}>
          架空の開いた中身
        </ReportFold>
      </>,
    )

    const copy = parsed(reportExport(container).html)

    const details = [...copy.querySelectorAll("details")]
    expect(details.map((element) => element.open)).toEqual([false, true])
    expect(details.map((element) => element.querySelector("summary")?.textContent)).toEqual([
      "架空の見出し",
      "架空の開いた見出し",
    ])
    expect(details[0]?.textContent).toContain("架空の中身")
    expect(copy.querySelector("button")).toBeNull()
  })

  it("検証結果の「通った n件」の畳みも details にし、押さずに開ける見出しにする", () => {
    const check = (status: string, label: string) => ({
      status,
      label,
      figure: "",
      command: "",
      detail: status === "ok" ? "" : "架空の理由",
      howToVerify: "",
    })
    const body = regionsOfParts([
      {
        id: "root",
        component: "Report",
        conclusion: ["架空の結論。"],
        children: ["p1"],
        checks: [check("ok", "架空の単体"), check("ng", "架空の E2E")],
        favor: "",
      },
      { id: "p1", component: "Markdown", markdown: "架空の段落。" },
    ])
    const { container } = render(
      <Report
        reveal={false}
        turnId={1}
        className=""
        revealClassName=""
        blockClassName=""
        body={body}
      />,
    )
    expect(container.textContent).toContain("✓ 通った 1件")

    const copy = parsed(reportExport(firstChild(container)).html)

    const summaries = [...copy.querySelectorAll("details > summary")].map(
      (summary) => summary.textContent,
    )
    expect(summaries.some((text) => text.includes("✓ 通った 1件"))).toBe(true)
    expect(copy.querySelector("details")?.textContent).toContain("架空の単体")
  })

  it("押すと拡大する図は、直前のチェックボックスと中に敷いた label で開閉する形にする", () => {
    const root = document.createElement("div")
    root.innerHTML =
      '<div class="figure" role="button" tabindex="0" aria-label="この図を拡大" data-report-export-zoom=""><svg viewBox="0 0 10 10"></svg></div>'
    document.body.append(root)

    const copy = parsed(reportExport(root).html)

    const toggle = copy.querySelector('input[type="checkbox"]')
    const figure = toggle?.nextElementSibling
    expect(figure?.localName).toBe("div")
    expect(figure?.getAttribute("role")).toBeNull()
    expect(figure?.querySelector("svg")).not.toBeNull()
    expect(figure?.querySelector("label")?.htmlFor).toBe(toggle?.id)
    expect(copy.querySelector("[data-report-export-zoom]")).toBeNull()
  })

  it("canvas は描いた画を img に替える", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAAA")
    const root = document.createElement("div")
    root.innerHTML =
      '<figure><canvas aria-label="架空の図" width="40" height="20"></canvas></figure>'
    document.body.append(root)

    const copy = parsed(reportExport(root).html)

    expect(root.querySelector("canvas")).not.toBeNull()
    expect(copy.querySelector("canvas")).toBeNull()
    const image = copy.querySelector("img")
    expect(image?.getAttribute("src")).toBe("data:image/png;base64,AAAA")
    expect(image?.getAttribute("alt")).toBe("架空の図")
  })

  describe("焼いた色のトークンへの復元", () => {
    const SVG_NS = "http://www.w3.org/2000/svg"
    const MAP = '{"#aabbcc":"--surface-raised","#112233":"--ink"}'
    const figure = (themed: boolean): HTMLPreElement => {
      const pre = document.createElement("pre")
      if (themed) {
        pre.setAttribute("data-report-export", "themed-svg")
        pre.setAttribute("data-report-export-value", MAP)
      }
      const svg = document.createElementNS(SVG_NS, "svg")
      const style = document.createElementNS(SVG_NS, "style")
      style.textContent = ".a { fill: #AABBCC; stroke: #112233; color: rgb(17, 34, 51); }"
      const rect = document.createElementNS(SVG_NS, "rect")
      rect.setAttribute("fill", "#aabbcc")
      rect.setAttribute("stroke", "#445566")
      rect.setAttribute("style", "color:#112233")
      svg.append(style, rect)
      pre.append(svg)
      return pre
    }

    it("印の付いた SVG の style と属性にある対応の hex だけを var(--トークン, #hex) にし、印を外す", () => {
      const root = document.createElement("div")
      root.append(figure(true))
      document.body.append(root)

      const { html } = reportExport(root)

      expect(html).toContain(
        ".a { fill: var(--surface-raised, #AABBCC); stroke: var(--ink, #112233); color: var(--ink, rgb(17, 34, 51)); }",
      )
      expect(html).toContain('fill="var(--surface-raised, #aabbcc)"')
      expect(html).toContain('stroke="#445566"')
      expect(html).toContain('style="color:var(--ink, #112233)"')
      expect(html).not.toContain("data-report-export")
    })

    it("印の外にある同じ hex は替えない", () => {
      const root = document.createElement("div")
      root.append(figure(false), figure(true))
      document.body.append(root)

      const [outside, inside] = reportExport(root).html.split("</pre>")

      expect(outside).toContain('fill="#aabbcc"')
      expect(outside).toContain(".a { fill: #AABBCC; stroke: #112233; color: rgb(17, 34, 51); }")
      expect(inside).toContain('fill="var(--surface-raised, #aabbcc)"')
    })
  })

  describe("出典と用語の注", () => {
    const withNotes = (terms: readonly { term: string; note: string }[]) => [
      {
        id: "root",
        component: "Report",
        conclusion: ["架空の結論。"],
        children: ["s1"],
        sources: [
          { id: "a", title: "架空の出典A", url: "https://a.example.com/x" },
          { id: "b", title: "架空の出典B", url: "https://b.example.org/y" },
        ],
        ...(terms.length > 0 ? { terms } : {}),
      },
      { id: "s1", component: "Section", heading: "架空の節", children: ["p1"] },
      {
        id: "p1",
        component: "Paragraph",
        text: "架空語乙は先、架空語甲は後。{{cite: b}}と{{cite: a}}。",
        fold: "",
        aside: "",
      },
    ]
    const TERMS = [
      { term: "架空語甲", note: "甲の注。" },
      { term: "架空語乙", note: "乙の注。" },
    ]
    const renderNotes = (terms: readonly { term: string; note: string }[]) =>
      render(
        <Report
          reveal={false}
          turnId={3}
          className=""
          revealClassName=""
          blockClassName=""
          body={regionsOfParts(withNotes(terms))}
        />,
      )

    it("札を落とし、バッジの行き先と出典の一覧を残し、用語を本文の順の注n と末尾の一覧に開く", () => {
      const { container } = renderNotes(TERMS)
      const root = firstChild(container)
      const screenBefore = root.outerHTML
      const list = root.querySelector('section[aria-label="用語"]')

      expect(list?.hasAttribute("hidden")).toBe(true)
      const copy = parsed(reportExport(root).html)

      expect(root.outerHTML).toBe(screenBefore)
      expect(copy.querySelector('[role="tooltip"]')).toBeNull()
      const rowIds = [...copy.querySelectorAll('section[aria-label="出典"] li')].map(
        (row) => row.id,
      )
      const hrefs = [...copy.querySelectorAll("a[href^='#']")].map((a) => a.getAttribute("href"))
      expect(hrefs).toEqual(rowIds.map((id) => `#${id}`))
      expect(copy.querySelector('section[aria-label="出典"] li a')?.getAttribute("href")).toMatch(
        /^https:/,
      )
      expect([...copy.querySelectorAll("sup")].map((sup) => sup.textContent)).toEqual([
        "注1",
        "注2",
      ])
      const termList = copy.querySelector('section[aria-label="用語"]')
      expect(termList?.hasAttribute("hidden")).toBe(false)
      expect([...(termList?.querySelectorAll("dt") ?? [])].map((dt) => dt.textContent)).toEqual([
        "注1 架空語乙",
        "注2 架空語甲",
      ])
      expect([...(termList?.querySelectorAll("dd") ?? [])].map((dd) => dd.textContent)).toEqual([
        "乙の注。",
        "甲の注。",
      ])
      expect(copy.querySelector("[data-report-export]")).toBeNull()
      expect(copy.querySelector("[data-report-export-value]")).toBeNull()
      expect(copy.querySelector("[aria-describedby^='report-term']")).toBeNull()
    })

    it("用語の無いレポートでは用語の一覧を写さない", () => {
      const { container } = renderNotes([])

      const copy = parsed(reportExport(firstChild(container)).html)

      expect(copy.querySelector('section[aria-label="用語"]')).toBeNull()
      expect(copy.querySelector("sup")).toBeNull()
    })
  })
})

describe("書き出しの CSS", () => {
  it("写しに当たる規則と、それが参照する custom property だけを集め、当たらない規則は集めない", () => {
    const style = document.createElement("style")
    style.textContent = `
:root { --ink: #123456; --lead-ink: var(--ink); --unused: red; }
.paper { padding: 4px; }
.lead { color: var(--lead-ink); }
.lead::before { content: "※"; }
.absent { color: blue; }
@media (max-width: 640px) { .lead { font-size: 12px; } .absent { margin: 0; } }
@media print { .absent { display: none; } }
@keyframes lead-in { from { opacity: 0; } }
@keyframes unused-in { from { opacity: 0; } }
.paper { animation: lead-in 1s; }
`
    document.head.append(style)
    const root = document.createElement("div")
    root.className = "paper"
    root.innerHTML = `<p class="lead">架空の結論</p>`
    document.body.append(root)

    const { css } = reportExport(root)

    expect(css).toContain(".paper { padding: 4px; }")
    expect(css).toContain(".lead { color: var(--lead-ink); }")
    expect(css).toContain('.lead::before { content: "※"; }')
    expect(css).toMatch(/@media \(max-width: 640px\) \{\s*\.lead \{ font-size: 12px; \}\s*\}/)
    expect(css).toContain("@keyframes lead-in")
    expect(css).toMatch(/:root \{[^}]*--lead-ink: #123456;[^}]*\}/)
    expect(css).not.toContain(".absent")
    expect(css).not.toContain("@media print")
    expect(css).not.toContain("unused-in")
    expect(css).not.toContain("--unused")
  })
})
