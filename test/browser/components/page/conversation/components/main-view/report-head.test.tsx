import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ReportHead } from "../../../../../../../src/browser/components/page/conversation/components/main-view/report-head.tsx"
import { useTaskBoardRequest } from "../../../../../../../src/browser/stores/task-board-request.ts"
import type { MainViewPhaseLabel } from "../../../../../../../src/shared/session/main-view-shape.ts"
import { knownTaskSummary, taskStatusOfWord } from "../../../../../../fixture/session-state.ts"
import { putSession, stateWith } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  useTaskBoardRequest.setState(useTaskBoardRequest.getInitialState(), true)
})

function catalog(phase: MainViewPhaseLabel): string {
  const { container } = render(
    <ReportHead
      label="interim"
      task={{ kind: "none" }}
      phase={phase}
      changeSummary={{ kind: "none" }}
      className=""
    />,
  )
  return container.querySelector("p")?.textContent ?? ""
}

describe("ReportHead の終えた段", () => {
  it("済んだ段は見出しと所要だけを出す", () => {
    expect(
      catalog({
        kind: "phase",
        label: "1/3 架空の段A",
        duration: { kind: "known", milliseconds: 12_000 },
        skipped: false,
      }),
    ).toBe("中間レポート1/3 架空の段A所要 12秒")
  })

  it("飛ばした段は所要の前に「飛ばした」を添え、所要は残す", () => {
    expect(
      catalog({
        kind: "phase",
        label: "1/3 架空の段A",
        duration: { kind: "known", milliseconds: 0 },
        skipped: true,
      }),
    ).toBe("中間レポート1/3 架空の段A飛ばした所要 0秒")
  })
})

describe("ReportHead のタスクID", () => {
  function renderWithTask(reportId: string): void {
    putSession(
      stateWith({
        tasks: knownTaskSummary([
          {
            id: "xy-12",
            summary: "架空のタスク",
            status: taskStatusOfWord("todo"),
            dependencies: [],
            waitingFor: [],
            labels: [],
            difficulty: undefined,
            loopable: undefined,
            importance: "normal",
            urgency: "normal",
            body: "",
            location: { kind: "none" },
          },
        ]),
      }),
    )
    render(
      <ReportHead
        label="final"
        task={{
          kind: "task",
          id: reportId,
          name: "架空",
          outcome: "finished",
          genre: "unspecified",
        }}
        phase={{ kind: "none" }}
        changeSummary={{ kind: "none" }}
        className=""
      />,
    )
  }

  it("一覧の ID と大文字小文字が違ってもボタンになり、押すと一覧の ID でモーダルを開く", () => {
    renderWithTask("XY-12")
    fireEvent.click(screen.getByRole("button", { name: "XY-12" }))
    expect(useTaskBoardRequest.getState().request).toEqual({
      kind: "open",
      focus: { kind: "task", id: "xy-12" },
    })
  })

  it("一覧に無い ID は字だけのまま", () => {
    renderWithTask("XY-99")
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByText("XY-99")).toBeTruthy()
  })
})
