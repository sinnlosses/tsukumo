import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { WorkStrip } from "../../../../../../../src/browser/components/page/conversation/components/main-view/work-strip.tsx"
import { useWorkStripSteps } from "../../../../../../../src/browser/components/page/conversation/stores/work-strip-step-list.ts"
import { isOverlayOpen } from "../../../../../../../src/browser/hooks/open-overlay.ts"
import { requestEvent } from "../../../../../../fixture/session-event.ts"
import {
  bashFinished,
  bashStarted,
  plan,
  stateAfter,
} from "../../../../../../fixture/work-strip-event.ts"
import { putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useWorkStripSteps.setState(useWorkStripSteps.getInitialState(), true)
})

const REQUEST = requestEvent()

/** 段A を済ませてまとめを渡し、段B が今の段、段C がまだの段。 */
function renderProgressed(): void {
  putSession(
    stateAfter([
      REQUEST,
      plan(0),
      bashStarted("toolu_1"),
      bashFinished("toolu_1"),
      plan(1, "架空の段Aのまとめ。"),
      bashStarted("toolu_2"),
    ]),
  )
  render(<WorkStrip />)
}

function dot(name: RegExp): HTMLElement {
  return screen.getByRole("button", { name })
}

function click(element: HTMLElement): void {
  act(() => {
    fireEvent.click(element)
  })
}

function detailOf(name: string): HTMLElement | null {
  return screen.queryByRole("region", { name: `${name} の詳細` })
}

describe("WorkStrip（フェーズの詳細の開閉）", () => {
  it("別の区間を押すと詳細が入れ替わり、同じ区間をもう一度押すと閉じる", () => {
    renderProgressed()

    click(dot(/架空の段A/))
    click(dot(/架空の段C/))
    const swapped = [detailOf("架空の段A"), detailOf("架空の段C")]
    click(dot(/架空の段C/))

    expect(swapped.map((detail) => detail === null)).toEqual([true, false])
    expect(detailOf("架空の段C")).toBeNull()
  })

  it("外を押すと詳細が閉じ、押した区間と詳細の中を押しても閉じない", () => {
    renderProgressed()
    click(dot(/架空の段A/))

    act(() => {
      fireEvent.pointerDown(detailOf("架空の段A") ?? document.body)
    })
    const insideDetail = detailOf("架空の段A")
    act(() => {
      fireEvent.pointerDown(dot(/架空の段A/))
    })
    const onSegment = detailOf("架空の段A")
    act(() => {
      fireEvent.pointerDown(document.body)
    })

    expect(insideDetail).not.toBeNull()
    expect(onSegment).not.toBeNull()
    expect(detailOf("架空の段A")).toBeNull()
  })

  it("Esc で閉じて、フォーカスが押した区間へ戻る", () => {
    renderProgressed()
    const done = dot(/架空の段A/)
    click(done)

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" })
    })

    expect(detailOf("架空の段A")).toBeNull()
    expect(document.activeElement).toBe(done)
  })

  it("開いているあいだは重なりが開いている印になり、閉じると外れる", () => {
    renderProgressed()

    const before = isOverlayOpen()
    click(dot(/架空の段A/))
    const during = isOverlayOpen()
    click(dot(/架空の段A/))

    expect([before, during, isOverlayOpen()]).toEqual([false, true, false])
  })

  it("詳細と手順の一覧は同時に1つだけ開き、片方を開くともう片方は閉じる", () => {
    renderProgressed()

    click(dot(/架空の段A/))
    click(screen.getByRole("button", { name: /^手順/ }))
    const stepsOpen = screen.queryByRole("region", { name: "依頼の手順" })
    const detailAfterSteps = detailOf("架空の段A")
    click(dot(/架空の段A/))

    expect(stepsOpen).not.toBeNull()
    expect(detailAfterSteps).toBeNull()
    expect(detailOf("架空の段A")).not.toBeNull()
    expect(screen.queryByRole("region", { name: "依頼の手順" })).toBeNull()
  })

  it("一覧の題は、今のフェーズだけが強調の対象（in-progress）で、強調の印が列に付く", () => {
    renderProgressed()
    click(screen.getByRole("button", { name: /^手順/ }))

    const list = screen.getByRole("region", { name: "依頼の手順" })
    const progress = [...list.querySelectorAll("span[data-progress]")].map((label) => [
      label.textContent,
      label.getAttribute("data-progress"),
    ])
    expect(progress).toEqual([
      ["架空の段A", "completed"],
      ["架空の段B", "in-progress"],
      ["架空の段C", "not-started"],
    ])
    expect(list.querySelector("ol[data-emphasis]")?.getAttribute("data-emphasis")).toBe("active")
  })

  it("今のフェーズが無い並び（全部済み）でも、済んだフェーズは済みの印で描かれる", () => {
    putSession(stateAfter([REQUEST, plan(2, "", ["架空の段A", "架空の段B"])]))
    render(<WorkStrip />)
    click(screen.getByRole("button", { name: /^手順/ }))

    const list = screen.getByRole("region", { name: "依頼の手順" })
    const progress = [...list.querySelectorAll("span[data-progress]")].map((label) =>
      label.getAttribute("data-progress"),
    )
    expect(progress).toEqual(["completed", "completed"])
  })

  it("詳細を開いても帯の見出しは替わらない", () => {
    renderProgressed()
    const head = (): string | null | undefined =>
      screen.getByRole("region", { name: "進み具合" }).querySelector("[class*='work-strip-head']")
        ?.textContent
    const before = head()

    click(dot(/架空の段A/))

    expect(head()).toBe(before)
  })
})
