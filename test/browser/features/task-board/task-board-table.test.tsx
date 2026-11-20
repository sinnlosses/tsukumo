import { cleanup, fireEvent, screen, within } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadTaskBody } from "../../../../src/browser/features/task-board/deferred-task-body.tsx"
import type { TaskSummaryItem } from "../../../../src/shared/repository/task-summary.ts"
import { OPEN_FIRST, renderSelectionBoard, selectionTask } from "./task-board-harness.tsx"

// タスクのモーダルの一覧の表（列・段・待ちの相手）と、頭の件数の帯。
// フィクスチャはすべて手で書いた架空の課題。

beforeAll(async () => {
  await loadTaskBody()
})

afterEach(() => {
  cleanup()
})

const TABLE_TASKS: readonly TaskSummaryItem[] = [
  { ...selectionTask("X-021", "todo", "架空の本文。\n"), difficulty: "sonnet", loopable: "Y" },
  { ...selectionTask("X-022", "doing", "架空の本文。\n"), difficulty: "opus", loopable: "N" },
  {
    ...selectionTask("X-023", "todo", "架空の本文。\n"),
    dependencies: ["X-021", "X-022"],
    waitingFor: ["X-021", "X-022"],
  },
  selectionTask("X-024", "done", "架空の本文。\n"),
]

function option(id: string): HTMLElement {
  return screen.getByRole("option", { name: new RegExp(`^${id} `) })
}

/** 行の4つの列（番号・題・難しさ・ループ可）の字。 */
function cellsOf(id: string): readonly string[] {
  return [...option(id).children].map((cell) => cell.textContent)
}

describe("タスクのモーダルの一覧の表", () => {
  it("段は listbox の中の group で、名前は段の名前と件数。済みの段も開いて出す", () => {
    renderSelectionBoard(TABLE_TASKS, OPEN_FIRST)

    const listbox = screen.getByRole("listbox", { name: "タスク" })
    expect(
      within(listbox)
        .getAllByRole("group")
        .map((group) => group.getAttribute("aria-label")),
    ).toEqual(["いま 1", "つぎ 1", "待ち 1", "済み 1"])
    expect(
      within(screen.getByRole("group", { name: "済み 1" })).getByRole("option", { name: /X-024/ }),
    ).toBeDefined()
  })

  it("列は番号・題・難しさ・ループ可の順で、∞ は Y の行だけ。属性の無い行は空ける", () => {
    renderSelectionBoard(TABLE_TASKS, OPEN_FIRST)

    expect(cellsOf("X-021")).toEqual(["X-021", "架空の課題（X-021）着手可", "", ""])
    expect(within(option("X-021")).getByRole("img", { name: "難しさ sonnet" })).toBeDefined()
    expect(within(option("X-022")).getByRole("img", { name: "難しさ opus" })).toBeDefined()
    expect(within(option("X-024")).queryByRole("img")).toBeNull()
    expect(
      within(option("X-021")).getByRole("img", { name: "ループ可" }).getAttribute("aria-label"),
    ).toBe("ループ可")
    expect(within(option("X-022")).queryByRole("img", { name: "ループ可" })).toBeNull()
  })

  it("待ちの相手は題の後ろに「待ち <相手>」で添え、名前は番号・題・状態・難しさの順に読める", () => {
    renderSelectionBoard(TABLE_TASKS, OPEN_FIRST)

    expect(cellsOf("X-023")[1]).toBe("架空の課題（X-023）待ち X-021, X-022")
    expect(option("X-022").textContent).toBe("X-022架空の課題（X-022）進行中")
    expect(screen.getByRole("option", { name: /X-022.*進行中.*難しさ opus/ })).toBeDefined()
  })

  it("作業先の札は作業先のある行の題の欄にだけ出る", () => {
    renderSelectionBoard(
      [
        { ...selectionTask("X-021", "todo", "架空の本文。\n"), workRepo: "架空の作業先" },
        selectionTask("X-022", "doing", "架空の本文。\n"),
      ],
      OPEN_FIRST,
    )

    expect(cellsOf("X-021")[1]).toBe("架空の課題（X-021）着手可架空の作業先")
    expect(cellsOf("X-022")[1]).toBe("架空の課題（X-022）進行中")
  })

  it("列の見出しの行は読み上げない", () => {
    renderSelectionBoard(TABLE_TASKS, OPEN_FIRST)

    const head = screen.getByText("題").parentElement
    expect(head?.getAttribute("aria-hidden")).toBe("true")
  })
})

describe("タスクのモーダルの一覧と詳細の仕切り", () => {
  it("仕切りはフォーカスを受け、→ で動かした幅を覚える", () => {
    localStorage.removeItem(WIDTH_KEY)
    renderSelectionBoard(TABLE_TASKS, OPEN_FIRST)
    const separator = screen.getByRole("separator", { name: "一覧と詳細の仕切り" })

    fireEvent.keyDown(separator, { key: "ArrowRight" })

    expect(separator.tabIndex).toBe(0)
    expect(localStorage.getItem(WIDTH_KEY)).not.toBeNull()
    localStorage.removeItem(WIDTH_KEY)
  })
})

const WIDTH_KEY = "tsukumo-task-board-list-width:v2"

describe("タスクのモーダルの件数の帯", () => {
  it("すべて・進行中・着手可・待ち・保留・ドラフト・完了の順に件数を出し、頭の題に全体の件数を添える", () => {
    renderSelectionBoard(TABLE_TASKS, OPEN_FIRST)

    expect(
      within(screen.getByRole("group", { name: "状態で絞る" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["すべて 4", "進行中 1", "着手可 1", "待ち 1", "保留 0", "ドラフト 0", "完了 1"])
    expect(screen.getByRole("heading", { name: "タスク 4" })).toBeDefined()
  })
})
