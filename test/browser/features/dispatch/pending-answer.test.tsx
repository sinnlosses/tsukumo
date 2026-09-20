import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { PendingAnswer } from "../../../../src/browser/features/dispatch/pending-answer.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { type PendingAsk } from "../../../../src/shared/pending-ask.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { type CommandSpy, sessionStoreWith } from "../../session-store.ts"

// フィクスチャはすべて手で書いた架空の許可要求・質問（docs/coding-standards.md「会話内容の扱い」）。

afterEach(() => {
  cleanup()
})

function renderPendingAnswer(
  pending: readonly PendingAsk[],
  dispatch: CommandSpy = () => {},
): void {
  const state: SessionState = { ...INITIAL_SESSION_STATE, pending }
  const store = sessionStoreWith(state, dispatch)
  render(
    <SessionStoreContext.Provider value={store}>
      <PendingAnswer />
    </SessionStoreContext.Provider>,
  )
}

function oneQuestion(id: string): PendingAsk {
  return {
    kind: "question",
    id,
    questions: [
      {
        header: "架空の選択",
        text: "架空の質問",
        multiSelect: false,
        options: [
          { label: "A案", description: "架空の説明A" },
          { label: "B案", description: "架空の説明B" },
        ],
      },
    ],
  }
}

function twoQuestions(id: string): PendingAsk {
  return {
    kind: "question",
    id,
    questions: [
      {
        header: "架空の選択1",
        text: "架空の質問1",
        multiSelect: false,
        options: [
          { label: "A案", description: "架空の説明A" },
          { label: "B案", description: "架空の説明B" },
        ],
      },
      {
        header: "架空の選択2",
        text: "架空の質問2",
        multiSelect: false,
        options: [
          { label: "C案", description: "架空の説明C" },
          { label: "D案", description: "架空の説明D" },
        ],
      },
    ],
  }
}

