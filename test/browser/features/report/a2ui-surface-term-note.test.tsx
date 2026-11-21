import { cleanup, render } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { reportEvents } from "../../../../src/server/session-driver/core/message/sdk-report-message.ts"
import { mainViewEntries } from "../../../../src/shared/session/main-view-entry.ts"
import type { MainViewReportRegions } from "../../../../src/shared/session/main-view-shape.ts"
import { applySessionEvent } from "../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { checkedToolUseId } from "../../../fixture/tool-use-id.ts"

// `InlineMarkdown` は代役にし、欄が受け取った注の語と札の id を印に出す（点線と札の描き方は rehype-term-note のテストが見る）。
vi.mock("../../../../src/browser/features/report/markdown.tsx", async () => {
  const { useTermNotesFor } =
    await import("../../../../src/browser/features/report/leaf/term-note-scope.tsx")
  function InlineMarkdown(props: { readonly text: string }) {
    const notes = useTermNotesFor(props.text)
    return (
      <>
        {props.text}
        {[...notes].map(([term, entry]) => (
          <mark key={term} data-term={term} data-card-id={entry.cardId} />
        ))}
      </>
    )
  }
  return {
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
    InlineMarkdown,
  }
})

vi.mock("../../../../src/browser/stores/browser-error-report.ts", () => ({
  reportBrowserError: vi.fn<(route: string, error: unknown) => void>(),
}))

const { Report } = await import("../../../../src/browser/features/report/report.tsx")

const NO_CLASS_NAMES = { className: "", revealClassName: "", blockClassName: "" }

const paragraph = (id: string, text: string) => ({
  id,
  component: "Paragraph",
  text,
  fold: "",
  aside: "",
})

const TWO_SECTIONS = [
  { id: "s1", component: "Section", heading: "架空の節一", children: ["p1"] },
  { id: "s2", component: "Section", heading: "架空の節二", children: ["p2"] },
  paragraph("p1", "架空語の文。"),
  paragraph("p2", "また架空語の文。"),
]

afterEach(() => {
  cleanup()
})

describe("用語の注の初出", () => {
  it("2つの節の段落に同じ語があっても、最初の節の段落の1か所だけが注を受け取る", () => {
    const body = regionsOf({
      components: [
        {
          id: "root",
          component: "Report",
          conclusion: ["架空の結論。"],
          children: ["s1", "s2"],
          terms: [{ term: "架空語", note: "架空の注。" }],
        },
        ...TWO_SECTIONS,
      ],
    })
    const { container } = render(
      <Report reveal={false} turnId={7} {...NO_CLASS_NAMES} body={body} />,
    )
    const marks = [...container.querySelectorAll("mark[data-term]")]

    expect(
      marks.map((mark) => [mark.getAttribute("data-term"), mark.getAttribute("data-card-id")]),
    ).toEqual([["架空語", "report-term-7-1"]])
    expect(marks[0]?.parentElement?.textContent).toContain("架空語の文。")
    expect(marks[0]?.parentElement?.textContent).not.toContain("また")
  })

  it("terms の無いレポートでは、どの欄も注を受け取らない", () => {
    const body = regionsOf({
      components: [
        {
          id: "root",
          component: "Report",
          conclusion: ["架空の結論。"],
          children: ["s1", "s2"],
        },
        ...TWO_SECTIONS,
      ],
    })
    const { container } = render(
      <Report reveal={false} turnId={7} {...NO_CLASS_NAMES} body={body} />,
    )

    expect(container.querySelectorAll("mark[data-term]")).toHaveLength(0)
  })
})

function regionsOf(input: Readonly<Record<string, unknown>>): MainViewReportRegions {
  const [event] = reportEvents(checkedToolUseId("toolu_fictional"), input, [])
  if (event?.kind !== "report") throw new Error("report にならなかった")
  const entry = mainViewEntries(applySessionEvent(INITIAL_SESSION_STATE, event, 0)).find(
    (candidate) => candidate.kind === "report",
  )
  if (entry?.kind !== "report") throw new Error("レポートの記録が無い")
  return entry.regions
}
