import { afterEach, describe, expect, it, spyOn } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { QuestionAsk } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/question-ask/question-ask.tsx"
import { QuestionAnswerProvider } from "../../../../../../../../../src/browser/stores/question-answer.tsx"
import {
  QuestionScrollContext,
  type QuestionScrollValue,
} from "../../../../../../../../../src/browser/stores/question-scroll.tsx"
import { SessionStoreContext } from "../../../../../../../../../src/browser/stores/session.tsx"
import {
  TurnSelectionContext,
  type TurnSelectionValue,
} from "../../../../../../../../../src/browser/stores/turn-selection.tsx"
import { type PendingAsk } from "../../../../../../../../../src/shared/pending-ask.ts"
import {
  type Question,
  type QuestionOption,
} from "../../../../../../../../../src/shared/question.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../../../src/shared/session-state.ts"
import { type CommandSpy, sessionStoreWith } from "../../../../../../../session-store.ts"

// フィクスチャはすべて手で書いた架空の質問（docs/coding-standards.md「会話内容の扱い」）。

afterEach(() => {
  cleanup()
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

function renderQuestionAsk(
  pending: readonly PendingAsk[],
  options: {
    readonly dispatch?: CommandSpy
    readonly selection?: Partial<TurnSelectionValue>
    readonly scroll?: Partial<QuestionScrollValue>
  } = {},
): HTMLElement {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, pending }, options.dispatch)
  const selection: TurnSelectionValue = {
    activeTurnId: 2,
    newestTurnId: 2,
    selectTurn: () => {},
    ...options.selection,
  }
  const scroll: QuestionScrollValue = { signal: 0, requestScroll: () => {}, ...options.scroll }
  const { container } = render(
    <SessionStoreContext.Provider value={store}>
      <TurnSelectionContext.Provider value={selection}>
        <QuestionScrollContext.Provider value={scroll}>
          <QuestionAnswerProvider>
            <QuestionAsk />
          </QuestionAnswerProvider>
        </QuestionScrollContext.Provider>
      </TurnSelectionContext.Provider>
    </SessionStoreContext.Provider>,
  )
  return container
}

describe("QuestionAsk（メインビューの質問の札）", () => {
  it("答え待ちが無いとき・許可要求のときは何も描かない", () => {
    expect(renderQuestionAsk([]).innerHTML).toBe("")
    expect(
      renderQuestionAsk([{ kind: "permission", id: "ask-perm", toolName: "Bash", input: {} }])
        .innerHTML,
    ).toBe("")
  })

  it("ラベル末尾の (Recommended) は「おすすめ」のバッジになり、字からは外れる", () => {
    const container = renderQuestionAsk([
      {
        kind: "question",
        id: "ask-1",
        questions: [question({ options: [option("A案 (Recommended)"), option("B案")] })],
      },
    ])

    expect(container.querySelectorAll(".question-ask-option-badge")).toHaveLength(1)
    expect(screen.getByText("おすすめ")).toBeDefined()
    expect(screen.getByText("A案")).toBeDefined()
    expect(screen.queryByText("A案 (Recommended)")).toBeNull()
  })

  it("選んで「これで答える」を押すと、元のラベルのまま答えが送られる", () => {
    const calls: unknown[] = []
    const container = renderQuestionAsk(
      [
        {
          kind: "question",
          id: "ask-1",
          questions: [question({ options: [option("A案 (Recommended)"), option("B案")] })],
        },
      ],
      { dispatch: (command) => calls.push(command) },
    )

    const answer = screen.getByRole("button", { name: "これで答える" })
    // **押せないは `aria-disabled` の1通り**（`Button`）。本物の `disabled` にはしないので、
    // フォーカスは残る（`button.test.tsx` と同じ確かめ方）。
    expect(answer.getAttribute("aria-disabled")).toBe("true")
    expect(answer.hasAttribute("disabled")).toBe(false)
    answer.focus()
    expect(document.activeElement).toBe(answer)

    fireEvent.click(screen.getByText("A案"))
    expect(container.querySelectorAll(".question-ask-option.is-selected")).toHaveLength(1)

    fireEvent.click(answer)
    expect(calls).toEqual([
      {
        procedure: "session.answer",
        id: "ask-1",
        answer: { kind: "answers", labels: [["A案 (Recommended)"]] },
      },
    ])
  })

  it("押せないあいだ「これで答える」を押しても答えを送らない", () => {
    const calls: unknown[] = []
    renderQuestionAsk([{ kind: "question", id: "ask-1", questions: [question()] }], {
      dispatch: (command) => calls.push(command),
    })

    fireEvent.click(screen.getByRole("button", { name: "これで答える" }))

    expect(calls).toEqual([])
  })

  it("質問が2件あると1問ずつ出し、「戻る」と「次へ」で行き来する", () => {
    const calls: unknown[] = []
    renderQuestionAsk(
      [
        {
          kind: "question",
          id: "ask-1",
          questions: [
            question({ header: "1問目", options: [option("A案")] }),
            question({ header: "2問目", options: [option("C案")] }),
          ],
        },
      ],
      { dispatch: (command) => calls.push(command) },
    )

    expect(screen.getByText("1 / 2")).toBeDefined()
    expect(screen.queryByText("戻る")).toBeNull()

    fireEvent.click(screen.getByText("A案"))
    fireEvent.click(screen.getByText("次へ"))

    expect(calls).toEqual([])
    expect(screen.getByText("2 / 2")).toBeDefined()
    expect(screen.getByText("2問目")).toBeDefined()

    fireEvent.click(screen.getByText("戻る"))
    expect(screen.getByText("1 / 2")).toBeDefined()
  })

  it("過去のやり取りを見ている間は、いまのやり取りへ戻る口を添える", () => {
    const moved: number[] = []
    renderQuestionAsk([{ kind: "question", id: "ask-1", questions: [question()] }], {
      selection: { activeTurnId: 1, newestTurnId: 3, selectTurn: (id) => moved.push(id) },
    })

    fireEvent.click(screen.getByText("最新のやり取りへ"))
    expect(moved).toEqual([3])
  })

  it("質問が来たら札まで連れてくる（scrollIntoView）", () => {
    const scrollIntoView = spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})
    try {
      renderQuestionAsk([{ kind: "question", id: "ask-1", questions: [question()] }])

      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrollIntoView.mock.calls[0]?.[0]).toEqual({ block: "nearest", behavior: "smooth" })
    } finally {
      scrollIntoView.mockRestore()
    }
  })
})
