import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { WorkStrip } from "../../../../../../../src/browser/components/page/conversation/components/main-view/work-strip.tsx"
import { useWorkStripSteps } from "../../../../../../../src/browser/components/page/conversation/stores/work-strip-step-list.ts"
import type { SessionEvent } from "../../../../../../../src/shared/session/session-event.ts"
import { reportEvent } from "../../../../../../fixture/report-event.ts"
import { requestEvent } from "../../../../../../fixture/session-event.ts"
import { checkedTaskId } from "../../../../../../fixture/task-id.ts"
import {
  bashFinished,
  bashStarted,
  plan,
  stateAfter,
} from "../../../../../../fixture/work-strip-event.ts"
import { foldTimed, START } from "../../../../../../fixture/work-strip.ts"
import { putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useWorkStripSteps.setState(useWorkStripSteps.getInitialState(), true)
})

const REQUEST = requestEvent()

/** 状態の印の右の見出し。 */
function headLabel(): string | null | undefined {
  return strip().querySelector("[class*='work-strip-head']")?.textContent
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
    const toggle = screen.getByRole("button", { name: "手順" })

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

  it("作業中は縦線の右にいまの手順の一文と秒を出し、答え待ちでは一文を出さず状態の表の「許可 n件」を出す", () => {
    putSession(stateAfter([REQUEST, plan(0), bashStarted("toolu_1")]))
    render(<WorkStrip />)

    const sentence = strip().querySelector("[data-work-strip-now]")
    expect(sentence?.querySelector("[class*='work-strip-now-head']")?.textContent).toBe(
      "架空のコマンド",
    )
    expect(sentence?.textContent).toContain("toolu_1")
    expect(sentence?.textContent).not.toContain("走らせています")
    expect(sentence?.textContent).toContain("秒")
    expect(strip().querySelector("[class*='work-strip-rule']")).not.toBeNull()

    act(() => {
      putSession(
        stateAfter([
          REQUEST,
          plan(0),
          bashStarted("toolu_1"),
          {
            kind: "pending-changed",
            pending: [
              {
                kind: "permission",
                id: "toolu_1",
                toolName: "Bash",
                input: { command: "架空のコマンド" },
              },
            ],
          },
        ]),
      )
    })

    expect(strip().querySelector("[data-work-strip-now]")).toBeNull()
    expect(strip().textContent).toContain("許可 1件")
  })

  it("API の再試行はプログレスバーの一文に何回目かを出す", () => {
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
    expect(strip().querySelector("[data-result]")?.getAttribute("data-result")).toBe("working")
    expect(headLabel()).toBe("架空の段A")
    const sentence = strip().querySelector("[data-work-strip-now]")?.textContent
    expect(sentence).toContain("API の応答を待っています")
    expect(sentence).toContain("2回目の再試行")
  })

  it("ターンが終わってバックグラウンドタスクだけ残るあいだは、チップが「バックグラウンドで作業中」の点で言い、回る印を持たない", () => {
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
    expect(headLabel()).toBe("架空の段B")
    expect(chip?.querySelector("[class*='work-strip-spinner']")).toBeNull()
    expect(chip?.querySelector("[class*='work-strip-dot']")).not.toBeNull()
    expect(strip().querySelector("[data-spinning]")).toBeNull()
    expect(strip().querySelectorAll("[data-segment-state='current']")).toHaveLength(1)
  })

  it("作業中のチップも今の区間も回る印を持たない", () => {
    putSession(stateAfter([REQUEST, plan(1)]))
    render(<WorkStrip />)

    const chip = strip().querySelector("[data-result]")
    expect(chip?.getAttribute("data-result")).toBe("working")
    expect(chip?.querySelector("[class*='work-strip-spinner']")).toBeNull()
    expect(chip?.querySelector("[class*='work-strip-dot']")).not.toBeNull()
    expect(strip().querySelector("[data-spinning]")).toBeNull()
    expect(strip().querySelectorAll("[data-segment-state='current']")).toHaveLength(1)
  })

  it("ターンが閉じると帯は済んだ姿の1行で残り、緑のチェックと「できました」で言う", () => {
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
    expect(headLabel()).toBe("できました")
    const chip = strip().querySelector("[data-result]")
    expect(chip?.getAttribute("data-result")).toBe("done")
    expect(chip?.getAttribute("data-mark")).toBe("check")
    expect(chip?.querySelector("[class*='work-strip-dot']")).toBeNull()
    expect(strip().querySelector("p")).toBeNull()
  })
})

