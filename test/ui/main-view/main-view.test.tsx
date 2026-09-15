import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen, type RenderResult } from "@testing-library/react"

import { type MainViewQuestion } from "../../../src/protocol/main-view.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionRecord,
  type SessionState,
} from "../../../src/protocol/session-state.ts"
import { SessionContext, type SessionContextValue } from "../../../src/ui/app.tsx"
import { MainView } from "../../../src/ui/main-view/main-view.tsx"
import { QuestionRecord } from "../../../src/ui/main-view/question-record.tsx"
import { TurnSelectionProvider } from "../../../src/ui/turn-selection.tsx"

afterEach(() => {
  cleanup()
})

function request(text: string): SessionRecord {
  return { kind: "request", text }
}

function detail(markdown: string): SessionRecord {
  return { kind: "detail", markdown }
}

function speech(text: string): SessionRecord {
  return { kind: "speech", text, expression: "default" }
}

function tool(
  overrides: Partial<Extract<SessionRecord, { readonly kind: "tool" }>>,
): SessionRecord {
  return {
    kind: "tool",
    toolUseId: "fake-tool",
    name: "Read",
    input: {},
    nested: false,
    startedAt: 0,
    result: { content: "ok", isError: false },
    ...overrides,
  }
}

function renderMainView(records: readonly SessionRecord[]): RenderResult {
  const state: SessionState = { ...INITIAL_SESSION_STATE, records }
  const value: SessionContextValue = { state, connection: "open", dispatch: () => {} }
  return render(
    <SessionContext.Provider value={value}>
      <TurnSelectionProvider>
        <MainView />
      </TurnSelectionProvider>
    </SessionContext.Provider>,
  )
}

function rerenderMainView(result: RenderResult, records: readonly SessionRecord[]): void {
  const state: SessionState = { ...INITIAL_SESSION_STATE, records }
  const value: SessionContextValue = { state, connection: "open", dispatch: () => {} }
  result.rerender(
    <SessionContext.Provider value={value}>
      <TurnSelectionProvider>
        <MainView />
      </TurnSelectionProvider>
    </SessionContext.Provider>,
  )
}

describe("MainView（タブの規則）", () => {
  it("3ターンまでタブが出て、新しいターンで先頭（今回）へ戻る", () => {
    const result = renderMainView([
      request("1つ目"),
      detail("1つ目のレポート"),
      request("2つ目"),
      detail("2つ目のレポート"),
      request("3つ目"),
      detail("3つ目のレポート"),
    ])

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "今回",
      "1つ前",
      "2つ前",
    ])
    expect(screen.getByText("3つ目のレポート")).toBeDefined()

    // 4つ目が始まると、先頭（今回）は自動でそちらに変わる。
    rerenderMainView(result, [
      request("1つ目"),
      detail("1つ目のレポート"),
      request("2つ目"),
      detail("2つ目のレポート"),
      request("3つ目"),
      detail("3つ目のレポート"),
      request("4つ目"),
      detail("4つ目のレポート"),
    ])

    expect(screen.getByText("4つ目のレポート")).toBeDefined()
    expect(screen.queryByText("3つ目のレポート")).toBeNull()
  })

  it("過去のタブを見ている間は、新しいターンが来ても動かない", () => {
    const result = renderMainView([
      request("1つ目"),
      detail("1つ目のレポート"),
      request("2つ目"),
      detail("2つ目のレポート"),
      request("3つ目"),
      detail("3つ目のレポート"),
    ])

    // 「1つ前」（2つ目）のタブを選ぶ。
    fireEvent.click(screen.getByText("1つ前"))
    expect(screen.getByText("2つ目のレポート")).toBeDefined()

    // 新しいターンが始まっても、選んだタブのままでいる。
    rerenderMainView(result, [
      request("1つ目"),
      detail("1つ目のレポート"),
      request("2つ目"),
      detail("2つ目のレポート"),
      request("3つ目"),
      detail("3つ目のレポート"),
      request("4つ目"),
      detail("4つ目のレポート"),
    ])

    expect(screen.getByText("2つ目のレポート")).toBeDefined()
    expect(screen.queryByText("4つ目のレポート")).toBeNull()
  })
})

