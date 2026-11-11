import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Inquiry } from "../../../../../../../src/browser/components/page/conversation/components/inquiry/inquiry.tsx"
import { useComposerDraft } from "../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import { useInquiryCardVisibility } from "../../../../../../../src/browser/components/page/conversation/stores/inquiry-card-visibility.ts"
import {
  useInquiryDraft,
  useInquiryFocus,
} from "../../../../../../../src/browser/components/page/conversation/stores/inquiry-draft.ts"
import { useInquiryJump } from "../../../../../../../src/browser/stores/inquiry-jump.ts"
import type { StampedPendingAsk } from "../../../../../../../src/shared/session-driver/pending-ask.ts"
import type { QuestionBrief } from "../../../../../../../src/shared/session-driver/question-brief.ts"
import type {
  Question,
  QuestionOption,
} from "../../../../../../../src/shared/session-driver/question.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { type CommandSpy, putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  // 組み立て中の答えはモジュール単位で残るので、次のテストへ持ち越さない。
  useInquiryDraft.setState(useInquiryDraft.getInitialState(), true)
  useInquiryFocus.setState(useInquiryFocus.getInitialState(), true)
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
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
  return {
    kind: "question",
    id: "ask-1",
    questions,
    briefs: [],
    imageSizes: [],
    unshelvedImages: [],
    askedAt: 0,
  }
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

