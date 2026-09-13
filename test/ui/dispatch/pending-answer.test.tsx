import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { type PendingAsk } from "../../../src/protocol/pending-ask.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../src/protocol/session-state.ts"
import { SessionContext, type SessionContextValue } from "../../../src/ui/app.tsx"
import { PendingAnswer } from "../../../src/ui/dispatch/pending-answer.tsx"

// フィクスチャはすべて手で書いた架空の許可要求・質問（docs/coding-standards.md「会話内容の扱い」）。

afterEach(() => {
  cleanup()
})

function renderPendingAnswer(
  pending: readonly PendingAsk[],
  dispatch: SessionContextValue["dispatch"] = () => {},
): void {
  const state: SessionState = { ...INITIAL_SESSION_STATE, pending }
  const value: SessionContextValue = { state, connection: "open", dispatch }
  render(
    <SessionContext.Provider value={value}>
      <PendingAnswer />
    </SessionContext.Provider>,
  )
}

describe("PendingAnswer", () => {
  it("答え待ちが無いときは何も描かない", () => {
    const { container } = render(
      <SessionContext.Provider
        value={{ state: INITIAL_SESSION_STATE, connection: "open", dispatch: () => {} }}
      >
        <PendingAnswer />
      </SessionContext.Provider>,
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
        // labels[i] は questions[i] への答え1つ（protocol/pending-ask.ts の契約）。
        // 複数選んだぶんは部品の側でつないでから送る。
        answer: { kind: "answers", labels: ["A案、C案"] },
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
      { type: "answer", id: "ask-5", answer: { kind: "answers", labels: ["A案"] } },
    ])
  })

  it("質問が2件以上のときは、答えるまで送らず「答える」ボタンで一括送信する", () => {
    const calls: unknown[] = []
    renderPendingAnswer(
      [
        {
          kind: "question",
          id: "ask-6",
          questions: [
            {
              header: "架空の選択1",
              text: "架空の質問1",
              multiSelect: false,
              options: [{ label: "A案", description: "" }],
            },
            {
              header: "架空の選択2",
              text: "架空の質問2",
              multiSelect: false,
              options: [{ label: "B案", description: "" }],
            },
          ],
        },
      ],
      (command) => calls.push(command),
    )

    const submit = screen.getByText("答える") as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    fireEvent.click(screen.getByText("A案"))
    expect(calls).toEqual([])
    expect(submit.disabled).toBe(true)

    fireEvent.click(screen.getByText("B案"))
    expect(submit.disabled).toBe(false)

    fireEvent.click(submit)

    expect(calls).toEqual([
      {
        type: "answer",
        id: "ask-6",
        answer: { kind: "answers", labels: ["A案", "B案"] },
      },
    ])
  })
})
