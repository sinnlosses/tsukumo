import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadTaskBody } from "../../../../src/browser/features/task-board/components/deferred-task-body.tsx"
import { TaskBoard } from "../../../../src/browser/features/task-board/task-board.tsx"
import type { TaskBoardRequest } from "../../../../src/browser/stores/task-board-request.ts"
import type { TaskSummaryItem } from "../../../../src/shared/repository/task-summary.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { putSession } from "../../session-store.ts"

// タスクのモーダルの出し分けと、選んでいる行の移り方・つながりのたどり方。
// フィクスチャはすべて手で書いた架空の課題。

beforeAll(async () => {
  await loadTaskBody()
})

afterEach(() => {
  cleanup()
})

const ISSUE_URL = "https://example.invalid/foo/bar/issues/12"

function beadsTask(location: TaskSummaryItem["location"]): TaskSummaryItem {
  return {
    id: "X-012",
    summary: "架空の課題",
    status: "todo",
    dependencies: [],
    waitingFor: [],
    assignee: undefined,
    body: "## 目的・背景\n\n架空の本文。\n",
    location,
  }
}

function renderBoard(task: TaskSummaryItem): void {
  putSession(INITIAL_SESSION_STATE)
  render(
    <TaskBoard
      tasks={{ kind: "known", items: [task], runPrompt: "/next-task {id}" }}
      request={{ kind: "open", focus: { kind: "first" } }}
      onClose={() => {}}
    />,
  )
}

describe("タスクのモーダルの置き場所（Beads 方式）", () => {
  it("external_ref の URL を情報の表の Issue の行に出し、操作の帯の「Issue を開く」で新しいタブに開く", () => {
    renderBoard(beadsTask({ kind: "issue", url: ISSUE_URL }))

    expect(screen.getByText("Issue", { selector: "dt" })).toBeDefined()
    expect(screen.getByRole("link", { name: ISSUE_URL }).getAttribute("href")).toBe(ISSUE_URL)
    const open = screen.getByRole("link", { name: "Issue を開く" })
    expect(open.getAttribute("href")).toBe(ISSUE_URL)
    expect(open.getAttribute("target")).toBe("_blank")
  })

  it("置き場所の無い課題は、置き場所の行も開く口も出さない", () => {
    renderBoard(beadsTask({ kind: "none" }))

    expect(screen.queryByText("Issue")).toBeNull()
    expect(screen.queryByRole("link", { name: "Issue を開く" })).toBeNull()
  })
})

describe("タスクのモーダルの選択", () => {
  it("選んでいた行が絞り込みで消えると先頭へ落ち、そこから飛んで「戻る」と出ていた先頭の行へ戻る", () => {
    renderSelectionBoard(SELECTION_TASKS, OPEN_FIRST)
    fireEvent.click(screen.getByRole("option", { name: /X-002/ }))
    fireEvent.click(screen.getByRole("button", { name: /^着手できる/ }))
    expectShown("X-001")

    fireEvent.click(screen.getByRole("link", { name: "X-002" }))
    expectShown("X-002")
    fireEvent.click(screen.getByRole("button", { name: "X-001 に戻る" }))

    expectShown("X-001")
  })

  it("先頭へ落ちたあと絞り込みを外しても先頭のまま。検索で0件にしてから消すと、その前に選んでいた行へ戻る", () => {
    renderSelectionBoard(SELECTION_TASKS, OPEN_FIRST)
    fireEvent.click(screen.getByRole("option", { name: /X-002/ }))
    fireEvent.click(screen.getByRole("button", { name: /^着手できる/ }))
    fireEvent.click(screen.getByRole("button", { name: /^すべて/ }))
    expectShown("X-001")

    fireEvent.click(screen.getByRole("option", { name: /X-003/ }))
    fireEvent.change(searchBox(), { target: { value: "どこにも無い語" } })
    expect(screen.queryByRole("option")).toBeNull()
    fireEvent.change(searchBox(), { target: { value: "" } })

    expectShown("X-003")
  })

  it("閉じて開き直すと検索・絞り込み・パンくずが初めに戻り、タスクを指して開くと絞り込みの外でもその行を出す", () => {
    const board = renderSelectionBoard(SELECTION_TASKS, OPEN_FIRST)
    fireEvent.click(screen.getByRole("link", { name: "X-002" }))
    fireEvent.change(searchBox(), { target: { value: "架空" } })
    fireEvent.click(screen.getByRole("button", { name: /^着手できる/ }))
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }))
    board.rerenderWith(SELECTION_TASKS, { kind: "closed" })
    board.rerenderWith(SELECTION_TASKS, OPEN_FIRST)

    expectShown("X-001")
    expect(searchBox().value).toBe("")
    expect(screen.getByRole("button", { name: /^すべて/ }).getAttribute("aria-pressed")).toBe(
      "true",
    )
    expect(screen.queryByRole("navigation", { name: "タスクのつながり" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /^着手できる/ }))
    board.rerenderWith(SELECTION_TASKS, { kind: "open", focus: { kind: "task", id: "X-002" } })

    expectShown("X-002")
    expect(screen.getByRole("option", { selected: true }).textContent).toContain("絞り込みの外")
  })
})

