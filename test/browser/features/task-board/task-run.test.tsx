import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { TaskBoard } from "../../../../src/browser/features/task-board/task-board.tsx"
import { useTaskSheet } from "../../../../src/browser/stores/task-sheet.ts"
import type {
  TaskSummaryItem,
  TaskSummaryResult,
} from "../../../../src/shared/repository/task-summary.ts"
import { BUILTIN_GEAR_PREFERENCES } from "../../../../src/shared/session/gear-preference.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../src/shared/session/session-state.ts"
import { characterInfo } from "../../../fixture/character.ts"
import { knownTaskSummary, taskStatusOfWord } from "../../../fixture/session-state.ts"
import { queryClientWrapper } from "../../query-client.tsx"
import { type CommandSpy, putSession } from "../../session-store.ts"
import { TaskList } from "./task-list-harness.tsx"

// フィクスチャはすべて手で書いた架空のタスク（実物のタスクファイルは使わない）。

afterEach(() => {
  cleanup()
  useTaskSheet.setState(useTaskSheet.getInitialState(), true)
})

function known(items: readonly TaskSummaryItem[]): TaskSummaryResult {
  return knownTaskSummary(items)
}

const TASKS: readonly TaskSummaryItem[] = [
  {
    id: "X-001",
    summary: "架空の済んだタスク",
    status: taskStatusOfWord("done"),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    importance: "normal",
    urgency: "normal",
    body: "",
    location: { kind: "none" },
  },
  {
    id: "X-002",
    summary: "架空の未着手タスク",
    status: taskStatusOfWord("todo"),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    importance: "normal",
    urgency: "normal",
    body: "",
    location: { kind: "none" },
  },
]

const RUNNING_TURN: Partial<SessionState> = { turn: { kind: "running", startedAt: 0 } }

/** 歯車で起動するスキルを覚えた姿。 */
function launchSkillState(launchSkill: string): Partial<SessionState> {
  return { gearPreferences: { ...BUILTIN_GEAR_PREFERENCES, launchSkill } }
}

/** サイドバーの区画の一覧。確認は姿と送り口が要るので store で包む。 */
function renderList(spy: CommandSpy, overrides: Partial<SessionState>): void {
  renderWithStore(<TaskList tasks={known(TASKS)} />, spy, overrides)
}

/** 見出しの「一覧を見る」で開くタスクのモーダル（開いた状態で描く）。閉じる要求は `closed` に溜まる。 */
function renderBoard(
  spy: CommandSpy = () => {},
  closed: string[] = [],
  tasks: readonly TaskSummaryItem[] = TASKS,
  overrides: Partial<SessionState> = {},
): void {
  renderWithStore(
    <TaskBoard
      tasks={known(tasks)}
      request={{ kind: "open", focus: { kind: "first" }, query: "" }}
      onClose={() => {
        closed.push("モーダル")
      }}
    />,
    spy,
    overrides,
  )
}

function renderWithStore(
  node: ReactNode,
  spy: CommandSpy,
  overrides: Partial<SessionState> = {},
): void {
  putSession({ ...INITIAL_SESSION_STATE, character: characterInfo(), ...overrides }, spy)
  render(<>{node}</>, { wrapper: queryClientWrapper() })
}

/** 送られたコマンドを配列に溜める、受け取る関数。 */
function collectInto(sent: unknown[]): CommandSpy {
  return (command) => {
    sent.push(command)
  }
}

/** 確認のモーダル（開いているときだけ木に居る）。 */
function confirmDialog(): Element | null {
  return document.querySelector("dialog.task-run-confirm")
}

