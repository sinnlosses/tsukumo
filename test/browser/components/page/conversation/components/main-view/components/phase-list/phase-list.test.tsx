import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type {
  MainViewStep,
  MainViewTurn,
} from "../../../../../../../../../src/shared/session/main-view.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../../../src/shared/session/session-state.ts"
import { queryClientWrapper } from "../../../../../../../query-client.tsx"
import { putSession } from "../../../../../../../session-store.ts"

// 本物の Markdown は遅延で読み込まれる重い部品なので、本文の字をそのまま出す代役に差し替える。
vi.mock(
  "../../../../../../../../../src/browser/components/page/conversation/components/main-view/markdown/deferred-markdown.tsx",
  () => ({
    Markdown: (props: { readonly text: string }) => <div>{props.text}</div>,
  }),
)

const { PhaseList } =
  await import("../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/phase-list/phase-list.tsx")

afterEach(() => {
  cleanup()
})

function interim(id: number, title: string, seconds: number): MainViewStep {
  return {
    id,
    body: {
      kind: "text",
      report: `${title}の本文`,
      finalReport: `${title}の本文`,
      firstLine: title,
      task: { kind: "none" },
      finishedPhase: {
        kind: "phase",
        label: title,
        duration: { kind: "known", milliseconds: seconds * 1000 },
      },
    },
    interim: true,
    superseded: true,
    final: false,
    actions: [],
    asides: [],
  }
}

const TURN: MainViewTurn = {
  id: 1,
  request: { text: "架空の依頼", images: [] },
  steps: [interim(0, "段A", 136), interim(1, "段B", 160), interim(2, "段C", 157)],
  hasInterimReport: true,
  droppedCount: 0,
  failure: { kind: "none" },
}

function renderList(turn: MainViewTurn = TURN): void {
  putSession(INITIAL_SESSION_STATE)
  render(<PhaseList turn={turn} planCount={5} turnId={turn.id} />, {
    wrapper: queryClientWrapper(),
  })
}

function sheet(): HTMLElement {
  const dialog = document.querySelector("dialog")
  if (dialog === null) {
    throw new Error("板が無い")
  }
  return dialog
}

describe("PhaseList", () => {
  it("中間レポートを1行ずつ(✓・番号・題・所要)で並べる", () => {
    renderList()
    const rows = screen.getAllByRole("button", { name: /^✓|段/u })
    expect(rows).toHaveLength(3)
    expect(rows[0]?.textContent).toContain("段A")
    expect(rows[0]?.textContent).toContain("2:16")
    expect(rows[1]?.textContent).toContain("2:40")
  })

  it("中間レポートが無いときは何も描かない", () => {
    renderList({ ...TURN, steps: [] })
    expect(document.body.textContent).toBe("")
  })

  it("行を押すと板が開き、頭に n/N · 所要・題、中に本文が出る", () => {
    renderList()
    fireEvent.click(screen.getByRole("button", { name: /段B/u }))

    expect(sheet().hasAttribute("open")).toBe(true)
    expect(within(sheet()).getByText("2/5 · 2:40")).toBeTruthy()
    expect(within(sheet()).getByText("段Bの本文")).toBeTruthy()
  })

  it("‹ › で前後の段の本文に替わり、端では押せない側が aria-disabled になる", () => {
    renderList()
    fireEvent.click(screen.getByRole("button", { name: /段A/u }))

    const previous = within(sheet()).getByRole("button", { name: /^前の段/u })
    expect(previous.getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(previous)
    expect(within(sheet()).getByText("段Aの本文")).toBeTruthy()

    fireEvent.click(within(sheet()).getByRole("button", { name: "次の段 2/5" }))
    expect(within(sheet()).getByText("段Bの本文")).toBeTruthy()

    fireEvent.click(within(sheet()).getByRole("button", { name: "次の段 3/5" }))
    const next = within(sheet()).getByRole("button", { name: /^次の段/u })
    expect(next.getAttribute("aria-disabled")).toBe("true")
  })

  it("Esc(close イベント)で板が閉じる", () => {
    renderList()
    fireEvent.click(screen.getByRole("button", { name: /段A/u }))
    fireEvent(sheet(), new Event("close"))

    expect(sheet().hasAttribute("open")).toBe(false)
  })
})
