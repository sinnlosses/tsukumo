// 書き上げの演出と読む深さの重なり。演出はマウントした時点の DOM の重みで掛かるか決まるので、
// 遅れて描く Markdown を、渡された文字列をそのまま出す代役に差し替える。

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useReadingDepth } from "../../../../../src/browser/stores/reading-depth.ts"
import { reportEvents } from "../../../../../src/server/session-driver/core/message/sdk-report-message.ts"
import { mainViewEntries } from "../../../../../src/shared/session/main-view-entry.ts"
import type { MainViewReportRegions } from "../../../../../src/shared/session/main-view-shape.ts"
import { applySessionEvent } from "../../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { checkedToolUseId } from "../../../../fixture/tool-use-id.ts"

vi.mock("../../../../../src/browser/features/report/markdown.tsx", () => ({
  detailBlockClassName: "detail-block",
  arrangedBlockClassNames: {},
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
  Markdown: (props: { readonly text: string }) => <div>{props.text}</div>,
}))

const { Report } = await import("../../../../../src/browser/features/report/report.tsx")

afterEach(() => {
  cleanup()
  useReadingDepth.setState(useReadingDepth.getInitialState(), true)
})

const LONG = "架空の長い段落。".repeat(30)

function longRegions(): MainViewReportRegions {
  const [read] = reportEvents(
    checkedToolUseId("toolu_fictional"),
    {
      components: [
        { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1", "s2"] },
        { id: "s1", component: "Section", heading: "架空の節", children: ["t1"] },
        { id: "t1", component: "Markdown", markdown: LONG },
        { id: "s2", component: "Section", heading: "架空の二", children: ["t2"] },
        { id: "t2", component: "Markdown", markdown: LONG },
      ],
    },
    [],
  )
  if (read?.kind !== "report") throw new Error("report にならなかった")
  const entry = mainViewEntries(applySessionEvent(INITIAL_SESSION_STATE, read, 0)).find(
    (candidate) => candidate.kind === "report",
  )
  if (entry?.kind !== "report") throw new Error("レポートの記録が無い")
  return entry.regions
}

describe("新しい器の紙の書き上げ", () => {
  it("書き上げの最中に深さを替えても、本文の欄は外れない", () => {
    const { container } = render(
      <Report
        reveal={true}
        turnId={1}
        className=""
        revealClassName=""
        blockClassName=""
        body={longRegions()}
      />,
    )
    const body = container.querySelector<HTMLElement>("[data-report-body]")
    const before = body?.children.length
    expect(body?.hasAttribute("data-revealing")).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "一目" }))

    expect(body?.dataset["depth"]).toBe("1")
    expect(body?.children.length).toBe(before)
    expect(body?.textContent).toContain(LONG)
  })
})
