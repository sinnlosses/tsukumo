import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Inquiry } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/inquiry/inquiry.tsx"
import { useInquiryDraft } from "../../../../../../../../../src/browser/stores/inquiry-answer.ts"
import { useInquiryJump } from "../../../../../../../../../src/browser/stores/inquiry-jump.ts"
import type { StampedPendingAsk } from "../../../../../../../../../src/shared/session-driver/pending-ask.ts"
import type {
  Question,
  QuestionOption,
} from "../../../../../../../../../src/shared/session-driver/question.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../../../src/shared/session/session-state.ts"
import { type CommandSpy, putSession } from "../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  // 組み立て中の答えはモジュール単位で残るので、次のテストへ持ち越さない。
  useInquiryDraft.setState(useInquiryDraft.getInitialState(), true)
  // 呼ばれた回数はモジュール単位で残るので、次のテストへ持ち越さない。
  useInquiryJump.setState(useInquiryJump.getInitialState(), true)
})

function option(label: string, extra: Partial<QuestionOption> = {}): QuestionOption {
  return { label, description: `架空の説明（${label}）`, preview: undefined, ...extra }
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
  return { kind: "question", id: "ask-1", questions, askedAt: 0 }
}

const PERMISSION_PENDING = {
  kind: "permission",
  id: "ask-perm",
  toolName: "Bash",
  input: { command: "echo 架空" },
  askedAt: 0,
} satisfies StampedPendingAsk

function renderInquiry(pending: readonly StampedPendingAsk[], dispatch?: CommandSpy): HTMLElement {
  putSession({ ...INITIAL_SESSION_STATE, pending }, dispatch)
  const { container } = render(<Inquiry />)
  return container
}

function card(): HTMLElement {
  return screen.getByRole("region", { name: "お伺い" })
}

describe("Inquiry（メインビューのお伺いの札）", () => {
  it("答え待ちが無いときは何も描かない", () => {
    expect(renderInquiry([]).innerHTML).toBe("")
  })

  it("許可要求は「許可」の種類・ツール名・対象の全文と、番号つきの「許可」「拒否」を出す", () => {
    renderInquiry([PERMISSION_PENDING])

    expect(screen.getByText("Bash")).toBeDefined()
    expect(screen.getByText("echo 架空")).toBeDefined()
    expect(screen.getByRole("radio", { name: /許可/ })).toBeDefined()
    expect(screen.getByRole("radio", { name: /拒否/ })).toBeDefined()
  })

  it("札にフォーカスがあるとき、数字キーで選び Enter で答える", () => {
    const calls: unknown[] = []
    renderInquiry([PERMISSION_PENDING], (command) => calls.push(command))

    fireEvent.keyDown(card(), { key: "2" })
    expect(screen.getByRole<HTMLInputElement>("radio", { name: /拒否/ }).checked).toBe(true)
    fireEvent.keyDown(card(), { key: "Enter" })

    expect(calls).toEqual([
      { procedure: "session.answer", id: "ask-perm", answer: { kind: "deny" } },
    ])
  })

  it("選ぶ前の Enter と、修飾キーつきの数字は何もしない", () => {
    const calls: unknown[] = []
    renderInquiry([questionPending([question()])], (command) => calls.push(command))

    fireEvent.keyDown(card(), { key: "Enter" })
    fireEvent.keyDown(card(), { key: "1", metaKey: true })

    expect(calls).toEqual([])
    expect(screen.getByRole<HTMLInputElement>("radio", { name: /A案/ }).checked).toBe(false)
  })

  it("複数選択の質問は、数字キーで入り切りする", () => {
    renderInquiry([questionPending([question({ multiSelect: true })])])

    for (const key of ["1", "2", "1"]) {
      fireEvent.keyDown(card(), { key })
    }

    expect(
      screen.getAllByRole<HTMLInputElement>("checkbox").map((checkbox) => checkbox.checked),
    ).toEqual([false, true])
  })

  it("ラベル末尾の (Recommended) は「おすすめ」のバッジになり、字からは外れる", () => {
    const container = renderInquiry([
      questionPending([question({ options: [option("A案 (Recommended)"), option("B案")] })]),
    ])

    expect(container.querySelectorAll(".inquiry-option-badge")).toHaveLength(1)
    expect(screen.getByText("おすすめ")).toBeDefined()
    expect(screen.getByText("A案")).toBeDefined()
    expect(screen.queryByText("A案 (Recommended)")).toBeNull()
  })

  it("選んで「これで答える」を押すと、元のラベルのまま答えが送られる", () => {
    const calls: unknown[] = []
    const container = renderInquiry(
      [questionPending([question({ options: [option("A案 (Recommended)"), option("B案")] })])],
      (command) => calls.push(command),
    )

    fireEvent.click(screen.getByText("A案"))
    expect(container.querySelectorAll(".inquiry-option.is-selected")).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: /これで答える/ }))
    expect(calls).toEqual([
      {
        procedure: "session.answer",
        id: "ask-1",
        answer: { kind: "answers", labels: [["A案 (Recommended)"]] },
      },
    ])
  })

  it("質問が2件あると1問ずつ出し、「戻る」と「次へ」で行き来する", () => {
    const calls: unknown[] = []
    renderInquiry(
      [
        questionPending([
          question({ header: "1問目", options: [option("A案")] }),
          question({ header: "2問目", options: [option("C案")] }),
        ]),
      ],
      (command) => calls.push(command),
    )

    expect(screen.getByText(/1 \/ 2/)).toBeDefined()
    expect(screen.queryByText("戻る")).toBeNull()

    fireEvent.click(screen.getByText("A案"))
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }))

    expect(calls).toEqual([])
    expect(screen.getByText(/2 \/ 2/)).toBeDefined()
    expect(screen.getByText("2問目")).toBeDefined()

    fireEvent.click(screen.getByText("戻る"))
    expect(screen.getByText(/1 \/ 2/)).toBeDefined()
  })

  it("待っている時間を頭に出す", () => {
    const clock = vi
      .spyOn(Temporal.Now, "instant")
      .mockReturnValue(Temporal.Instant.fromEpochMilliseconds(42_000))
    try {
      renderInquiry([PERMISSION_PENDING])

      expect(screen.getByText(/待って 0:42/)).toBeDefined()
    } finally {
      clock.mockRestore()
    }
  })

  it("答え待ちが来たら札まで連れてくる（scrollIntoView）", () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})
    try {
      renderInquiry([questionPending([question()])])

      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrollIntoView.mock.calls[0]?.[0]).toEqual({ block: "nearest", behavior: "smooth" })
    } finally {
      scrollIntoView.mockRestore()
    }
  })

  it("フォーカスを移す合図が来たら、最初の選択肢へフォーカスを移す", () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})
    try {
      renderInquiry([PERMISSION_PENDING])

      act(() => useInquiryJump.getState().requestJump({ focus: true }))

      expect(document.activeElement).toBe(screen.getByRole("radio", { name: /許可/ }))
    } finally {
      scrollIntoView.mockRestore()
    }
  })

  it("札が出る前に呼ばれた合図では、あとから出た札へフォーカスを移さない", () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})
    try {
      useInquiryJump.getState().requestJump({ focus: true })
      renderInquiry([PERMISSION_PENDING])

      expect(document.activeElement).toBe(document.body)
    } finally {
      scrollIntoView.mockRestore()
    }
  })
})