describe("WorkStrip（フェーズが多いとき）", () => {
  const NAMES = (count: number): string[] =>
    Array.from({ length: count }, (_, index) => `架空の段${String(index + 1)}`)

  function renderAt(current: number, count: number): void {
    putSession(stateAfter([REQUEST, plan(current, "", NAMES(count))]))
    render(<WorkStrip />)
  }

  it("フェーズが多くても、済んだ区間をまとめず区間の数だけ並べ、位置は今/全体で言う", () => {
    renderAt(4, 10)

    expect(strip().querySelectorAll("[data-segment-state]")).toHaveLength(10)
    expect(strip().querySelectorAll("[data-segment-state='done']")).toHaveLength(4)
    expect(screen.getByRole("button", { name: "フェーズ 5/10 架空の段5（いま）" })).not.toBeNull()
    expect(strip().textContent).toContain("5/10")
    expect(strip().textContent).not.toContain("✓4")
  })

  it("全部済んだ姿では位置を出さない", () => {
    putSession(
      stateAfter([
        REQUEST,
        plan(3, "", NAMES(3)),
        { kind: "turn-finished", outcome: { kind: "completed" } },
      ]),
    )
    render(<WorkStrip />)

    expect(strip().querySelectorAll("[data-segment-state='done']")).toHaveLength(3)
    expect(strip().textContent).not.toContain("3/3")
  })

  it("1行には経過の字が無く、開いた一覧の下端に経過を出す", () => {
    renderAt(0, 3)

    expect(screen.getByRole("button", { name: "手順" })).not.toBeNull()
    expect(strip().textContent).not.toMatch(/経過|所要/)

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "手順" }))
    })

    const list = screen.getByRole("region", { name: "依頼の手順" })
    expect(list.lastElementChild?.textContent).toMatch(/^経過 /)
  })
})