describe("タスクのモーダルの検索欄と本文のリンク", () => {
  // 単体テストには Compiler が掛からないので、本文のリンクは描くたびに作り直される（組み立てた画面でも打鍵ごとに作り直される）。
  it("検索欄に打っているあいだも打ったあともフォーカスは検索欄に留まり、そのあと本文中の ID を押すと飛べる", () => {
    renderSelectionBoard(SELECTION_TASKS, OPEN_FIRST)
    searchBox().focus()

    for (const value of ["X", "X-", "X-0", "X-00"]) {
      fireEvent.change(searchBox(), { target: { value } })
      expect(document.activeElement).toBe(searchBox())
    }
    expectShown("X-001")

    fireEvent.click(screen.getByRole("link", { name: "X-002" }))

    expectShown("X-002")
    expect(screen.getByRole("button", { name: "X-001 に戻る" })).toBeDefined()
  })
})

describe("タスクのモーダル（つながりをたどる）", () => {
  const JUMP_TASKS: readonly TaskSummaryItem[] = [
    selectionTask(
      "X-001",
      "todo",
      [
        "地の文の X-002 は押せる。X-0021 は語の途中、X-999 は一覧に無い。",
        "",
        "中身がまるごと `X-002` の inline code は押せる。`X-0025` は押せない。",
        "",
        "```",
        "X-002",
        "```",
      ].join("\n"),
    ),
    {
      ...selectionTask("X-002", "todo", "架空の本文。\n"),
      dependencies: ["X-001"],
      waitingFor: ["X-001"],
    },
    {
      ...selectionTask("X-003", "todo", "架空の本文。\n"),
      dependencies: ["X-002"],
      waitingFor: ["X-002"],
    },
  ]

  function body(): HTMLElement {
    return screen.getByRole("article", { name: "本文" })
  }

  function option(id: string): HTMLElement {
    const found = document.getElementById(`task-board-option-${id}`)
    if (found === null) {
      throw new Error(`${id} の行が無い`)
    }
    return found
  }

  function frame(): Element {
    const found = document.querySelector(".task-board-frame")
    if (found === null) {
      throw new Error("モーダルの枠が無い")
    }
    return found
  }

  it("本文中の ID は、地の文と中身がまるごと ID の inline code で一覧にあるものだけ押せる", () => {
    renderSelectionBoard(JUMP_TASKS, OPEN_FIRST)

    expect(within(body()).getAllByRole("link", { name: "X-002" })).toHaveLength(2)
    for (const name of ["X-0021", "X-999", "X-0025"]) {
      expect(within(body()).queryByRole("link", { name })).toBeNull()
    }
  })

  it("Alt+← でもパンくずの「戻る」と同じ場所へ戻る", () => {
    renderSelectionBoard(JUMP_TASKS, OPEN_FIRST)
    fireEvent.click(within(body()).getAllByRole("link", { name: "X-002" })[0] ?? body())
    expectShown("X-002")

    fireEvent.keyDown(frame(), { key: "ArrowLeft", altKey: true })

    expectShown("X-001")
  })

  it("「先に終わっていてほしいもの」「これを待っているもの」の札を押すと行き来できる", () => {
    renderSelectionBoard(JUMP_TASKS, OPEN_FIRST)
    fireEvent.click(option("X-002"))

    fireEvent.click(
      within(screen.getByRole("group", { name: "先に終わっていてほしいもの" })).getByRole(
        "button",
        { name: /X-001/ },
      ),
    )
    expectShown("X-001")

    fireEvent.click(
      within(screen.getByRole("group", { name: "これを待っているもの" })).getByRole("button", {
        name: /X-002/,
      }),
    )
    expectShown("X-002")
  })

  it("↓ で行を移ると詳細が切り替わり、待ちのタスクは頼めない理由を添える", () => {
    renderSelectionBoard(JUMP_TASKS, OPEN_FIRST)

    fireEvent.keyDown(frame(), { key: "ArrowDown" })

    expectShown("X-002")
    expect(
      within(screen.getByRole("group", { name: "先に終わっていてほしいもの" })).getByRole(
        "button",
        { name: /X-001/ },
      ),
    ).toBeDefined()
    expect(document.querySelector(".task-board-run-reason")?.textContent).toBe(
      "待ちが終わると頼めます",
    )
  })

  it("検索と絞り込みは組み合わさり、当たらなければその旨を出して詳細を空にする", () => {
    renderSelectionBoard(JUMP_TASKS, OPEN_FIRST)

    fireEvent.click(screen.getByRole("button", { name: /^待ち/ }))
    fireEvent.change(searchBox(), { target: { value: "地の文" } })

    expect(screen.queryByRole("option")).toBeNull()
    expect(screen.getByText("当てはまるタスクが無い")).toBeDefined()
    expect(screen.queryByRole("region", { name: / の詳細$/ })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /^すべて/ }))

    expect(screen.getByRole("option", { name: /X-001/ })).toBeDefined()
  })
})

