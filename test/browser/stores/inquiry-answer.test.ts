import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  useInquiryAnswer,
  useInquiryDraft,
  type InquiryModel,
} from "../../../src/browser/stores/inquiry-answer.ts"
import type { StampedPendingAsk } from "../../../src/shared/session-driver/pending-ask.ts"
import type { Question, QuestionOption } from "../../../src/shared/session-driver/question.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import { type CommandSpy, putSession } from "../session-store.ts"

/**
 * お伺い（答え待ちの許可要求と質問）に対して組み立てる答え（メインビューの札と入力欄の両方が読み書きする1つの
 * 状態。docs/architecture/browser.md「状態の持ち方」）を、部品を描かずに測る。
 */

afterEach(() => {
  cleanup()
  // 組み立て中の答えはモジュール単位で残るので、次のテストへ持ち越さない。
  useInquiryDraft.setState(useInquiryDraft.getInitialState(), true)
})

const PERMISSION_PENDING = {
  kind: "permission",
  id: "ask-perm",
  toolName: "Bash",
  input: { command: "rm -rf /tmp/架空" },
  askedAt: 0,
} satisfies StampedPendingAsk

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

function renderModel(
  pending: readonly StampedPendingAsk[],
  spy: CommandSpy = () => {},
): { readonly current: InquiryModel } {
  putSession({ ...INITIAL_SESSION_STATE, pending }, spy)
  const { result } = renderHook(() => useInquiryAnswer())
  return result
}

function asking(model: InquiryModel): Extract<InquiryModel, { kind: "question" }> {
  if (model.kind !== "question") {
    throw new Error("質問が出ている前提の検査")
  }
  return model
}

function permission(model: InquiryModel): Extract<InquiryModel, { kind: "permission" }> {
  if (model.kind !== "permission") {
    throw new Error("許可要求が出ている前提の検査")
  }
  return model
}

describe("useInquiryAnswer の許可要求", () => {
  it("答え待ちが無いときは none", () => {
    expect(renderModel([]).current.kind).toBe("none")
  })

  it("選択肢は「1 許可」「2 拒否」で、対象の全文と届いた時刻を持つ", () => {
    const result = renderModel([{ ...PERMISSION_PENDING, askedAt: 42 }])

    const model = permission(result.current)
    expect(model.options.map((row) => `${String(row.number)} ${row.text}`)).toEqual([
      "1 許可",
      "2 拒否",
    ])
    expect(model.targetText).toBe("rm -rf /tmp/架空")
    expect(model.askedAt).toBe(42)
    expect(model.canAnswer).toBe(false)
  })

  it("選ばずには送らず、選んでから「これで答える」で allow / deny を送る", () => {
    const calls: unknown[] = []
    const result = renderModel([PERMISSION_PENDING], (command) => calls.push(command))

    act(() => permission(result.current).onAnswer())
    expect(calls).toEqual([])

    act(() => permission(result.current).onToggle("拒否"))
    expect(permission(result.current).options.find((row) => row.selected)?.label).toBe("拒否")
    act(() => permission(result.current).onToggle("許可"))
    act(() => permission(result.current).onAnswer())

    expect(calls).toEqual([
      { procedure: "session.answer", id: "ask-perm", answer: { kind: "allow" } },
    ])
  })

  it("「拒否」を選んで答えると deny を送る", () => {
    const calls: unknown[] = []
    const result = renderModel([PERMISSION_PENDING], (command) => calls.push(command))

    act(() => permission(result.current).onToggle("拒否"))
    act(() => permission(result.current).onAnswer())

    expect(calls).toEqual([
      { procedure: "session.answer", id: "ask-perm", answer: { kind: "deny" } },
    ])
  })
})

describe("useInquiryAnswer の選択肢", () => {
  it("選択肢はラベルの辞書順に並べ（送られた順ではない）、番号は並べ替えたあとの並びで 1 から振る", () => {
    const result = renderModel([
      questionPending([question({ options: [option("C案"), option("A案"), option("B案")] })]),
    ])

    expect(asking(result.current).options.map((row) => [row.number, row.label])).toEqual([
      [1, "A案"],
      [2, "B案"],
      [3, "C案"],
    ])
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
})

describe("useInquiryAnswer の質問の答え方", () => {
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
      { procedure: "session.answer", id: "ask-1", answer: { kind: "answers", labels: [["B案"]] } },
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
        procedure: "session.answer",
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
        procedure: "session.answer",
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
      {
        procedure: "session.answer",
        id: "ask-1",
        answer: { kind: "answers", labels: [["B案"], ["D案"]] },
      },
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
        procedure: "session.answer",
        id: "ask-1",
        answer: { kind: "answers", labels: [["架空の自由な答え"], ["C案"]] },
      },
    ])
  })
})