describe("MainView（セリフはレポートに出さない）", () => {
  it("セリフの記録が混ざっても、レポートには出ずタブの並びも変わらない", () => {
    renderMainView([
      request("1つ目"),
      speech("1つ目のセリフ"),
      detail("1つ目のレポート"),
      request("2つ目"),
      speech("2つ目のセリフ"),
      detail("2つ目のレポート"),
    ])

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "今回",
      "1つ前",
    ])
    expect(screen.getByText("2つ目のレポート")).toBeDefined()
    expect(screen.queryByText("2つ目のセリフ")).toBeNull()

    // 「1つ前」も、セリフ抜きのレポートだけが出る（ターンの区切りはずれない）。
    fireEvent.click(screen.getByText("1つ前"))
    expect(screen.getByText("1つ目のレポート")).toBeDefined()
    expect(screen.queryByText("1つ目のセリフ")).toBeNull()
  })
})

describe("MainView（ツールの行は toolVisibility の2種だけ）", () => {
  it("ファイルを変えた操作とサブエージェントの起動だけが出る", () => {
    renderMainView([
      request("依頼"),
      tool({ toolUseId: "t1", name: "Edit", input: { file_path: "src/a.ts" } }),
      tool({ toolUseId: "t2", name: "Read", input: { file_path: "src/b.ts" } }),
      tool({ toolUseId: "t3", name: "Agent", input: { description: "調査タスク" } }),
    ])

    expect(screen.getByText("Edit: src/a.ts")).toBeDefined()
    expect(screen.getByText(/^Agent: 調査タスク$/)).toBeDefined()
    expect(screen.queryByText(/Read/)).toBeNull()
  })

  it("失敗したツールは引数も出力も出さない（過程はサイドバーに寄せた）", () => {
    const { container } = renderMainView([
      request("依頼"),
      tool({
        toolUseId: "t1",
        name: "Bash",
        input: { command: "架空のコマンド" },
        result: { content: "架空のエラー出力", isError: true },
      }),
    ])

    expect(container.querySelectorAll("pre.tool-input")).toHaveLength(0)
    expect(container.querySelectorAll("pre.tool-result")).toHaveLength(0)
    expect(container.querySelectorAll(".tool-block-failed")).toHaveLength(0)
    expect(screen.queryByText(/架空のコマンド/)).toBeNull()
    expect(screen.queryByText(/架空のエラー出力/)).toBeNull()
    // ツール名だけの器も残さない（ステップごと消える）。
    expect(container.querySelectorAll(".main-step")).toHaveLength(0)
  })

  it("失敗しても、ファイルを変えた操作はパスだけの行として残る", () => {
    const { container } = renderMainView([
      request("依頼"),
      tool({
        toolUseId: "t1",
        name: "Edit",
        input: { file_path: "src/a.ts" },
        result: { content: "架空のエラー出力", isError: true },
      }),
    ])

    expect(screen.getByText("Edit: src/a.ts")).toBeDefined()
    expect(container.querySelectorAll("pre")).toHaveLength(0)
    expect(screen.queryByText(/架空のエラー出力/)).toBeNull()
  })
})

describe("MainView（見せないツールだけのステップ）", () => {
  it("見せないツールしか無いステップは、枠だけのカードを残さない", () => {
    const { container } = renderMainView([
      request("依頼"),
      tool({ name: "Read", input: { file_path: "/a.ts" } }),
      tool({ name: "Grep", input: { pattern: "x" } }),
    ])

    expect(container.querySelectorAll(".main-step")).toHaveLength(0)
    expect(container.querySelectorAll(".step-tools")).toHaveLength(0)
  })

  it("見せるツールが1つでもあれば、そのステップは出る", () => {
    const { container } = renderMainView([
      request("依頼"),
      tool({ name: "Read", input: { file_path: "/a.ts" } }),
      tool({ name: "Write", input: { file_path: "/b.ts" } }),
    ])

    expect(container.querySelectorAll(".main-step")).toHaveLength(1)
    expect(container.querySelectorAll(".tool-block")).toHaveLength(1)
  })
})

describe("MainView（質問の記録）", () => {
  // `QuestionRecord` を直接見る（`MainViewQuestion` は `SessionRecord` にまだ無く、
  // 実際の `SessionState.records` からは今のところ作られない。`MainViewEntry` の型としては
  // 存在するので、部品自体は `MainView` を経由せずここで確かめる）。
  it("選ばれた答えに印が付く", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [
        {
          header: "確認",
          text: "どちらにする？",
          multiSelect: false,
          options: [
            { label: "案A", description: "" },
            { label: "案B", description: "" },
          ],
        },
      ],
      answers: ["案B"],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    const options = [...container.querySelectorAll(".question-option")]
    const optionA = options.find((option) => option.textContent?.includes("案A"))
    const optionB = options.find((option) => option.textContent?.includes("案B"))

    expect(optionB?.className).toContain("is-chosen")
    expect(optionA?.className).not.toContain("is-chosen")
  })
})
