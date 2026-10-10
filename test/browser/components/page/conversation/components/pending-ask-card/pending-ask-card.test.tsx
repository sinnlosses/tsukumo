import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { PendingAskCard } from "../../../../../../../src/browser/components/page/conversation/components/pending-ask-card/pending-ask-card.tsx"
import {
  useInquiryDraft,
  useInquiryFocus,
} from "../../../../../../../src/browser/stores/inquiry-answer.ts"
import type { StampedPendingAsk } from "../../../../../../../src/shared/session-driver/pending-ask.ts"
import type {
  Question,
  QuestionOption,
} from "../../../../../../../src/shared/session-driver/question.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { type CommandSpy, putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useInquiryDraft.setState(useInquiryDraft.getInitialState(), true)
  useInquiryFocus.setState(useInquiryFocus.getInitialState(), true)
})

function stubPhoneWidth(matches: boolean): void {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

function option(label: string): QuestionOption {
  return { label, description: `架空の説明（${label}）`, preview: undefined }
}

function question(overrides: Partial<Question> = {}): Question {
  return {
    header: "架空の選択",
    text: "架空の質問",
    multiSelect: false,
    options: [option("A案"), option("B案")],
    ...overrides,
  }
}

function questionPending(questions: readonly Question[]): StampedPendingAsk {
  return { kind: "question", id: "ask-1", questions, briefs: [], askedAt: 0 }
}

const PERMISSION_PENDING = {
  kind: "permission",
  id: "ask-perm",
  toolName: "Bash",
  input: { command: "echo 架空" },
  askedAt: 0,
} satisfies StampedPendingAsk

const BRIEFED_PENDING = {
  kind: "question",
  id: "ask-1",
  questions: [question()],
  briefs: [
    {
      header: "架空の選択",
      background: "架空の背景",
      axes: ["速さ"],
      options: [
        {
          label: "A案",
          pros: ["架空の良い点"],
          cons: [],
          byAxis: ["速い"],
          irreversible: false,
          figures: [
            {
              kind: "list",
              style: "bullet",
              items: Array.from({ length: 8 }, (_, i) => ({
                label: `項目${String(i + 1)}`,
                text: "",
                done: false,
              })),
              fold: "",
            },
          ],
        },
        { label: "B案", pros: [], cons: [], byAxis: ["遅い"], irreversible: false, figures: [] },
      ],
    },
  ],
  askedAt: 0,
} satisfies StampedPendingAsk

function openDialog(): HTMLElement {
  const dialog = document.querySelector("dialog")
  if (dialog === null) {
    throw new Error("板が開いていない")
  }
  return dialog
}

function renderCard(pending: readonly StampedPendingAsk[], dispatch?: CommandSpy): HTMLElement {
  stubPhoneWidth(true)
  putSession({ ...INITIAL_SESSION_STATE, pending }, dispatch)
  return render(<PendingAskCard />).container
}

function gridOf(): HTMLElement {
  const grid = screen.getByRole("region", { name: "答え待ち" }).querySelector("[class*='grid']")
  if (!(grid instanceof HTMLElement)) {
    throw new Error("答えのボタンの並びが無い")
  }
  return grid
}

describe("PendingAskCard（狭い画面の答え待ちの札）", () => {
  it("答え待ちが無いとき、広い画面のときは何も描かない", () => {
    expect(renderCard([]).innerHTML).toBe("")
    cleanup()
    stubPhoneWidth(false)
    putSession({ ...INITIAL_SESSION_STATE, pending: [PERMISSION_PENDING] })
    expect(render(<PendingAskCard />).container.innerHTML).toBe("")
  })

  it("許可は問いと対象の等幅の札を出し、「拒否」「許可」の2列で、押した瞬間に答える", () => {
    const calls: unknown[] = []
    renderCard([PERMISSION_PENDING], (command) => calls.push(command))

    expect(screen.getByText("？ 答え待ち")).toBeDefined()
    expect(screen.getByText("Bash を実行してよい？")).toBeDefined()
    expect(screen.getByText("echo 架空")).toBeDefined()
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "拒否",
      "許可",
    ])

    fireEvent.click(screen.getByRole("button", { name: "拒否" }))

    expect(calls).toEqual([
      { procedure: "session.answer", id: "ask-perm", answer: { kind: "deny" } },
    ])
  })

  it("2択は2列、3択は番号つきの1列", () => {
    renderCard([questionPending([question()])])
    expect(gridOf().className).toContain("is-two-columns")
    expect(screen.queryByText("1")).toBeNull()
    cleanup()

    renderCard([
      questionPending([question({ options: [option("A案"), option("B案"), option("C案")] })]),
    ])
    expect(gridOf().className).not.toContain("is-two-columns")
    expect(screen.getByText("3")).toBeDefined()
  })

  it("おすすめの印のある選択肢だけ塗り、無ければどれも塗らない", () => {
    renderCard([questionPending([question({ options: [option("A案"), option("B案 (推奨)")] })])])
    const filled = screen
      .getAllByRole("button")
      .filter((button) => button.className.includes("is-recommended"))
    expect(filled.map((button) => button.textContent)).toEqual(["B案"])
    cleanup()

    renderCard([questionPending([question()])])
    expect(
      screen.getAllByRole("button").filter((button) => button.className.includes("is-recommended")),
    ).toEqual([])
  })

  it("単一選択は押した瞬間に答え、2問なら1問目は進むだけで「n / N」を出す", () => {
    const calls: unknown[] = []
    renderCard(
      [questionPending([question({ header: "1問目" }), question({ header: "2問目" })])],
      (command) => calls.push(command),
    )

    expect(screen.getByText("1 / 2")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "A案" }))
    expect(calls).toEqual([])
    expect(screen.getByText("2 / 2")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "B案" }))
    expect(calls).toEqual([
      {
        procedure: "session.answer",
        id: "ask-1",
        answer: { kind: "answers", labels: [["A案"], ["B案"]] },
      },
    ])
  })

  it("添え書きのある質問だけ「詳しく」を出し、押すと板に1列の形を出して、板の「これで答える」で答える", () => {
    const calls: unknown[] = []
    renderCard([BRIEFED_PENDING], (command) => calls.push(command))

    fireEvent.click(screen.getByRole("button", { name: "詳しく" }))
    const sheet = within(openDialog())
    expect(sheet.getByText("架空の背景")).toBeDefined()
    expect(sheet.getByRole("group", { name: /の詳細$/ })).toBeDefined()
    // 押した瞬間には答えない。
    fireEvent.click(sheet.getByRole("radio", { name: /B案/ }))
    expect(calls).toEqual([])

    fireEvent.click(sheet.getByRole("button", { name: "これで答える" }))
    expect(calls).toEqual([
      {
        procedure: "session.answer",
        id: "ask-1",
        answer: { kind: "answers", labels: [["B案"]] },
      },
    ])
  })

  it("添え書きの無い質問と許可には「詳しく」を出さない", () => {
    renderCard([questionPending([question()])])
    expect(screen.queryByRole("button", { name: "詳しく" })).toBeNull()
    cleanup()

    renderCard([PERMISSION_PENDING])
    expect(screen.queryByRole("button", { name: "詳しく" })).toBeNull()
  })

  it("等幅の札は6つまでと「ほか n」で、押すと板に全部を並べる", () => {
    renderCard([BRIEFED_PENDING])
    expect(screen.getByText("項目6")).toBeDefined()
    expect(screen.queryByText("項目7")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "ほか 2" }))

    expect(within(openDialog()).getByText("項目8")).toBeDefined()
  })

  it("複数選択は押すたびに印が付け外しされ、「これで答える」で初めて送る", () => {
    const calls: unknown[] = []
    renderCard([questionPending([question({ multiSelect: true })])], (command) =>
      calls.push(command),
    )

    fireEvent.click(screen.getByRole("button", { name: /A案/ }))
    fireEvent.click(screen.getByRole("button", { name: /B案/ }))
    fireEvent.click(screen.getByRole("button", { name: /B案/ }))
    expect(screen.getByRole("button", { name: /A案/ }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: /B案/ }).getAttribute("aria-pressed")).toBe("false")
    expect(calls).toEqual([])

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "これで答える" }))
    })
    expect(calls).toEqual([
      {
        procedure: "session.answer",
        id: "ask-1",
        answer: { kind: "answers", labels: [["A案"]] },
      },
    ])
  })
})