describe("タスクの実行を頼む", () => {
  it("ターンが動いている間は確認の「頼む」を出さず、理由を出す", () => {
    const sent: unknown[] = []
    renderList(collectInto(sent), RUNNING_TURN)

    startFromSheet("X-002")

    expect(screen.queryByRole("button", { name: "頼む" })).toBeNull()
    expect(confirmDialog()?.textContent).toContain("いまターンが動いているので送れない")
    expect(sent).toEqual([])
  })

  it.each([
    ["「キャンセル」", () => fireEvent.click(screen.getByRole("button", { name: "キャンセル" }))],
    [
      "Esc",
      () => {
        if (confirmDialog() === null) {
          throw new Error("確認が開いていない")
        }
        fireEvent.keyDown(document, { key: "Escape" })
      },
    ],
  ])(
    "サイドシートの確認を %s で閉じると、何も送らず確認だけ閉じて、サイドシートは残る",
    (_, dismiss) => {
      const sent: unknown[] = []
      renderList(collectInto(sent), {})

      startFromSheet("X-002")
      dismiss()

      expect(sent).toEqual([])
      expect(confirmDialog()).toBeNull()
      expect(screen.getByRole("complementary", { name: "架空の未着手タスク" })).toBeDefined()
    },
  )

  it("モーダルから断ったときは確認だけ閉じ、一覧へ戻れる", () => {
    const closed: string[] = []
    renderBoard(() => {}, closed)

    openRunConfirm("X-002")
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }))

    expect(closed).toEqual([])
    expect(confirmDialog()).toBeNull()
    expect(document.querySelector("dialog.task-board")?.hasAttribute("open")).toBe(true)
  })

  // 確認はモーダルの `<dialog>` の中に組み立てられるので、その backdrop のクリックがモーダルまで
  // 届くと一覧ごと消える（モーダルを閉じる判定は `event.target` がモーダル自身のときだけ）。
  it("確認を開いてもモーダルは開いたまま", () => {
    const closed: string[] = []
    renderBoard(() => {}, closed)

    openRunConfirm("X-002")
    const dialog = confirmDialog()
    if (dialog === null) {
      throw new Error("確認が開いていない")
    }
    fireEvent.pointerDown(dialog)
    fireEvent.pointerUp(dialog)
    fireEvent.click(dialog)

    expect(closed).toEqual([])
    expect(document.querySelector("dialog.task-board")?.hasAttribute("open")).toBe(true)
  })

  it("サイドシートの頼む口を押せるのは着手できる todo と待ちの無い保留で、ほかは押せない口と理由を出す", () => {
    const task = (
      id: string,
      status: string,
      dependencies: readonly string[],
    ): TaskSummaryItem => ({
      id,
      summary: `架空のタスク ${id}`,
      status: taskStatusOfWord(status),
      dependencies,
      waitingFor: dependencies,
      labels: [],
      difficulty: undefined,
      loopable: undefined,
      importance: "normal",
      urgency: "normal",
      body: "",
      location: { kind: "none" },
    })
    putSession({ ...INITIAL_SESSION_STATE, character: characterInfo() }, () => {})
    render(
      <TaskList
        tasks={known([
          task("Y-001", "doing", []),
          task("Y-002", "todo", ["Y-001"]),
          task("Y-003", "todo", []),
          task("Y-004", "hold", []),
          task("Y-005", "hold", ["Y-001"]),
        ])}
      />,
    )

    const runs = ["Y-001", "Y-002", "Y-003", "Y-004", "Y-005"].map((id) => {
      fireEvent.click(rowOf(id))
      const run = screen.getByRole("button", { name: "架空の精霊 に頼む" })
      return run.getAttribute("aria-disabled") === "true" ? run.getAttribute("title") : "押せる"
    })
    expect(runs).toEqual([
      "着手済みです",
      "待ちが終わると頼めます",
      "押せる",
      "押せる",
      "待ちが終わると頼めます",
    ])
  })

  it("サイドシートから保留を頼むと、判断を聞く旨を添えて送る", () => {
    const sent: unknown[] = []
    renderWithStore(
      <TaskList tasks={known([...TASKS, holdTask("X-003", [], [])])} />,
      collectInto(sent),
    )

    startFromSheet("X-003")
    fireEvent.click(screen.getByRole("button", { name: "頼む" }))

    expect(sent).toEqual([
      {
        procedure: "session.prompt",
        text: "タスク X-003 を進めて。このタスクは保留なので、着手の前に判断を聞いて。",
        images: [],
      },
    ])
  })

  it("ドラフトのサイドシートには「計画する」「却下する」が出て、頼む口は出ない", () => {
    putSession({ ...INITIAL_SESSION_STATE, character: characterInfo() }, () => {})
    render(<TaskList tasks={known([...TASKS, draftTask("X-004")])} />)

    fireEvent.click(rowOf("X-004"))
    expect(screen.getByRole("button", { name: "計画する" })).toBeDefined()
    expect(screen.getByRole("button", { name: "却下する" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "架空の精霊 に頼む" })).toBeNull()

    fireEvent.click(rowOf("X-002"))
    expect(screen.getByRole("button", { name: "架空の精霊 に頼む" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "計画する" })).toBeNull()
  })

  it("ドラフトの「計画する」は確認の「頼む」で計画の文面を送り、サイドシートを閉じる", () => {
    const sent: unknown[] = []
    renderWithStore(<TaskList tasks={known([...TASKS, draftTask("X-004")])} />, collectInto(sent))

    fireEvent.click(rowOf("X-004"))
    fireEvent.click(screen.getByRole("button", { name: "計画する" }))
    expect(confirmDialog()?.textContent).toContain("X-004 の計画を頼みますか")
    fireEvent.click(screen.getByRole("button", { name: "頼む" }))

    expect(sent).toEqual([
      {
        procedure: "session.prompt",
        text: "ドラフト X-004 を計画して。## 完了条件 と ## やること を書いて、着手できる todo にする。",
        images: [],
      },
    ])
    expect(screen.queryByRole("complementary")).toBeNull()
  })

  it("ドラフトの「却下する」は却下の文面を送り、キャンセルでは送らずサイドシートが残る", () => {
    const sent: unknown[] = []
    renderWithStore(<TaskList tasks={known([...TASKS, draftTask("X-004")])} />, collectInto(sent))

    fireEvent.click(rowOf("X-004"))
    fireEvent.click(screen.getByRole("button", { name: "却下する" }))
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }))
    expect(sent).toEqual([])
    expect(screen.getByRole("button", { name: "却下する" })).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "却下する" }))
    fireEvent.click(screen.getByRole("button", { name: "頼む" }))
    expect(sent).toEqual([
      {
        procedure: "session.prompt",
        text: "ドラフト X-004 を却下して。理由を ## 結果 に書いて、dropped で閉じる。",
        images: [],
      },
    ])
  })

  it("モーダルのドラフトには「計画する」「却下する」が出て、頼む口は出ない", () => {
    renderBoard(() => {}, [], [...TASKS, draftTask("X-004")])

    fireEvent.click(screen.getByRole("option", { name: /X-004/ }))

    expect(screen.getByRole("button", { name: "計画する" })).toBeDefined()
    expect(screen.getByRole("button", { name: "却下する" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "架空の精霊 に頼む" })).toBeNull()
  })

  it("モーダルのドラフトの「計画する」は確認の「頼む」で計画の文面を送り、モーダルを閉じる", () => {
    const sent: unknown[] = []
    const closed: string[] = []
    renderBoard(collectInto(sent), closed, [...TASKS, draftTask("X-004")])

    fireEvent.click(screen.getByRole("option", { name: /X-004/ }))
    fireEvent.click(screen.getByRole("button", { name: "計画する" }))
    expect(confirmDialog()?.textContent).toContain("X-004 の計画を頼みますか")
    fireEvent.click(screen.getByRole("button", { name: "頼む" }))

    expect(sent).toEqual([
      {
        procedure: "session.prompt",
        text: "ドラフト X-004 を計画して。## 完了条件 と ## やること を書いて、着手できる todo にする。",
        images: [],
      },
    ])
    expect(closed).toEqual(["モーダル"])
  })

  it("モーダルのドラフトの「却下する」は、キャンセルでは送らずモーダルが残り、頼むと却下の文面を送る", () => {
    const sent: unknown[] = []
    const closed: string[] = []
    renderBoard(collectInto(sent), closed, [...TASKS, draftTask("X-004")])

    fireEvent.click(screen.getByRole("option", { name: /X-004/ }))
    fireEvent.click(screen.getByRole("button", { name: "却下する" }))
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }))
    expect(sent).toEqual([])
    expect(closed).toEqual([])
    expect(confirmDialog()).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "却下する" }))
    fireEvent.click(screen.getByRole("button", { name: "頼む" }))
    expect(sent).toEqual([
      {
        procedure: "session.prompt",
        text: "ドラフト X-004 を却下して。理由を ## 結果 に書いて、dropped で閉じる。",
        images: [],
      },
    ])
  })

  it("モーダルからは依存の済んだ保留も頼め、判断を聞かれることを確認に添える", () => {
    const sent: unknown[] = []
    renderBoard(collectInto(sent), [], [...TASKS, holdTask("X-003", ["X-001"], [])])

    openRunConfirm("X-003")
    expect(confirmDialog()?.textContent).toContain("着手の前に判断を聞いて")
    fireEvent.click(screen.getByRole("button", { name: "頼む" }))

    expect(sent).toEqual([
      {
        procedure: "session.prompt",
        text: "タスク X-003 を進めて。このタスクは保留なので、着手の前に判断を聞いて。",
        images: [],
      },
    ])
  })

  it("保留でないタスクには保留の説明を添えず、固定の文面をタスクIDにして送る", () => {
    const sent: unknown[] = []
    renderBoard(collectInto(sent))

    openRunConfirm("X-002")
    expect(confirmDialog()?.textContent).not.toContain("判断を聞いて")
    fireEvent.click(screen.getByRole("button", { name: "頼む" }))

    expect(sent).toEqual([
      {
        procedure: "session.prompt",
        text: "タスク X-002 を進めて。",
        images: [],
      },
    ])
  })

  it("起動スキルを設定していれば、確認に出る文面も送る文面も「/スキル名 ID」になる", () => {
    const sent: unknown[] = []
    renderBoard(collectInto(sent), [], TASKS, launchSkillState("/next-task"))

    openRunConfirm("X-002")
    expect(confirmDialog()?.textContent).toContain("/next-task X-002")
    fireEvent.click(screen.getByRole("button", { name: "頼む" }))

    expect(sent).toEqual([{ procedure: "session.prompt", text: "/next-task X-002", images: [] }])
  })

  it("起動スキルを設定していても、ドラフトの計画の文面は変わらない", () => {
    const sent: unknown[] = []
    renderBoard(collectInto(sent), [], [draftTask("X-004")], launchSkillState("next-task"))

    fireEvent.click(screen.getByRole("option", { name: /X-004/ }))
    fireEvent.click(screen.getByRole("button", { name: "計画する" }))
    fireEvent.click(screen.getByRole("button", { name: "頼む" }))

    expect(JSON.stringify(sent)).toContain("ドラフト X-004 を計画して")
  })

  it("モーダルでも待ちの残る保留は頼めない", () => {
    renderBoard(() => {}, [], [...TASKS, holdTask("X-003", ["X-002"], ["X-002"])])

    fireEvent.click(screen.getByRole("option", { name: /X-003/ }))

    const run = screen.getByRole("button", { name: "架空の精霊 に頼む" })
    expect(run.getAttribute("aria-disabled")).toBe("true")
    expect(run.getAttribute("title")).toBe("待ちが終わると頼めます")
  })
})

