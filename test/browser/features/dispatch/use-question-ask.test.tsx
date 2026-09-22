import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, renderHook } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import {
  useQuestionAsk,
  type QuestionAskModel,
} from "../../../../src/browser/features/dispatch/hooks/use-question-ask.ts"
import { QuestionFocusProvider } from "../../../../src/browser/stores/question-focus.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { type PendingAsk } from "../../../../src/shared/pending-ask.ts"
import { FREE_TEXT_OPTION_LABEL, type Question } from "../../../../src/shared/question.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session-state.ts"
import { type CommandSpy, sessionStoreWith } from "../../session-store.ts"

/**
 * 答え待ちの質問の箱（`<QuestionAsk>`）を描かずに、選択肢の行への畳み方・進む／戻る／送るの
 * 決め方だけを測る（docs/design.md 2章「機能の中を分ける」）。許可要求の畳み方は
 * `use-pending-answer.test.tsx`。ボタンがどう並ぶかは `pending-answer.test.tsx`（部品ごと
 * 描画する側）が確かめる。
 * フィクスチャはすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
 */

afterEach(() => {
  cleanup()
})

type QuestionPending = Extract<PendingAsk, { readonly kind: "question" }>

function question(overrides: Partial<Question>): Question {
  return {
    header: "架空の選択",
    text: "架空の質問",
    multiSelect: false,
    options: [
      { label: "B案", description: "架空の説明B", preview: undefined },
      { label: "A案", description: "架空の説明A", preview: undefined },
    ],
    ...overrides,
  }
}

function questionPending(questions: readonly Question[]): QuestionPending {
  return { kind: "question", id: "ask-1", questions }
}

function wrapperFor(
  pending: readonly PendingAsk[],
  spy: CommandSpy,
): (props: { readonly children: ReactNode }) => ReactElement {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, pending }, spy)
  return function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
    return (
      <SessionStoreContext.Provider value={store}>
        <QuestionFocusProvider>{children}</QuestionFocusProvider>
      </SessionStoreContext.Provider>
    )
  }
}

function renderUseQuestionAsk(
  pending: QuestionPending,
  spy: CommandSpy = () => {},
): { readonly result: { readonly current: QuestionAskModel } } {
  const { result } = renderHook(() => useQuestionAsk(pending), {
    wrapper: wrapperFor([pending], spy),
  })
  return { result }
}

/** 出ている箱。`hidden` なら落とす（テストの前提が崩れている）。 */
function shown(model: QuestionAskModel): Extract<QuestionAskModel, { readonly kind: "shown" }> {
  if (model.kind !== "shown") {
    throw new Error("質問の箱が出ていない")
  }
  return model
}

function enter(): { readonly key: string; readonly preventDefault: () => void } {
  return { key: "Enter", preventDefault: () => {} }
}

describe("useQuestionAsk の選択肢の行", () => {
  it("単一選択は辞書順のボタン行に並べ、自由入力を末尾に1つ足す", () => {
    const { result } = renderUseQuestionAsk(questionPending([question({})]))

    expect(shown(result.current).card.options).toEqual([
      { kind: "single", label: "A案", description: "架空の説明A", selected: false },
      { kind: "single", label: "B案", description: "架空の説明B", selected: false },
      { kind: "free-text" },
    ])
    expect(shown(result.current).card.header).toBe("架空の選択")
  })

  it("モデルが自由入力を含めてきたら二重に足さない", () => {
    const { result } = renderUseQuestionAsk(
      questionPending([
        question({
          options: [
            { label: FREE_TEXT_OPTION_LABEL, description: "", preview: undefined },
            { label: "A案", description: "架空の説明A", preview: undefined },
          ],
        }),
      ]),
    )

    expect(shown(result.current).card.options.map((row) => row.kind)).toEqual([
      "single",
      "free-text",
    ])
  })

  it("複数選択はチェックボックスの行にし、見出しに「（複数選べる）」を足す", () => {
    const { result } = renderUseQuestionAsk(questionPending([question({ multiSelect: true })]))

    act(() => {
      shown(result.current).card.onToggleMulti("B案")
    })

    const card = shown(result.current).card
    expect(card.header).toBe("架空の選択（複数選べる）")
    expect(card.options.slice(0, 2)).toEqual([
      { kind: "checkbox", label: "A案", description: "架空の説明A", checked: false },
      { kind: "checkbox", label: "B案", description: "架空の説明B", checked: true },
    ])
  })

  it("preview を持つ選択肢があるときだけ比較の案内を出す", () => {
    const withPreview = renderUseQuestionAsk(
      questionPending([
        question({
          options: [{ label: "A案", description: "架空の説明A", preview: "架空の比較" }],
        }),
      ]),
    )
    const without = renderUseQuestionAsk(questionPending([question({})]))

    expect(shown(withPreview.result.current).card.showPreviewHint).toBe(true)
    expect(shown(without.result.current).card.showPreviewHint).toBe(false)
  })
})

