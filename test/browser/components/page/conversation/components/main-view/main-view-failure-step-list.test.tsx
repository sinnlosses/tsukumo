import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { useWorkStripSteps } from "../../../../../../../src/browser/components/page/conversation/stores/work-strip-step-list.ts"
import { loadMarkdown } from "../../../../../../../src/browser/features/report/markdown.tsx"
import { renderMainView } from "../../../../../../fixture/main-view.tsx"
import {
  finishedToolStatus,
  requestRecord,
  toolRecord,
  workPlanRecord,
} from "../../../../../../fixture/session-record.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useWorkStripSteps.setState(useWorkStripSteps.getInitialState(), true)
  window.location.hash = ""
})

describe("MainView（失敗の表示から帯の手順へ）", () => {
  function renderFailed(): void {
    renderMainView(
      [
        requestRecord({ text: "架空の依頼", turnId: 0 }),
        workPlanRecord({ phases: ["架空の段A", "架空の段B"], current: 0 }),
        toolRecord({
          toolUseId: "fake-ok",
          status: finishedToolStatus(),
        }),
        toolRecord({
          toolUseId: "fake-failed",
          status: finishedToolStatus({
            result: { kind: "failed", output: { head: "架空のエラー出力", omittedLength: 0 } },
          }),
        }),
        { kind: "turn-failure", failure: { kind: "execution-error" } },
      ],
      {
        kind: "finished",
        startedAt: 0,
        finishedAt: 100,
        ending: { kind: "failed", failure: { kind: "execution-error" } },
      },
    )
  }

  function showFailedSteps(): void {
    const block = screen.getByRole("note", { name: "失敗で終わった" })
    const button = within(block).getByRole("button", { name: "失敗した手順を見る" })
    act(() => {
      fireEvent.pointerDown(button)
      fireEvent.click(button)
    })
  }

  it("失敗した手順を見る口を押すと、全体の詳細が開き、失敗の行が1つ出る", () => {
    renderFailed()
    expect(screen.queryByRole("region", { name: "依頼の手順" })).toBeNull()

    showFailedSteps()

    const steps = screen.getByRole("region", { name: "依頼の手順" })
    expect(steps.querySelectorAll("[data-step-failed]")).toHaveLength(1)
  })

  it("すでに全体の詳細が開いていても、押したあとに開いていて失敗の行が出る", () => {
    renderFailed()
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^手順 \d+件$/ }))
    })
    expect(screen.queryByRole("region", { name: "依頼の手順" })).not.toBeNull()

    showFailedSteps()

    const steps = screen.getByRole("region", { name: "依頼の手順" })
    expect(steps.querySelectorAll("[data-step-failed]")).toHaveLength(1)
  })
})