describe("タスクのモーダルの選択（一覧が届き直したとき）", () => {
  it("開いてから何も操作しないまま、先頭に別の行が来る一覧が届くと、新しい先頭の行を出す", () => {
    const board = renderSelectionBoard(SELECTION_TASKS, OPEN_FIRST)
    expectShown("X-001")

    board.rerenderWith(
      [selectionTask("X-000", "todo", "架空の本文。\n"), ...SELECTION_TASKS],
      OPEN_FIRST,
    )

    expectShown("X-000")
  })
})

const OPEN_FIRST: TaskBoardRequest = { kind: "open", focus: { kind: "first" } }

function selectionTask(id: string, status: string, body: string): TaskSummaryItem {
  return {
    id,
    summary: `架空の課題（${id}）`,
    status,
    dependencies: [],
    waitingFor: [],
    assignee: undefined,
    body,
    location: { kind: "none" },
  }
}

const SELECTION_TASKS: readonly TaskSummaryItem[] = [
  selectionTask("X-001", "todo", "X-002 の保留が解けたら進める。\n"),
  selectionTask("X-002", "hold", "架空の保留。\n"),
  selectionTask("X-003", "todo", "架空の本文。\n"),
]

function renderSelectionBoard(
  items: readonly TaskSummaryItem[],
  request: TaskBoardRequest,
): {
  readonly rerenderWith: (items: readonly TaskSummaryItem[], request: TaskBoardRequest) => void
} {
  putSession(INITIAL_SESSION_STATE)
  const boardOf = (
    nextItems: readonly TaskSummaryItem[],
    nextRequest: TaskBoardRequest,
  ): ReactElement => (
    <TaskBoard
      tasks={{ kind: "known", items: nextItems, runPrompt: "/next-task {id}" }}
      request={nextRequest}
      onClose={() => {}}
    />
  )
  const { rerender } = render(boardOf(items, request))
  return {
    rerenderWith: (nextItems, nextRequest) => {
      rerender(boardOf(nextItems, nextRequest))
    },
  }
}

function searchBox(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("combobox", { name: "タスクを探す" })
}

/** 一覧で選んでいる行と、右に出している詳細が、どちらも `id` のタスクであること。 */
function expectShown(id: string): void {
  expect(screen.getByRole("option", { selected: true }).id).toBe(`task-board-option-${id}`)
  expect(screen.getByRole("region", { name: `${id} の詳細` })).toBeDefined()
}
