import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, renderHook } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import {
  QuestionAnswerProvider,
  useQuestionAnswer,
  type QuestionAnswerModel,
} from "../../../src/browser/stores/question-answer.tsx"
import { SessionStoreContext } from "../../../src/browser/stores/session.tsx"
import { type PendingAsk } from "../../../src/shared/pending-ask.ts"
import { type Question, type QuestionOption } from "../../../src/shared/question.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session-state.ts"
import { type CommandSpy, sessionStoreWith } from "../session-store.ts"

/**
 * 答え待ちの質問に対して組み立てる答え（メインビューの札と入力欄の両方が読み書きする1つの
 * 状態。docs/design.md 6.2）を、部品を描かずに測る。
 * フィクスチャはすべて手で書いた架空の質問（docs/coding-standards.md「会話内容の扱い」）。
 */

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

function questionPending(questions: readonly Question[]): PendingAsk {
  return { kind: "question", id: "ask-1", questions }
}

function renderModel(
  pending: readonly PendingAsk[],
  spy: CommandSpy = () => {},
): { readonly current: QuestionAnswerModel } {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, pending }, spy)
  const { result } = renderHook(() => useQuestionAnswer(), {
    wrapper: function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
      return (
        <SessionStoreContext.Provider value={store}>
          <QuestionAnswerProvider>{children}</QuestionAnswerProvider>
        </SessionStoreContext.Provider>
      )
    },
  })
  return result
}

function asking(model: QuestionAnswerModel): Extract<QuestionAnswerModel, { kind: "asking" }> {
  if (model.kind !== "asking") {
    throw new Error("質問が出ている前提の検査")
  }
  return model
}

describe("useQuestionAnswer の選択肢", () => {
  it("答え待ちが無いとき・許可要求のときは none", () => {
    expect(renderModel([]).current.kind).toBe("none")
    expect(
      renderModel([{ kind: "permission", id: "ask-perm", toolName: "Bash", input: {} }]).current
        .kind,
    ).toBe("none")
  })

  it("選択肢はラベルの辞書順に並べる（送られた順ではない）", () => {
    const result = renderModel([
      questionPending([question({ options: [option("C案"), option("A案"), option("B案")] })]),
    ])

    expect(asking(result.current).options.map((row) => row.label)).toEqual(["A案", "B案", "C案"])
  })

  it("自由入力（その他）の選択肢は札に出さない（自由入力は入力欄が担う）", () => {
    const result = renderModel([
      questionPending([question({ options: [option("その他"), option("A案")] })]),
    ])

    expect(asking(result.current).options.map((row) => row.label)).toEqual(["A案"])
  })

  it("ラベル末尾の (Recommended) は字から外しておすすめの印にする（答えは元のラベル）", () => {
    const result = renderModel([
      questionPending([question({ options: [option("A案 (Recommended)"), option("B案")] })]),
    ])

    const [first, second] = asking(result.current).options
    expect(first?.label).toBe("A案 (Recommended)")
    expect(first?.text).toBe("A案")
    expect(first?.recommended).toBe(true)
    expect(second?.recommended).toBe(false)
  })

  it("preview と説明はそのまま札へ渡す", () => {
    const result = renderModel([
      questionPending([question({ options: [option("A案", { preview: "Aの比較（架空）" })] })]),
    ])

    const [first] = asking(result.current).options
    expect(first?.preview).toBe("Aの比較（架空）")
    expect(first?.description).toBe("架空の説明（A案）")
  })
})

