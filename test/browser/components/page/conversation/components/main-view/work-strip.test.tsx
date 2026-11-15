import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { NowLine } from "../../../../../../../src/browser/components/page/conversation/components/main-view/now-line.tsx"
import { WorkStrip } from "../../../../../../../src/browser/components/page/conversation/components/main-view/work-strip.tsx"
import { useWorkStripSteps } from "../../../../../../../src/browser/components/page/conversation/stores/work-strip-step-list.ts"
import type { SessionEvent } from "../../../../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import { reportEvent } from "../../../../../../fixture/report-event.ts"
import { requestEvent } from "../../../../../../fixture/session-event.ts"
import { checkedTaskId } from "../../../../../../fixture/task-id.ts"
import { checkedToolUseId } from "../../../../../../fixture/tool-use-id.ts"
import { putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useWorkStripSteps.setState(useWorkStripSteps.getInitialState(), true)
})

const REQUEST = requestEvent()

/** チップの語のうち読み上げられる（隠していない）もの。 */
function chipLabel(chip?: Element | null): string | null | undefined {
  return chip?.querySelector("[class*='work-strip-chip-labels'] > span:not([aria-hidden])")
    ?.textContent
}

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
    phaseIds: [],
    phases,
    current,
    finishedInGroup: [],
    phaseSummary,
  }
}

function bashStarted(id: string): SessionEvent {
  return {
    kind: "tool-started",
    toolUseId: checkedToolUseId(id),
    name: "Bash",
    input: { command: `架空のコマンド ${id}` },
    parentToolUseId: undefined,
  }
}

function bashFinished(id: string): SessionEvent {
  return {
    kind: "tool-finished",
    toolUseId: checkedToolUseId(id),
    content: "架空の結果",
    isError: false,
  }
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
    expect(list.textContent).toContain("架空の段A")
    expect(list.textContent).toContain("架空の段B")
    expect(list.textContent).toContain("架空の段C")

    act(() => {
      fireEvent.click(toggle)
    })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("region", { name: "依頼の手順" })).toBeNull()
  })

  it("API の再試行は流れの末尾の行に何回目かを出す", () => {
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
    render(
      <>
        <WorkStrip />
        <NowLine viewingPast={false} />
      </>,
    )

    expect(strip().getAttribute("data-work-strip")).toBe("working")
    expect(chipLabel(strip().querySelector("[data-result]"))).toBe("作業中")
    expect(document.querySelector("[data-now-line]")?.textContent).toContain("再試行中 2/10")
  })

  it("ターンが終わってバックグラウンドタスクだけ残るあいだは、チップが「背景で作業中」の点で言い、今の段の丸は回らない", () => {
    putSession(
      stateAfter([
        REQUEST,
        plan(1),
        {
          kind: "background-tasks-changed",
          tasks: [{ taskId: checkedTaskId("fake-bg-1"), kind: "shell", description: "架空の待ち" }],
        },
        { kind: "turn-finished", outcome: { kind: "completed" } },
      ]),
    )
    render(<WorkStrip />)

    const chip = strip().querySelector("[data-result]")
    expect(strip().getAttribute("data-work-strip")).toBe("working")
    expect(chip?.getAttribute("data-result")).toBe("background")
    expect(chipLabel(chip)).toBe("背景で作業中")
    expect(chip?.querySelector("[class*='work-strip-spinner']")).toBeNull()
    expect(chip?.querySelector("[class*='work-strip-dot']")).not.toBeNull()
    expect(strip().querySelector("[data-spinning]")).toBeNull()
    expect(strip().querySelectorAll("[data-phase-state='current']")).toHaveLength(1)
  })

  it("作業中のチップも今の段の丸も回る印を持たない", () => {
    putSession(stateAfter([REQUEST, plan(1)]))
    render(<WorkStrip />)

    const chip = strip().querySelector("[data-result]")
    expect(chip?.getAttribute("data-result")).toBe("working")
    expect(chip?.querySelector("[class*='work-strip-spinner']")).toBeNull()
    expect(chip?.querySelector("[class*='work-strip-dot']")).not.toBeNull()
    expect(strip().querySelector("[data-spinning]")).toBeNull()
    expect(strip().querySelectorAll("[data-phase-state='current']")).toHaveLength(1)
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
    expect(strip().textContent).toContain("3フェーズすべて済み")
    const chip = strip().querySelector("[data-result]")
    expect(chip?.getAttribute("data-result")).toBe("done")
    expect(chipLabel(chip)).toBe("完了")
    expect(chip?.querySelector("[aria-hidden]")?.textContent).toBe("")
    expect(strip().querySelector("p")).toBeNull()
  })
})

