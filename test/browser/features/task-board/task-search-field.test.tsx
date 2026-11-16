import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadTaskBody } from "../../../../src/browser/features/task-board/deferred-task-body.tsx"
import { useComposerFocus } from "../../../../src/browser/stores/composer-focus.ts"
import type { TaskSummaryItem } from "../../../../src/shared/repository/task-summary.ts"
import { knownTaskSummary, taskStatusOfWord } from "../../../fixture/session-state.ts"
import { TaskList } from "./task-list-harness.tsx"

// フィクスチャはすべて手で書いた架空のタスク。

beforeAll(async () => {
  await loadTaskBody()
})

afterEach(() => {
  cleanup()
  useComposerFocus.setState(useComposerFocus.getInitialState(), true)
})

function taskOf(id: string, status: string, summary: string): TaskSummaryItem {
  return {
    id,
    summary,
    status: taskStatusOfWord(status),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    importance: "normal",
    urgency: "normal",
    body: "",
    location: { kind: "none" },
  }
}

const ITEMS = [
  taskOf("X-001", "doing", "青い箱を作る"),
  taskOf("X-002", "todo", "青い鍵を返す"),
  taskOf("X-003", "done", "青い窓を拭く"),
  taskOf("X-004", "todo", "赤い庭"),
]

function renderList(): HTMLInputElement {
  render(<TaskList tasks={knownTaskSummary(ITEMS)} />)
  return screen.getByRole("combobox", { name: "タスクを探す" })
}

function type(input: HTMLInputElement, value: string): void {
  fireEvent.change(input, { target: { value } })
}

function peek(): Element | null {
  return document.querySelector('dialog[aria-label$=" の詳細"]')
}

describe("探す欄", () => {
  it("語で段が絞られ、済みの段が開き、当たった語が強調される", () => {
    const input = renderList()
    type(input, "青")

    expect(screen.queryByText("赤い庭")).toBeNull()
    expect(document.getElementById("task-row-X-003")).not.toBeNull()
    expect(document.querySelector("mark")?.textContent).toBe("青")
    expect(screen.getByText("3件")).toBeDefined()
  })

  it("当たりが0件なら探した範囲を言う1文を出す", () => {
    const input = renderList()
    type(input, "緑")

    expect(screen.getByText("『緑』に当たるタスクは無い（ID・題・本文を探した）")).toBeDefined()
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0)
  })

  it("↑↓ で選ぶ行が動き、aria-activedescendant が追い、フォーカスは欄に残る", () => {
    const input = renderList()
    type(input, "青")

    expect(input.getAttribute("aria-activedescendant")).toBe("task-row-X-001")
    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(input.getAttribute("aria-activedescendant")).toBe("task-row-X-002")
    expect(document.getElementById("task-row-X-002")?.getAttribute("aria-selected")).toBe("true")
    fireEvent.keyDown(input, { key: "ArrowUp" })
    expect(input.getAttribute("aria-activedescendant")).toBe("task-row-X-001")
  })

  it("Enter で選んでいる行のプレビューが開く", () => {
    const input = renderList()
    type(input, "青")
    fireEvent.keyDown(input, { key: "ArrowDown" })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(peek()?.getAttribute("aria-label")).toBe("X-002 の詳細")
  })

  it("変換中の Enter では開かない", () => {
    const input = renderList()
    type(input, "青")
    fireEvent.keyDown(input, { key: "Enter", isComposing: true })

    expect(peek()).toBeNull()
  })

  it("語があるときの Esc は語を消し、フォーカスは入力欄へ送らない", () => {
    const input = renderList()
    input.focus()
    type(input, "青")
    fireEvent.keyDown(input, { key: "Escape" })

    expect(input.value).toBe("")
    expect(document.activeElement).toBe(input)
    expect(useComposerFocus.getState().signal).toBe(0)
  })

  it("語が空の Esc は入力欄へフォーカスを戻すよう頼む", () => {
    const input = renderList()
    fireEvent.keyDown(input, { key: "Escape" })

    expect(useComposerFocus.getState().signal).toBe(1)
  })

  it("/ を打っても入力欄へ移らない", () => {
    const input = renderList()
    fireEvent.keyDown(input, { key: "/" })

    expect(useComposerFocus.getState().signal).toBe(0)
  })

  it("「×」で語が消える", () => {
    const input = renderList()
    type(input, "青")
    fireEvent.click(screen.getByRole("button", { name: "語を消す" }))

    expect(input.value).toBe("")
  })
})