describe("Inquiry（メインビューのお伺いのカード）", () => {
  it("答え待ちが無いときは何も描かない", () => {
    expect(renderInquiry([]).innerHTML).toBe("")
  })

  it("狭い画面（760px 以下）では、答え待ちがあっても本文に札を描かない", () => {
    const spy = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))

    expect(renderInquiry([PERMISSION_PENDING]).innerHTML).toBe("")

    spy.mockRestore()
  })

  it("カードがビューポートに見えているかを観測して store に写し、カードが消えると見えているに戻す", () => {
    type FakeCallback = (entries: readonly { readonly isIntersecting: boolean }[]) => void
    const callbacks: FakeCallback[] = []
    class FakeObserver {
      constructor(callback: FakeCallback) {
        callbacks.push(callback)
      }
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver)
    try {
      renderInquiry([PERMISSION_PENDING])
      const notify = (isIntersecting: boolean): void => {
        act(() => {
          callbacks[0]?.([{ isIntersecting }])
        })
      }

      notify(false)
      expect(useInquiryCardVisibility.getState().visible).toBe(false)
      notify(true)
      expect(useInquiryCardVisibility.getState().visible).toBe(true)

      notify(false)
      cleanup()
      expect(useInquiryCardVisibility.getState().visible).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
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

  it("フォーカスした選択肢が替わって詳細が伸びたら、札を見える範囲へ送り直す（scrollIntoView）", () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})
    try {
      renderInquiry([questionPending([question()])])
      expect(scrollIntoView).toHaveBeenCalledTimes(1)

      fireEvent.focus(screen.getByRole("radio", { name: /A案/ }))
      expect(scrollIntoView).toHaveBeenCalledTimes(2)

      fireEvent.focus(screen.getByRole("radio", { name: /B案/ }))
      expect(scrollIntoView).toHaveBeenCalledTimes(3)
      expect(scrollIntoView.mock.calls[2]?.[0]).toEqual({ block: "nearest", behavior: "smooth" })

      fireEvent.focus(screen.getByRole("radio", { name: /B案/ }))
      expect(scrollIntoView).toHaveBeenCalledTimes(3)
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

describe("Inquiry の添え書きと詳細のサーフェス", () => {
  const brief = {
    header: "架空の選択",
    whyAsk: "架空の聞く理由の文",
    facts: [
      { text: "架空の数の話", basis: "checked" },
      { text: "架空の本文の話", basis: "copied" },
    ],
    recommended: { reason: "架空の根拠の文", certainty: "medium" },
    options: [
      { label: "A案", irreversible: false, figures: [] },
      { label: "B案", irreversible: true, figures: [] },
    ],
  } satisfies QuestionBrief

  function renderBriefed(briefs: readonly QuestionBrief[]): void {
    putSession({
      ...INITIAL_SESSION_STATE,
      pending: [
        {
          kind: "question",
          id: "ask-1",
          questions: [question()],
          briefs,
          imageSizes: [],
          unshelvedImages: [],
          askedAt: 0,
        },
      ],
    })
    render(<Inquiry />)
  }

  it("触る前は詳細を出さず、聞く理由と案内の1行を出し、比べる表は出さない", () => {
    renderBriefed([brief])

    expect(screen.getByText(/架空の聞く理由の文/)).toBeDefined()
    expect(screen.getAllByText("⚠ 戻せない")).toHaveLength(1)
    expect(screen.queryByRole("group", { name: /の詳細$/ })).toBeNull()
    expect(screen.getByText("選択肢を押すと詳細が出ます")).toBeDefined()
    expect(card().querySelector("details")).toBeNull()
    expect(card().querySelector("table")).toBeNull()
  })

  it("塊は、聞く理由 → 事実（出どころの印つき）→ おすすめの理由と確度 → 選択肢の順に出す", () => {
    renderBriefed([brief])

    const text = card().textContent ?? ""
    const positions = [
      "聞く理由",
      "架空の聞く理由の文",
      "事実",
      "確かめた",
      "架空の数の話",
      "写した",
      "架空の本文の話",
      "おすすめの理由",
      "確度 中",
      "架空の根拠の文",
      "A案",
    ].map((part) => text.indexOf(part))

    expect(positions).toEqual(positions.toSorted((a, b) => a - b))
    expect(positions.every((position) => position >= 0)).toBe(true)
  })

  it("おすすめの理由が無い質問は、聞く理由と事実だけを出し、おすすめの理由の行を出さない", () => {
    renderBriefed([{ ...brief, recommended: undefined }])

    expect(screen.getByText("事実")).toBeDefined()
    expect(screen.queryByText("おすすめの理由")).toBeNull()
    expect(screen.queryByText(/確度/)).toBeNull()
  })

  it("単一選択は入力欄に字があるあいだ、案内の1行を出して選択肢を薄くし、字を消すと戻る", () => {
    renderBriefed([brief])

    act(() => useComposerDraft.getState().replaceDraft({ text: "架空", caret: 2 }))
    expect(screen.getByText("入力欄の答えで答えます")).toBeDefined()
    expect(card().querySelectorAll('li[class*="is-dimmed"]')).toHaveLength(2)

    act(() => useComposerDraft.setState(useComposerDraft.getInitialState(), true))
    expect(screen.queryByText("入力欄の答えで答えます")).toBeNull()
    expect(card().querySelectorAll('li[class*="is-dimmed"]')).toHaveLength(0)
  })

  it("押したあとは先頭でなく押した選択肢の詳細を出し、良い点・悪い点・比べる表は出さない", () => {
    renderBriefed([brief])

    fireEvent.click(screen.getByRole("radio", { name: /A案/ }))

    expect(screen.getByText("架空の説明（A案）")).toBeDefined()
    expect(screen.queryByText("架空の説明（B案）")).toBeNull()
    expect(screen.queryByText("良い点")).toBeNull()
    expect(screen.queryByText("悪い点")).toBeNull()
    expect(card().querySelector("table")).toBeNull()
  })

  it("選択肢を選び替えると、詳細がその選択肢のものに替わる", () => {
    renderBriefed([brief])

    fireEvent.click(screen.getByRole("radio", { name: /B案/ }))

    expect(screen.getByText("架空の説明（B案）")).toBeDefined()
    expect(screen.queryByText("架空の説明（A案）")).toBeNull()
  })

  it("数字キーで選んでも、詳細が替わる", () => {
    renderBriefed([brief])

    fireEvent.keyDown(card(), { key: "2" })

    expect(screen.getByText("架空の説明（B案）")).toBeDefined()
  })

  it("添え書きが無い質問は、聞く理由を出さず、触る前は案内の1行、押したあとは説明を出す", () => {
    renderBriefed([])

    expect(screen.queryByText("聞く理由")).toBeNull()
    expect(card().querySelector("details")).toBeNull()
    expect(screen.getByText("選択肢を押すと詳細が出ます")).toBeDefined()
    expect(screen.queryByText("架空の説明（A案）")).toBeNull()
    fireEvent.click(screen.getByRole("radio", { name: /A案/ }))
    expect(screen.getByText("架空の説明（A案）")).toBeDefined()
    expect(screen.queryByText("選択肢を押すと詳細が出ます")).toBeNull()
    expect(screen.queryByText("⚠ 戻せない")).toBeNull()
  })
})