describe("WorkStrip（下線の区間）", () => {
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

  function openSteps(): void {
    click(screen.getByRole("button", { name: /^手順/ }))
  }

  function detailOf(name: string): HTMLElement | null {
    return screen.queryByRole("region", { name: `${name} の詳細` })
  }

  it("区間は button で、読み上げの名前に位置・名前・状態を持ち、押すとその区間のフェーズの詳細が開く", () => {
    renderProgressed()
    const done = dot(/架空の段A/)

    expect(done.tagName).toBe("BUTTON")
    expect(done.getAttribute("aria-label")).toBe("フェーズ 1/3 架空の段A（済み）")
    expect(dot(/架空の段B/).getAttribute("aria-label")).toBe("フェーズ 2/3 架空の段B（いま）")
    expect(dot(/架空の段C/).getAttribute("aria-label")).toBe("フェーズ 3/3 架空の段C（これから）")
    expect(done.getAttribute("aria-expanded")).toBe("false")
    expect(detailOf("架空の段A")).toBeNull()

    click(done)

    expect(done.getAttribute("aria-expanded")).toBe("true")
    expect(detailOf("架空の段A")).not.toBeNull()
    expect(screen.queryByRole("region", { name: "依頼の手順" })).toBeNull()
  })

  it("今のフェーズは走っている手順を、まだのフェーズは一言を出す", () => {
    renderProgressed()

    click(dot(/架空の段B/))
    const current = detailOf("架空の段B")?.textContent ?? ""
    click(dot(/架空の段C/))
    const upcoming = detailOf("架空の段C")?.textContent ?? ""

    expect(current).toContain("2/3 · いま")
    expect(current).toContain("架空のコマンド toolu_2")
    expect(upcoming).toContain("3/3 · これから")
    expect(upcoming).toContain("今のフェーズが済んだら始めます。")
  })

  it("済んだフェーズの詳細は、見出しに「1/3 · 済み」を出し、まとめと手順を持つ", () => {
    renderProgressed()

    click(dot(/架空の段A/))

    const detail = detailOf("架空の段A")
    expect(detail?.textContent).toContain("1/3 · 済み")
    expect(detail?.textContent).toContain("架空の段Aのまとめ。")
    expect(detail?.textContent).toContain("架空のコマンド toolu_1")
  })

  it("「手順」を押すと全体の詳細が開き、外を押す・Esc・もう一度押すで閉じ、Esc では「手順」へフォーカスが戻る", () => {
    renderProgressed()
    const toggle = screen.getByRole("button", { name: "手順" })

    click(toggle)
    const insideList = screen.getByRole("region", { name: "依頼の手順" })
    act(() => {
      fireEvent.pointerDown(insideList)
    })
    const keptInside = screen.queryByRole("region", { name: "依頼の手順" })
    act(() => {
      fireEvent.pointerDown(document.body)
    })
    const closedByOutside = screen.queryByRole("region", { name: "依頼の手順" })

    click(toggle)
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" })
    })
    const closedByEscape = screen.queryByRole("region", { name: "依頼の手順" })
    const focus = document.activeElement

    click(toggle)
    click(toggle)

    expect(keptInside).not.toBeNull()
    expect(closedByOutside).toBeNull()
    expect(closedByEscape).toBeNull()
    expect(focus).toBe(toggle)
    expect(screen.queryByRole("region", { name: "依頼の手順" })).toBeNull()
  })

  it("区間を押すと全体の詳細は閉じてフェーズの詳細だけになり、「手順」を押すと逆になる", () => {
    renderProgressed()

    openSteps()
    click(dot(/架空の段A/))
    const afterSegment = [
      screen.queryByRole("region", { name: "依頼の手順" }),
      detailOf("架空の段A"),
    ]
    openSteps()
    const afterToggle = [
      screen.queryByRole("region", { name: "依頼の手順" }),
      detailOf("架空の段A"),
    ]

    expect(afterSegment.map((element) => element === null)).toEqual([true, false])
    expect(afterToggle.map((element) => element === null)).toEqual([false, true])
  })

  it("一覧は全フェーズを順に並べ、済んだ段の手順は畳み、今の段の手順は開き、まだの段は名前だけ", () => {
    renderProgressed()

    openSteps()

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
    expect(rows[0]?.textContent).toContain("架空の段Aのまとめ。")
    expect(rows[1]?.textContent).not.toContain("まとめ")
  })

  it("飛ばした段の区間は済みで、一覧の行に飛ばした印が付く", () => {
    putSession(
      stateAfter([
        REQUEST,
        plan(0),
        { ...plan(1, "飛ばしたわけ。"), skippedPhases: ["架空の段A"] },
        bashStarted("toolu_2"),
      ]),
    )
    render(<WorkStrip />)
    const skipped = dot(/架空の段A/)

    expect(skipped.getAttribute("data-segment-state")).toBe("done")

    openSteps()

    const row = screen
      .getByRole("region", { name: "依頼の手順" })
      .querySelector("li[data-phase-skipped]")
    expect(row?.textContent).toContain("架空の段A（飛ばした）")
  })

  it("答え待ちの今の区間も押せて、詳細は「答え待ち」と言い、一覧の行は開いた手順を持つ", () => {
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

    const asking = dot(/架空の段B（いま）/)
    expect(asking.getAttribute("data-segment-state")).toBe("asking")

    click(asking)
    expect(detailOf("架空の段B")?.textContent).toContain("2/3 · 答え待ち")
    openSteps()

    const row = screen
      .getByRole("region", { name: "依頼の手順" })
      .querySelector("li[data-phase-state='asking']")
    expect(row?.querySelector("details")?.open).toBe(true)
  })

  it("並列のフェーズは区間1つで、名前を「・」でつなぎ、押すと詳細が開く", () => {
    putSession(
      stateAfter([
        REQUEST,
        plan(1, "架空の段Aのまとめ。", ["架空の段A", ["架空の段B", "架空の段C"]]),
      ]),
    )
    render(<WorkStrip />)

    expect(strip().querySelectorAll("[data-segment-state]")).toHaveLength(2)

    click(dot(/架空の段B・架空の段C（いま）/))

    expect(detailOf("架空の段B・架空の段C")).not.toBeNull()
  })

  it("やり取りが替わると詳細は閉じる", () => {
    renderProgressed()
    click(dot(/架空の段A/))

    act(() => {
      putSession(stateAfter([REQUEST, plan(0), REQUEST, plan(1)]))
    })

    expect(detailOf("架空の段A")).toBeNull()
  })
})

describe("WorkStrip（目安の残り）", () => {
  const TIMED_EVENTS = [
    [REQUEST, START],
    [plan(0), START],
    [plan(1), START + 120_000],
  ] as const

  function renderAt(now: number): void {
    vi.spyOn(Temporal.Now, "instant").mockReturnValue(Temporal.Instant.fromEpochMilliseconds(now))
    putSession(foldTimed(TIMED_EVENTS))
    render(<WorkStrip />)
  }

  it("位置の右に「あと1〜2分」の形で出す", () => {
    renderAt(START + 120_000 + 30_000)

    expect(screen.getByText("あと4〜5分")).toBeTruthy()
    expect(strip().textContent).toContain("2/3あと4〜5分")
  })

  it("全体の詳細の下端に、済んだフェーズの所要から出した目安だと分かる title つきで出す", () => {
    renderAt(START + 120_000 + 30_000)
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^手順/ }))
    })

    const foot = screen
      .getByRole("region", { name: "依頼の手順" })
      .querySelector("[title='済んだフェーズの所要から出した目安']")

    expect(foot?.textContent).toBe("目安の残り 4〜5分")
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
