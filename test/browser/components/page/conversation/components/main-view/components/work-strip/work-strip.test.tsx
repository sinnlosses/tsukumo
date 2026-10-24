import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { WorkStrip } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/work-strip/work-strip.tsx"
import { useWorkStripSteps } from "../../../../../../../../../src/browser/stores/work-strip-step-list.ts"
import type { SessionEvent } from "../../../../../../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../../../../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useWorkStripSteps.setState(useWorkStripSteps.getInitialState(), true)
})

const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }

function plan(
  current: number,
  phaseSummary = "",
  phases: Extract<SessionEvent, { readonly kind: "work-plan" }>["phases"] = [
    "架空の段A",
    "架空の段B",
    "架空の段C",
  ],
): Extract<SessionEvent, { readonly kind: "work-plan" }> {
  return {
    kind: "work-plan",
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
    phases,
    current,
    finishedInGroup: [],
    phaseSummary,
  }
}

function bashStarted(id: string): SessionEvent {
  return {
    kind: "tool-started",
    toolUseId: id,
    name: "Bash",
    input: { command: `架空のコマンド ${id}` },
    parentToolUseId: undefined,
  }
}

function bashFinished(id: string): SessionEvent {
  return { kind: "tool-finished", toolUseId: id, content: "架空の結果", isError: false }
}

function stateAfter(events: readonly SessionEvent[]): SessionState {
  return events.reduce(
    (state, event, index) => applySessionEvent(state, event, index),
    INITIAL_SESSION_STATE,
  )
}

function strip(): HTMLElement {
  return screen.getByRole("region", { name: "進み具合" })
}

describe("WorkStrip", () => {
  it("「手順 n」を押すと段ごとに区切った一覧が帯の下に開き、もう一度押すと閉じる", () => {
    putSession(
      stateAfter([
        REQUEST,
        plan(0),
        bashStarted("toolu_1"),
        bashFinished("toolu_1"),
        plan(1),
        bashStarted("toolu_2"),
      ]),
    )
    render(<WorkStrip />)
    const toggle = screen.getByRole("button", { name: /^手順 2/ })

    act(() => {
      fireEvent.click(toggle)
    })
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    const list = screen.getByRole("region", { name: "依頼の手順" })
    expect(list.textContent).toContain("1/3 架空の段A")
    expect(list.textContent).toContain("2/3 架空の段B")

    act(() => {
      fireEvent.click(toggle)
    })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("region", { name: "依頼の手順" })).toBeNull()
  })

  it("API の再試行は帯の2行目に何回目かを出す", () => {
    putSession(
      stateAfter([
        REQUEST,
        plan(0),
        {
          kind: "api-retry",
          retry: {
            attempt: 2,
            maxRetries: 10,
            retryDelayMs: 3000,
            errorStatus: 529,
            error: "overloaded",
          },
        },
      ]),
    )
    render(<WorkStrip />)

    expect(strip().getAttribute("data-work-strip")).toBe("working")
    expect(strip().querySelector("[data-result]")?.textContent).toBe("作業中")
    expect(strip().querySelector("p")?.textContent).toContain("再試行中 2/10")
  })

  it("ターンが終わってバックグラウンドタスクだけ残るあいだは、チップが「背景で作業中」の点で言い、弧は今の段の丸にだけ付く", () => {
    putSession(
      stateAfter([
        REQUEST,
        plan(1),
        {
          kind: "background-tasks-changed",
          tasks: [{ taskId: "fake-bg-1", kind: "shell", description: "架空の待ち" }],
        },
        { kind: "turn-finished", outcome: { kind: "completed" } },
      ]),
    )
    render(<WorkStrip />)

    const chip = strip().querySelector("[data-result]")
    expect(strip().getAttribute("data-work-strip")).toBe("working")
    expect(chip?.getAttribute("data-result")).toBe("background")
    expect(chip?.textContent).toBe("背景で作業中")
    expect(chip?.querySelector("[class*='work-strip-spinner']")).toBeNull()
    expect(chip?.querySelector("[class*='work-strip-dot']")).not.toBeNull()
    const spinning = strip().querySelectorAll("[data-spinning]")
    expect(spinning).toHaveLength(1)
    expect(spinning[0]?.getAttribute("data-phase-state")).toBe("current")
  })

  it("作業中のチップは回らない点だけで、弧は今の段の丸にだけ付く", () => {
    putSession(stateAfter([REQUEST, plan(1)]))
    render(<WorkStrip />)

    const chip = strip().querySelector("[data-result]")
    expect(chip?.getAttribute("data-result")).toBe("working")
    expect(chip?.querySelector("[class*='work-strip-spinner']")).toBeNull()
    expect(chip?.querySelector("[class*='work-strip-dot']")).not.toBeNull()
    const spinning = strip().querySelectorAll("[data-spinning]")
    expect(spinning).toHaveLength(1)
    expect(spinning[0]?.getAttribute("data-phase-state")).toBe("current")
  })

  it("ターンが閉じると帯は済んだ姿の1行で残り、段の数だけ済んだと言う", () => {
    putSession(
      stateAfter([
        REQUEST,
        plan(0),
        bashStarted("toolu_1"),
        bashFinished("toolu_1"),
        plan(3),
        { kind: "turn-finished", outcome: { kind: "completed" } },
      ]),
    )
    render(<WorkStrip />)

    expect(strip().getAttribute("data-work-strip")).toBe("finished")
    expect(strip().textContent).toContain("3段すべて済み")
    const chip = strip().querySelector("[data-result]")
    expect(chip?.getAttribute("data-result")).toBe("done")
    expect(chip?.textContent).toBe("完了")
    expect(chip?.querySelector("[aria-hidden]")?.textContent).toBe("")
    expect(strip().querySelector("p")).toBeNull()
  })
})