describe("useQuestionAnswer の答え方", () => {
  it("1問・単一選択は、選んでから「これで答える」で送る（選んだ瞬間には送らない）", () => {
    const calls: unknown[] = []
    const result = renderModel([questionPending([question()])], (command) => calls.push(command))

    expect(asking(result.current).canAnswer).toBe(false)
    act(() => asking(result.current).onToggle("B案"))

    expect(calls).toEqual([])
    expect(asking(result.current).options.find((row) => row.label === "B案")?.selected).toBe(true)
    expect(asking(result.current).canAnswer).toBe(true)

    act(() => asking(result.current).onAnswer())

    expect(calls).toEqual([
      { type: "answer", id: "ask-1", answer: { kind: "answers", labels: [["B案"]] } },
    ])
  })

  it("単一選択は選び直すと前の選択が外れる", () => {
    const result = renderModel([questionPending([question()])])

    act(() => asking(result.current).onToggle("A案"))
    act(() => asking(result.current).onToggle("B案"))

    expect(
      asking(result.current)
        .options.filter((row) => row.selected)
        .map((row) => row.label),
    ).toEqual(["B案"])
  })

  it("複数選択は選んだぶんすべてに印が付き、押し直すと外れる", () => {
    const result = renderModel([questionPending([question({ multiSelect: true })])])

    act(() => asking(result.current).onToggle("A案"))
    act(() => asking(result.current).onToggle("B案"))
    expect(
      asking(result.current)
        .options.filter((row) => row.selected)
        .map((row) => row.label),
    ).toEqual(["A案", "B案"])

    act(() => asking(result.current).onToggle("A案"))
    expect(
      asking(result.current)
        .options.filter((row) => row.selected)
        .map((row) => row.label),
    ).toEqual(["B案"])
  })

  it("入力欄に書いた答えは、いま見ている1問の答えとして送る（単一選択では選択と排他）", () => {
    const calls: unknown[] = []
    const result = renderModel([questionPending([question()])], (command) => calls.push(command))

    act(() => asking(result.current).onToggle("A案"))
    act(() => asking(result.current).onAnswerWithText("  架空の自由な答え  "))

    expect(calls).toEqual([
      {
        type: "answer",
        id: "ask-1",
        answer: { kind: "answers", labels: [["架空の自由な答え"]] },
      },
    ])
  })

  it("複数選択では、入力欄に書いた答えは選んだラベルの末尾に足す", () => {
    const calls: unknown[] = []
    const result = renderModel([questionPending([question({ multiSelect: true })])], (command) =>
      calls.push(command),
    )

    act(() => asking(result.current).onToggle("A案"))
    act(() => asking(result.current).onAnswerWithText("架空の補足"))

    expect(calls).toEqual([
      {
        type: "answer",
        id: "ask-1",
        answer: { kind: "answers", labels: [["A案", "架空の補足"]] },
      },
    ])
  })

  it("空白だけの答えでは何も送らない", () => {
    const calls: unknown[] = []
    const result = renderModel([questionPending([question()])], (command) => calls.push(command))

    act(() => asking(result.current).onAnswerWithText("   "))

    expect(calls).toEqual([])
  })

  it("2問は1問ずつ進み、最後に全問ぶんを1回だけ送る（「戻る」で選び直せる）", () => {
    const calls: unknown[] = []
    const result = renderModel(
      [
        questionPending([
          question({ header: "1問目", options: [option("A案"), option("B案")] }),
          question({ header: "2問目", options: [option("C案"), option("D案")] }),
        ]),
      ],
      (command) => calls.push(command),
    )

    expect(asking(result.current).progressLabel).toBe("1 / 2")
    expect(asking(result.current).showBack).toBe(false)
    expect(asking(result.current).last).toBe(false)

    act(() => asking(result.current).onToggle("A案"))
    act(() => asking(result.current).onAnswer())

    expect(calls).toEqual([])
    expect(asking(result.current).header).toBe("2問目")
    expect(asking(result.current).progressLabel).toBe("2 / 2")
    expect(asking(result.current).showBack).toBe(true)

    // 1問目へ戻ると、選んだものが残っている。
    act(() => asking(result.current).onBack())
    expect(asking(result.current).options.find((row) => row.label === "A案")?.selected).toBe(true)

    act(() => asking(result.current).onToggle("B案"))
    act(() => asking(result.current).onAnswer())
    act(() => asking(result.current).onToggle("D案"))
    act(() => asking(result.current).onAnswer())

    expect(calls).toEqual([
      { type: "answer", id: "ask-1", answer: { kind: "answers", labels: [["B案"], ["D案"]] } },
    ])
  })

  it("1問目を入力欄に書いて答えると、2問目へ進み、書いた答えが札に残る", () => {
    const calls: unknown[] = []
    const result = renderModel(
      [
        questionPending([
          question({ header: "1問目", options: [option("A案")] }),
          question({ header: "2問目", options: [option("C案")] }),
        ]),
      ],
      (command) => calls.push(command),
    )

    act(() => asking(result.current).onAnswerWithText("架空の自由な答え"))
    expect(asking(result.current).header).toBe("2問目")

    act(() => asking(result.current).onBack())
    expect(asking(result.current).writtenAnswer).toBe("架空の自由な答え")

    act(() => asking(result.current).onAnswer())
    act(() => asking(result.current).onToggle("C案"))
    act(() => asking(result.current).onAnswer())

    expect(calls).toEqual([
      {
        type: "answer",
        id: "ask-1",
        answer: { kind: "answers", labels: [["架空の自由な答え"], ["C案"]] },
      },
    ])
  })
})