function holdTask(
  id: string,
  dependencies: readonly string[],
  waitingFor: readonly string[],
): TaskSummaryItem {
  return {
    id,
    summary: `架空の保留 ${id}`,
    status: taskStatusOfWord("hold"),
    dependencies,
    waitingFor,
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    importance: "normal",
    urgency: "normal",
    body: "",
    location: { kind: "none" },
  }
}

function draftTask(id: string): TaskSummaryItem {
  return {
    ...holdTask(id, [], []),
    summary: `架空のドラフト ${id}`,
    status: taskStatusOfWord("draft"),
  }
}

/** 区画の一覧の行（カード）のボタン。 */
function rowOf(taskId: string): HTMLElement {
  const element = document.getElementById(`task-row-${taskId}`)
  if (element === null) {
    throw new Error(`${taskId} の行が無い`)
  }
  return element
}

/** 区画の一覧で `taskId` の行を押してサイドシートを開き、頼む口を押す。 */
function startFromSheet(taskId: string): void {
  fireEvent.click(rowOf(taskId))
  fireEvent.click(screen.getByRole("button", { name: "架空の精霊 に頼む" }))
}

/** モーダルの一覧で `taskId` の行を選び、操作の帯の頼む口を押す。 */
function openRunConfirm(taskId: string): void {
  fireEvent.click(screen.getByRole("option", { name: new RegExp(taskId) }))
  fireEvent.click(screen.getByRole("button", { name: "架空の精霊 に頼む" }))
}
