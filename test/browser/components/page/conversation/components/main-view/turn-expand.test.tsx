import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type {
  MainViewReportBody,
  MainViewStepBody,
} from "../../../../../../../src/shared/session/main-view-shape.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { bodyTextOf } from "../../../../../../fixture/main-view-entry.ts"
import { step, turn } from "../../../../../../fixture/turn.ts"
import { putSession } from "../../../../../session-store.ts"

vi.mock("../../../../../../../src/browser/features/report/report.tsx", () => ({
  Report: (props: { readonly body: MainViewReportBody }) =>
    createElement(
      "a2ui-react-report",
      { style: { display: "contents" } },
      <div data-report-stub="yes" data-report-body="">
        {bodyTextOf(props.body)}
      </div>,
    ),
}))

vi.mock("../../../../../../../src/browser/features/report/report-export-copy.ts", () => ({
  reportExport: () => ({ html: "<div>写し</div>", css: "" }),
}))

const { Turn } =
  await import("../../../../../../../src/browser/components/page/conversation/components/main-view/turn.tsx")

afterEach(cleanup)

describe("Turn（最終レポートの「広げる」）", () => {
  const body: MainViewStepBody = {
    kind: "text",
    report: { kind: "markdown", markdown: "架空の本文" },
    firstLine: "架空の本文",
    task: { kind: "task", id: "X-7", name: "架空の作業", outcome: "finished", genre: "work" },
    finishedPhase: { kind: "none" },
    changeSummary: { kind: "none" },
  }

  it("最終レポートには「広げる」が出て、押すと板が開き、「閉じる」で閉じる", () => {
    putSession(INITIAL_SESSION_STATE)
    render(<Turn turn={turn([step({ id: 0, body, mark: "final" })])} newest freshReport={false} />)

    fireEvent.click(screen.getByRole("button", { name: "広げる" }))

    expect(document.querySelectorAll("[data-report-stub]")).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: "閉じる", hidden: true }))
    expect(document.querySelectorAll("[data-report-stub]")).toHaveLength(1)
  })

  it("「HTML で保存」を押すと写しを送り、結果の1行から開く・Finder で表示・閉じるができる", async () => {
    const sent: string[] = []
    putSession(INITIAL_SESSION_STATE, (command) => {
      sent.push(command.procedure)
      return command.procedure === "reportExport.save"
        ? { path: "/tmp/架空/tsukumo-report-X-7.html", fileName: "tsukumo-report-X-7.html" }
        : undefined
    })
    render(<Turn turn={turn([step({ id: 0, body, mark: "final" })])} newest freshReport={false} />)

    fireEvent.click(screen.getByRole("button", { name: "HTML で保存" }))

    expect(await screen.findByText("/tmp/架空/tsukumo-report-X-7.html")).toBeTruthy()
    expect(sent).toEqual(["reportExport.save"])
    fireEvent.click(screen.getByRole("button", { name: "ブラウザで開く" }))
    fireEvent.click(screen.getByRole("button", { name: "Finder で表示" }))
    expect(sent).toEqual([
      "reportExport.save",
      "reportExport.openInBrowser",
      "reportExport.revealInFinder",
    ])
    fireEvent.click(screen.getByRole("button", { name: "知らせを閉じる" }))
    expect(screen.queryByText("/tmp/架空/tsukumo-report-X-7.html")).toBeNull()
  })

  it("保存が断られたら理由と「もう一度」が出る", async () => {
    putSession(INITIAL_SESSION_STATE, () => Promise.reject(new Error("架空の失敗")))
    render(<Turn turn={turn([step({ id: 0, body, mark: "final" })])} newest freshReport={false} />)

    fireEvent.click(screen.getByRole("button", { name: "HTML で保存" }))

    expect(await screen.findByText("保存できなかった")).toBeTruthy()
    expect(screen.getByRole("button", { name: "もう一度" })).toBeTruthy()
  })

  it("板の下端の帯にも「HTML で保存」が出る", () => {
    putSession(INITIAL_SESSION_STATE)
    render(<Turn turn={turn([step({ id: 0, body, mark: "final" })])} newest freshReport={false} />)

    fireEvent.click(screen.getByRole("button", { name: "広げる" }))

    expect(screen.getAllByRole("button", { name: "HTML で保存", hidden: true })).toHaveLength(2)
  })

  it("中間レポートには「HTML で保存」が出ない", () => {
    putSession(INITIAL_SESSION_STATE)
    render(
      <Turn
        turn={turn([step({ id: 0, body, mark: "interim-kept" })])}
        newest
        freshReport={false}
      />,
    )

    expect(screen.queryByRole("button", { name: "HTML で保存", hidden: true })).toBeNull()
  })

  it("中間レポートには「広げる」が出ない", () => {
    putSession(INITIAL_SESSION_STATE)
    render(
      <Turn
        turn={turn([step({ id: 0, body, mark: "interim-kept" })])}
        newest
        freshReport={false}
      />,
    )

    expect(screen.queryByRole("button", { name: "広げる", hidden: true })).toBeNull()
  })
})