describe("useQuestionAsk の進み方", () => {
  it("1問・単一選択は選んだ瞬間に送り、進むボタンも何問目かも出さない", () => {
    const calls: unknown[] = []
    const { result } = renderUseQuestionAsk(questionPending([question({})]), (command) =>
      calls.push(command),
    )

    expect(shown(result.current).progress).toEqual({ kind: "hidden" })
    expect(shown(result.current).advance).toEqual({ kind: "hidden" })
    act(() => {
      shown(result.current).card.onSelectSingle("B案")
    })

    expect(calls).toEqual([
      { type: "answer", id: "ask-1", answer: { kind: "answers", labels: [["B案"]] } },
    ])
  })

  it("2問なら1問目で次へ進み、「戻る」で戻れ、最後に全問ぶんを1回だけ送る", () => {
    const calls: unknown[] = []
    const { result } = renderUseQuestionAsk(
      questionPending([question({}), question({ header: "架空の選択2" })]),
      (command) => calls.push(command),
    )

    expect(shown(result.current).progress).toEqual({
      kind: "shown",
      label: "2問中1問目",
      showBack: false,
    })
    act(() => {
      shown(result.current).card.onSelectSingle("A案")
    })
    expect(shown(result.current).progress).toEqual({
      kind: "shown",
      label: "2問中2問目",
      showBack: true,
    })
    expect(calls).toEqual([])

    act(() => {
      shown(result.current).onBack()
    })
    act(() => {
      shown(result.current).card.onSelectSingle("B案")
    })
    act(() => {
      shown(result.current).card.onSelectSingle("A案")
    })

    expect(calls).toEqual([
      { type: "answer", id: "ask-1", answer: { kind: "answers", labels: [["B案"], ["A案"]] } },
    ])
  })

  it("自由入力に打つと進むボタンが出て、単一選択の選択は外れる。Enter で送る", () => {
    const calls: unknown[] = []
    const { result } = renderUseQuestionAsk(
      questionPending([question({}), question({ header: "架空の選択2" })]),
      (command) => calls.push(command),
    )
    act(() => {
      shown(result.current).card.onSelectSingle("A案")
    })
    act(() => {
      shown(result.current).onBack()
    })

    act(() => {
      shown(result.current).card.onFreeTextChange("架空の自由入力")
    })
    expect(shown(result.current).advance).toEqual({
      kind: "shown",
      label: "次へ",
      disabled: false,
    })
    expect(shown(result.current).card.options[0]).toMatchObject({ selected: false })

    act(() => {
      shown(result.current).card.onFreeTextKeyDown(enter())
    })
    act(() => {
      shown(result.current).card.onFreeTextChange("架空の自由入力2")
    })
    act(() => {
      shown(result.current).card.onFreeTextKeyDown(enter())
    })

    expect(calls).toEqual([
      {
        type: "answer",
        id: "ask-1",
        answer: { kind: "answers", labels: [["架空の自由入力"], ["架空の自由入力2"]] },
      },
    ])
  })

  it("自由入力が空のときの Enter は何もしない", () => {
    const calls: unknown[] = []
    const { result } = renderUseQuestionAsk(questionPending([question({})]), (command) =>
      calls.push(command),
    )
    let prevented = false

    act(() => {
      shown(result.current).card.onFreeTextKeyDown({
        key: "Enter",
        preventDefault: () => {
          prevented = true
        },
      })
    })

    expect(prevented).toBe(false)
    expect(calls).toEqual([])
  })

  it("複数選択は何も選んでいない間、進むボタンを押せない（最後の1問は「答える」）", () => {
    const calls: unknown[] = []
    const { result } = renderUseQuestionAsk(
      questionPending([question({ multiSelect: true })]),
      (command) => calls.push(command),
    )

    expect(shown(result.current).advance).toEqual({
      kind: "shown",
      label: "答える",
      disabled: true,
    })
    act(() => {
      shown(result.current).card.onToggleMulti("B案")
    })
    act(() => {
      shown(result.current).card.onToggleMulti("A案")
    })
    act(() => {
      shown(result.current).onAdvance()
    })

    expect(calls).toEqual([
      { type: "answer", id: "ask-1", answer: { kind: "answers", labels: [["B案", "A案"]] } },
    ])
  })
})