describe("WorkStrip（段の丸）", () => {
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

  it("段の丸は button で、押しても吹き出しは出ず、依頼の手順の一覧が開く", () => {
    renderProgressed()
    const done = dot(/架空の段A/)

    expect(done.tagName).toBe("BUTTON")
    expect(screen.queryByRole("region", { name: "依頼の手順" })).toBeNull()

    click(done)

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("region", { name: "依頼の手順" })).not.toBeNull()
  })

  it("一覧は全フェーズを順に並べ、済んだ段の手順は畳み、今の段の手順は開き、まだの段は名前だけ", () => {
    renderProgressed()

    click(dot(/架空の段A/))

    const rows = [
      ...screen
        .getByRole("region", { name: "依頼の手順" })
        .querySelectorAll("li[data-phase-state]"),
    ]
    expect(rows.map((row) => row.getAttribute("data-phase-state"))).toEqual([
      "done",
      "current",
      "upcoming",
    ])
    const details = rows.map((row) => row.querySelector("details")?.open)
    expect(details).toEqual([false, true, undefined])
    expect(rows[2]?.textContent).toContain("架空の段C")
    expect(rows[0]?.textContent).not.toContain("架空の段Aのまとめ。")
  })

  it("丸を押しても一覧は押し直すまで閉じず、同じ丸をもう一度押しても開いたまま", () => {
    renderProgressed()

    click(dot(/架空の段A/))
    click(dot(/架空の段C/))
    click(dot(/架空の段C/))
    act(() => {
      fireEvent.pointerDown(document.body)
    })

    expect(screen.getAllByRole("region", { name: "依頼の手順" })).toHaveLength(1)
  })

  it("飛ばした段の丸は「/」と「（飛ばした）」で、一覧の行にも飛ばした印が付く", () => {
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

    const row = screen
      .getByRole("region", { name: "依頼の手順" })
      .querySelector("li[data-phase-skipped]")
    expect(row?.textContent).toContain("架空の段A（飛ばした）")
  })

  it("済んだ段の丸は飛ばした印を持たず「✓」のまま", () => {
    renderProgressed()
    const done = dot(/架空の段A（済）/)

    expect(done.textContent).toBe("✓")
    expect(done.closest("li")?.hasAttribute("data-phase-skipped")).toBe(false)
  })

  it("答え待ちの今の段の丸も押せて、一覧の行は開いた手順を持つ", () => {
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

    const row = screen
      .getByRole("region", { name: "依頼の手順" })
      .querySelector("li[data-phase-state='asking']")
    expect(row?.querySelector("details")?.open).toBe(true)
  })

  it("並列のフェーズの中の丸は押せ、並列のフェーズの囲みは button を持たない", () => {
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
    const list = screen.getByRole("region", { name: "依頼の手順" })
    expect(list.querySelectorAll("li[data-phase-state]")).toHaveLength(3)
  })

  it("丸を押すと一覧が開き、そのフェーズの行が一覧の上端へ転がる", () => {
    renderProgressed()
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return new DOMRect(0, this.hasAttribute("data-phase-indexes") ? 300 : 100, 10, 10)
    })

    click(dot(/架空の段A/))

    expect(screen.queryByRole("dialog")).toBeNull()
    const list = screen.getByRole("region", { name: "依頼の手順" })
    const indexes = [...list.querySelectorAll("[data-phase-indexes]")].map((heading) =>
      heading.getAttribute("data-phase-indexes"),
    )
    expect(indexes).toEqual(["0", "1", "2"])
    expect(list.scrollTop).toBe(200)
  })

  it("やり取りが替わると一覧は閉じる", () => {
    renderProgressed()
    click(dot(/架空の段A/))

    act(() => {
      putSession(stateAfter([REQUEST, plan(0), REQUEST, plan(1)]))
    })

    expect(screen.queryByRole("region", { name: "依頼の手順" })).toBeNull()
  })
})

describe("WorkStrip（所要時間）", () => {
  const FINISHED_EVENTS: readonly SessionEvent[] = [
    REQUEST,
    plan(0),
    plan(1, "架空の段Aのまとめ。"),
    reportEvent({ toolUseId: "toolu_r1", conclusion: "架空の結論。" }),
    { kind: "turn-finished", outcome: { kind: "completed" } },
  ]

  function openSteps(): HTMLElement {
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^手順/ }))
    })
    return screen.getByRole("region", { name: "依頼の手順" })
  }

  it("済んだ姿で手順を開くと、一覧の末尾に計とフェーズの数と帯が出て、一覧の行は重ねない", () => {
    putSession(stateAfter(FINISHED_EVENTS))
    render(<WorkStrip />)

    const list = openSteps()

    expect(list.textContent).toContain("3 フェーズ")
    expect(list.querySelector("[class*='phase-band']")).not.toBeNull()
    expect(screen.queryByRole("table", { name: "フェーズごとの所要時間" })).toBeNull()
  })

  it("作業中は帯を出さない", () => {
    putSession(stateAfter([REQUEST, plan(0), plan(1, "架空の段Aのまとめ。")]))
    render(<WorkStrip />)

    const list = openSteps()

    expect(list.textContent).not.toContain("3 フェーズ")
    expect(list.querySelector("[class*='phase-band']")).toBeNull()
  })

  it("ワークプランの無い済んだ姿では帯を出さない", () => {
    putSession(
      stateAfter([
        REQUEST,
        bashStarted("toolu_1"),
        bashFinished("toolu_1"),
        reportEvent({ toolUseId: "toolu_r1", conclusion: "架空の結論。" }),
        { kind: "turn-finished", outcome: { kind: "completed" } },
      ]),
    )
    render(<WorkStrip />)

    const list = openSteps()

    expect(list.querySelector("[class*='phase-band']")).toBeNull()
  })
})