describe("PendingAnswer", () => {
  it("答え待ちが無いときは何も描かない", () => {
    const { container } = render(
      <SessionStoreContext.Provider value={sessionStoreWith(INITIAL_SESSION_STATE)}>
        <PendingAnswer />
      </SessionStoreContext.Provider>,
    )

    expect(container.innerHTML).toBe("")
  })

  it("(7) 許可要求で「許可」「拒否」が answer を dispatch する", () => {
    const calls: unknown[] = []
    renderPendingAnswer(
      [{ kind: "permission", id: "ask-1", toolName: "Bash", input: { command: "echo dummy" } }],
      (command) => calls.push(command),
    )

    expect(screen.getByText("Bash")).toBeDefined()
    fireEvent.click(screen.getByText("許可"))

    expect(calls).toEqual([{ type: "answer", id: "ask-1", answer: { kind: "allow" } }])
  })

  it("拒否ボタンも同じ経路で answer を dispatch する", () => {
    const calls: unknown[] = []
    renderPendingAnswer(
      [{ kind: "permission", id: "ask-1", toolName: "Bash", input: {} }],
      (command) => calls.push(command),
    )

    fireEvent.click(screen.getByText("拒否"))

    expect(calls).toEqual([{ type: "answer", id: "ask-1", answer: { kind: "deny" } }])
  })

  it("(8) multiSelect: true で2つ選んで送ると、選んだ2つが「、」でつながって届く", () => {
    const calls: unknown[] = []
    renderPendingAnswer(
      [
        {
          kind: "question",
          id: "ask-2",
          questions: [
            {
              header: "架空の選択",
              text: "架空の質問：どれを試す？",
              multiSelect: true,
              options: [
                { label: "A案", description: "架空の説明" },
                { label: "B案", description: "架空の説明" },
                { label: "C案", description: "架空の説明" },
              ],
            },
          ],
        },
      ],
      (command) => calls.push(command),
    )

    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[0]!)
    fireEvent.click(checkboxes[2]!)

    const submit = screen.getByText("答える") as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)

    expect(calls).toEqual([
      {
        type: "answer",
        id: "ask-2",
        // labels[i] は questions[i] に対して選んだ答えの並び（shared/pending-ask.ts の
        // 契約）。複数選んだぶんはそのまま並べて送り、1つの文字列には畳まない
        // （畳むのは src/server/core/pending-answer.ts）。
        answer: { kind: "answers", labels: [["A案", "C案"]] },
      },
    ])
  })

  it("(9) 自由入力欄が常に1つ出る（モデルが「その他」を含めなくても）", () => {
    renderPendingAnswer([
      {
        kind: "question",
        id: "ask-3",
        questions: [
          {
            header: "架空の選択",
            text: "架空の質問",
            multiSelect: false,
            options: [
              { label: "A案", description: "" },
              { label: "B案", description: "" },
            ],
          },
        ],
      },
    ])

    expect(screen.getAllByLabelText("その他")).toHaveLength(1)
  })

  it("(9) モデルが「その他」を選択肢に含めても、自由入力欄は二重に出さない", () => {
    renderPendingAnswer([
      {
        kind: "question",
        id: "ask-4",
        questions: [
          {
            header: "架空の選択",
            text: "架空の質問",
            multiSelect: false,
            options: [
              { label: "A案", description: "" },
              { label: "その他", description: "" },
            ],
          },
        ],
      },
    ])

    expect(screen.getAllByLabelText("その他")).toHaveLength(1)
  })

  it("質問が1件・単一選択のときは選ぶと即答える（「答える」ボタンは出ない）", () => {
    const calls: unknown[] = []
    renderPendingAnswer(
      [
        {
          kind: "question",
          id: "ask-5",
          questions: [
            {
              header: "架空の選択",
              text: "架空の質問",
              multiSelect: false,
              options: [
                { label: "A案", description: "" },
                { label: "B案", description: "" },
              ],
            },
          ],
        },
      ],
      (command) => calls.push(command),
    )

    expect(screen.queryByText("答える")).toBeNull()

    fireEvent.click(screen.getByText("A案"))

    expect(calls).toEqual([
      { type: "answer", id: "ask-5", answer: { kind: "answers", labels: [["A案"]] } },
    ])
  })

  it("質問が2件あっても、同時に見えるのは1問だけ", () => {
    const { container } = render(
      <SessionStoreContext.Provider
        value={sessionStoreWith({ ...INITIAL_SESSION_STATE, pending: [twoQuestions("ask-6")] })}
      >
        <PendingAnswer />
      </SessionStoreContext.Provider>,
    )

    expect(container.querySelectorAll(".question-card")).toHaveLength(1)
    expect(screen.getByText("架空の質問1")).toBeDefined()
    expect(screen.queryByText("架空の質問2")).toBeNull()
  })

  it("質問が2件のとき、両方に答えると labels 2件で1回だけ dispatch する", () => {
    const calls: unknown[] = []
    renderPendingAnswer([twoQuestions("ask-7")], (command) => calls.push(command))

    fireEvent.click(screen.getByText("A案"))
    expect(calls).toEqual([])

    fireEvent.click(screen.getByText("C案"))

    expect(calls).toEqual([
      {
        type: "answer",
        id: "ask-7",
        answer: { kind: "answers", labels: [["A案"], ["C案"]] },
      },
    ])
  })

  it("「戻る」で前の質問に戻り、選び直した答えが反映される", () => {
    const calls: unknown[] = []
    renderPendingAnswer([twoQuestions("ask-8")], (command) => calls.push(command))

    fireEvent.click(screen.getByText("A案"))
    fireEvent.click(screen.getByText("戻る"))

    expect(screen.getByText("架空の質問1")).toBeDefined()
    // 選んだ答えは残っている。
    expect(document.querySelector(".question-choice.is-selected")?.textContent).toContain("A案")

    fireEvent.click(screen.getByText("B案"))
    fireEvent.click(screen.getByText("C案"))

    expect(calls).toEqual([
      {
        type: "answer",
        id: "ask-8",
        answer: { kind: "answers", labels: [["B案"], ["C案"]] },
      },
    ])
  })

  it("いま何問目かは質問が2件以上のときだけ出す", () => {
    renderPendingAnswer([twoQuestions("ask-9")])

    expect(screen.getByText("2問中1問目")).toBeDefined()

    fireEvent.click(screen.getByText("A案"))

    expect(screen.getByText("2問中2問目")).toBeDefined()
  })

  it("質問が1件のときは、いま何問目かを出さない", () => {
    renderPendingAnswer([oneQuestion("ask-10")])

    expect(screen.queryByText("1問中1問目")).toBeNull()
  })

  it("単一選択で自由入力に打つと、直前に押した選択肢の選択が外れる", () => {
    const { container } = render(
      <SessionStoreContext.Provider
        value={sessionStoreWith({ ...INITIAL_SESSION_STATE, pending: [twoQuestions("ask-11")] })}
      >
        <PendingAnswer />
      </SessionStoreContext.Provider>,
    )

    fireEvent.click(screen.getByText("A案"))
    fireEvent.click(screen.getByText("戻る"))
    expect(container.querySelector(".question-choice.is-selected")).not.toBeNull()

    fireEvent.change(screen.getByLabelText("その他"), { target: { value: "D案（架空）" } })

    expect(container.querySelector(".question-choice.is-selected")).toBeNull()
  })

  it("自由入力欄に「送る」ボタンは無い", () => {
    renderPendingAnswer([oneQuestion("ask-12")])

    expect(screen.queryByText("送る")).toBeNull()
  })

  it("自由入力欄で Enter を押すと、最後の質問なら自由入力の文字列を送る", () => {
    const calls: unknown[] = []
    renderPendingAnswer([oneQuestion("ask-13")], (command) => calls.push(command))

    const input = screen.getByLabelText("その他")
    fireEvent.change(input, { target: { value: " D案（架空） " } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(calls).toEqual([
      { type: "answer", id: "ask-13", answer: { kind: "answers", labels: [["D案（架空）"]] } },
    ])
  })

  it("自由入力欄で Enter を押すと、最後の質問でなければ次の質問へ進む", () => {
    const calls: unknown[] = []
    renderPendingAnswer([twoQuestions("ask-14")], (command) => calls.push(command))

    const input = screen.getByLabelText("その他")
    fireEvent.change(input, { target: { value: "D案（架空）" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(screen.getByText("架空の質問2")).toBeDefined()
    expect(calls).toEqual([])

    fireEvent.click(screen.getByText("C案"))

    expect(calls).toEqual([
      {
        type: "answer",
        id: "ask-14",
        answer: { kind: "answers", labels: [["D案（架空）"], ["C案"]] },
      },
    ])
  })

  it("自由入力に文字があるときだけ、単一選択でも進むボタンを出す", () => {
    renderPendingAnswer([twoQuestions("ask-15")])

    expect(screen.queryByText("次へ")).toBeNull()

    fireEvent.change(screen.getByLabelText("その他"), { target: { value: "D案（架空）" } })

    expect(screen.getByText("次へ")).toBeDefined()
    expect(screen.queryByText("答える")).toBeNull()
  })
})
