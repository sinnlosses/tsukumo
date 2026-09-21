import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { PendingQuestion } from "../../../../src/browser/features/main-view/pending-question.tsx"
import {
  QuestionFocusContext,
  type QuestionFocusValue,
} from "../../../../src/browser/stores/question-focus.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { type PendingAsk } from "../../../../src/shared/pending-ask.ts"
import { type QuestionOption } from "../../../../src/shared/question.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session-state.ts"
import { sessionStoreWith } from "../../session-store.ts"

// フィクスチャはすべて手で書いた架空の質問（docs/coding-standards.md「会話内容の扱い」）。

afterEach(() => {
  cleanup()
})

function option(label: string, preview: string | undefined): QuestionOption {
  return { label, description: `架空の説明（${label}）`, preview }
}

function questionAsk(options: readonly QuestionOption[]): PendingAsk {
  return {
    kind: "question",
    id: "ask-preview",
    questions: [{ header: "架空の選択", text: "架空の質問", multiSelect: false, options }],
  }
}

function renderPendingQuestion(
  pending: readonly PendingAsk[],
  focus: Partial<QuestionFocusValue> = {},
): HTMLElement {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, pending })
  const value: QuestionFocusValue = {
    questionIndex: 0,
    focusedLabel: undefined,
    setQuestionIndex: () => {},
    setFocusedLabel: () => {},
    ...focus,
  }
  const { container } = render(
    <SessionStoreContext.Provider value={store}>
      <QuestionFocusContext.Provider value={value}>
        <PendingQuestion />
      </QuestionFocusContext.Provider>
    </SessionStoreContext.Provider>,
  )
  return container
}

describe("PendingQuestion", () => {
  it("preview の Markdown をレポートと同じ記法で描く（表は <table> になる）", () => {
    const container = renderPendingQuestion([
      questionAsk([
        option("案A", "| 段 | 差 |\n| --- | --- |\n| 1 | 速い |"),
        option("案B", "**遅いが確実**"),
      ]),
    ])

    expect(container.querySelectorAll("table")).toHaveLength(1)
    expect(screen.getByText("速い")).toBeDefined()
    expect(screen.getByText("遅いが確実").tagName).toBe("STRONG")
  })

  it("preview を1つも持たない質問では何も描かない（常設の枠にしない）", () => {
    const container = renderPendingQuestion([
      questionAsk([option("案A", undefined), option("案B", undefined)]),
    ])

    expect(container.innerHTML).toBe("")
  })

  it("答え待ちが許可要求のときは何も描かない", () => {
    const container = renderPendingQuestion([
      { kind: "permission", id: "ask-perm", toolName: "Bash", input: {} },
    ])

    expect(container.innerHTML).toBe("")
  })

  it("箱で目を置いている選択肢の札にだけ印が付く", () => {
    const container = renderPendingQuestion(
      [questionAsk([option("案A", "Aの比較"), option("案B", "Bの比較")])],
      { focusedLabel: "案B" },
    )

    const marked = container.querySelectorAll("[aria-current='true']")
    expect(marked).toHaveLength(1)
    expect(marked[0]?.textContent).toContain("案B")
  })

  it("札は送られた順ではなく、箱と同じラベルの辞書順に並べる", () => {
    const container = renderPendingQuestion([
      questionAsk([option("案C", "Cの比較"), option("案A", "Aの比較"), option("案B", "Bの比較")]),
    ])

    const labels = [...container.querySelectorAll(".pending-question-card-label")].map(
      (el) => el.textContent,
    )
    expect(labels).toEqual(["案A", "案B", "案C"])
  })

  it("箱が見ている質問（questionIndex）の選択肢を出す", () => {
    const two: PendingAsk = {
      kind: "question",
      id: "ask-two",
      questions: [
        {
          header: "1問目",
          text: "架空の質問1",
          multiSelect: false,
          options: [option("案A", "Aの比較")],
        },
        {
          header: "2問目",
          text: "架空の質問2",
          multiSelect: false,
          options: [option("案C", "Cの比較")],
        },
      ],
    }

    renderPendingQuestion([two], { questionIndex: 1 })

    expect(screen.getByText("Cの比較")).toBeDefined()
    expect(screen.queryByText("Aの比較")).toBeNull()
  })
})