describe("WorkStrip（段の丸の吹き出し）", () => {
  /** 段A を済ませてまとめを渡し、段B が今の段、段C がまだの段。 */
  function renderProgressed(extra: readonly SessionEvent[] = []): void {
    putSession(
      stateAfter([
        REQUEST,
        plan(0),
        bashStarted("toolu_1"),
        bashFinished("toolu_1"),
        plan(1, "架空の段Aのまとめ。"),
        bashStarted("toolu_2"),
        ...extra,
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

  it("段の丸は button で、押すと丸の下に吹き出しが出る", () => {
    renderProgressed()
    const done = dot(/架空の段A/)

    expect(done.tagName).toBe("BUTTON")
    expect(done.getAttribute("aria-expanded")).toBe("false")

    click(done)

    expect(done.getAttribute("aria-expanded")).toBe("true")
    const popover = screen.getByRole("dialog")
    expect(done.getAttribute("aria-controls")).toBe(popover.id)
    expect(popover.textContent).toContain("✓ 架空の段A")
    expect(popover.textContent).toContain("済み · 所要")
    expect(popover.textContent).toContain("架空の段Aのまとめ。")
    expect(screen.getByRole("button", { name: "この段の手順へ" })).not.toBeNull()
  })

  it("今の段は名前と経過だけで、まだの段は「これから」だけ。どちらにも「この段の手順へ」は無い", () => {
    renderProgressed()

    click(dot(/架空の段B/))
    expect(screen.getByRole("dialog").textContent).toMatch(/^2\. 架空の段Bいま · この段 /)
    expect(screen.queryByRole("button", { name: "この段の手順へ" })).toBeNull()

    click(dot(/架空の段C/))
    expect(screen.getByRole("dialog").textContent).toBe("3. 架空の段Cこれから")
  })

  it("飛ばした段の丸は「/」と「（飛ばした）」で、吹き出しは「飛ばした · 所要」とわけを出し、「この段の手順へ」は出さない", () => {
    putSession(
      stateAfter([
        REQUEST,
        plan(0),
        { ...plan(1, "飛ばしたわけ。"), skippedPhases: ["架空の段A"] },
        bashStarted("toolu_2"),
      ]),
    )
    render(<WorkStrip />)
    const skipped = dot(/架空の段A（飛ばした）/)

    expect(skipped.textContent).toBe("/")
    expect(skipped.closest("li")?.getAttribute("data-phase-state")).toBe("done")
    expect(skipped.closest("li")?.getAttribute("data-phase-skipped")).toBe("true")

    click(skipped)

    const popover = screen.getByRole("dialog")
    expect(popover.textContent).toContain("/ 架空の段A")
    expect(popover.textContent).toContain("飛ばした · 所要")
    expect(popover.textContent).toContain("飛ばしたわけ。")
    expect(screen.queryByRole("button", { name: "この段の手順へ" })).toBeNull()
  })

  it("済んだ段の丸は飛ばした印を持たず「✓」のまま", () => {
    renderProgressed()
    const done = dot(/架空の段A（済）/)

    expect(done.textContent).toBe("✓")
    expect(done.closest("li")?.hasAttribute("data-phase-skipped")).toBe(false)
  })

  it("答え待ちの今の段の丸も押せて、状態の行が「答え待ち」になる", () => {
    renderProgressed([
      {
        kind: "pending-changed",
        pending: [
          {
            kind: "permission",
            id: "toolu_ask",
            toolName: "Bash",
            input: { command: "架空のコマンド" },
          },
        ],
      },
    ])

    click(dot(/架空の段B（答え待ち）/))

    expect(screen.getByRole("dialog").textContent).toContain("答え待ち · この段 ")
  })

  it("開くのは同時に1つで、別の丸を押すと開き替わり、同じ丸をもう一度押すと閉じる", () => {
    renderProgressed()

    click(dot(/架空の段A/))
    click(dot(/架空の段C/))
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    expect(dot(/架空の段A/).getAttribute("aria-expanded")).toBe("false")
    expect(dot(/架空の段C/).getAttribute("aria-expanded")).toBe("true")

    click(dot(/架空の段C/))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("Esc で閉じて押した丸へフォーカスを戻し、帯の外を押しても閉じる。丸の並びの中を押しても閉じない", () => {
    renderProgressed()
    const done = dot(/架空の段A/)

    click(done)
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" })
    })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(done)

    click(done)
    act(() => {
      fireEvent.pointerDown(screen.getByRole("dialog"))
    })
    expect(screen.queryByRole("dialog")).not.toBeNull()
    act(() => {
      fireEvent.pointerDown(document.body)
    })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("並列の段の中の丸は押せ、並列の段の囲みは button を持たない", () => {
    putSession(
      stateAfter([
        REQUEST,
        plan(1, "架空の段Aのまとめ。", ["架空の段A", ["架空の段B", "架空の段C"]]),
      ]),
    )
    render(<WorkStrip />)

    const group = strip().querySelector("li[aria-label^='並列']")
    expect(group?.querySelectorAll(":scope > button")).toHaveLength(0)
    expect(group?.querySelectorAll("button")).toHaveLength(2)

    click(dot(/架空の段C/))
    expect(screen.getByRole("dialog").textContent).toContain("3. 架空の段C")
  })

  it("「この段の手順へ」で依頼の手順の一覧が開いて吹き出しが閉じ、一覧がその段の区切りへ転がる", () => {
    renderProgressed()
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return new DOMRect(0, this.hasAttribute("data-phase-indexes") ? 300 : 100, 10, 10)
    })

    click(dot(/架空の段A/))
    click(screen.getByRole("button", { name: "この段の手順へ" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    const list = screen.getByRole("region", { name: "依頼の手順" })
    const indexes = [...list.querySelectorAll("[data-phase-indexes]")].map((heading) =>
      heading.getAttribute("data-phase-indexes"),
    )
    expect(indexes).toEqual(["1", "0"])
    expect(list.scrollTop).toBe(200)
  })

  it("やり取りが替わると吹き出しは閉じる", () => {
    renderProgressed()
    click(dot(/架空の段A/))

    act(() => {
      putSession(stateAfter([REQUEST, plan(0), REQUEST, plan(1)]))
    })

    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
