import { cleanup, render } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { regionsOfInput } from "../../../fixture/report-region.ts"

// `Markdown` は代役にする（行内の印の描き方は rehype-inline-mark のテストが見る）。
vi.mock("../../../../src/browser/features/report/markdown.tsx", () => ({
  detailBlockClassName: "detail-block",
  arrangedBlockClassNames: { row: "", rowCell: "", panel: "" },
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
  NoteLabel: (props: { readonly label: string }) => <span>{props.label}</span>,
  Markdown: (props: { readonly text: string }) => <div>{props.text}</div>,
  InlineMarkdown: (props: { readonly text: string }) => <>{props.text}</>,
}))

vi.mock("../../../../src/browser/stores/browser-error-report.ts", () => ({
  reportBrowserError: vi.fn<(route: string, error: unknown) => void>(),
}))

const { Report } = await import("../../../../src/browser/features/report/report.tsx")

const NO_CLASS_NAMES = { className: "", revealClassName: "", blockClassName: "" }

const SOURCES = [
  { id: "a", title: "架空の出典A", url: "https://a.example.com/x" },
  { id: "b", title: "架空の出典B", url: "https://www.example.org/y#z" },
]

const paragraph = (id: string, text: string) => ({
  id,
  component: "Paragraph",
  text,
  fold: "",
  aside: "",
})

afterEach(() => {
  cleanup()
})

describe("本文の末尾の出典の一覧", () => {
  it("本文で初めて指された順に番号を振り、番号・題・ホスト名を並べ、行の id はレポートごとに一意", () => {
    const body = regionsOfInput({
      components: [
        {
          id: "root",
          component: "Report",
          conclusion: ["架空の結論。"],
          children: ["s1"],
          sources: SOURCES,
        },
        { id: "s1", component: "Section", heading: "架空の節", children: ["p1", "p2"] },
        paragraph("p1", "架空{{cite: b}}。"),
        paragraph("p2", "架空{{cite: a b}}。"),
      ],
    })
    const { container } = render(
      <Report reveal={false} turnId={7} {...NO_CLASS_NAMES} body={body} />,
    )
    const rows = [...container.querySelectorAll('section[aria-label="出典"] li')]

    expect(rows.map((row) => [row.id, row.textContent])).toEqual([
      ["report-source-7-b", "1架空の出典Bwww.example.org"],
      ["report-source-7-a", "2架空の出典Aa.example.com"],
    ])
    expect(rows[0]?.querySelector("a")?.getAttribute("href")).toBe("https://www.example.org/y#z")
  })

  it("sources の無いレポートでは一覧を出さない", () => {
    const body = regionsOfInput({
      components: [
        { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["p1"] },
        paragraph("p1", "架空の段落。"),
      ],
    })
    const { container } = render(
      <Report reveal={false} turnId={7} {...NO_CLASS_NAMES} body={body} />,
    )

    expect(container.querySelector('section[aria-label="出典"]')).toBeNull()
  })
})
