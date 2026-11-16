import { describe, expect, it } from "vitest"

import { codeSpanParts } from "../../../../../src/browser/domain/code-span.ts"
import { matchesQuery } from "../../../../../src/browser/features/task-board/domain/task-board-filter.ts"
import {
  isSearching,
  moveActiveIndex,
  searchStages,
  titleMatchParts,
} from "../../../../../src/browser/features/task-board/domain/task-search.ts"
import { stageTasks } from "../../../../../src/browser/features/task-board/domain/task-stage.ts"
import type { TaskSummaryItem } from "../../../../../src/shared/repository/task-summary.ts"
import { taskStatusOfWord } from "../../../../fixture/session-state.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物のタスクファイルは使わない）。

function taskOf(id: string, status: string, summary: string, body = ""): TaskSummaryItem {
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
    body,
    location: { kind: "none" },
  }
}

const ITEMS = [
  taskOf("X-001", "doing", "青い箱を作る"),
  taskOf("X-002", "todo", "赤い箱を直す", "本文に Apple がある"),
  taskOf("X-003", "done", "青い鍵を返す"),
  taskOf("X-010", "done", "青い窓を拭く"),
  taskOf("X-004", "draft", "緑の庭"),
]

function idsOf(groups: ReturnType<typeof searchStages>): readonly string[] {
  return groups.flatMap((group) => group.tasks.map((task) => task.id))
}

describe("searchStages", () => {
  it("語に当たるタスクが全部残り、当たらないものは1つも残らない", () => {
    for (const query of ["青", "apple", "X-00", "箱", "なし"]) {
      const expected = ITEMS.filter((task) => matchesQuery(task, query)).map((task) => task.id)
      expect(idsOf(searchStages(ITEMS, query)).toSorted()).toEqual(expected.toSorted())
    }
  })

  it("当たりの無い段は返らない", () => {
    expect(searchStages(ITEMS, "青").map((group) => group.stage)).toEqual(["now", "done"])
  })

  it("空の語・空白だけの語は絞らない", () => {
    expect(searchStages(ITEMS, "")).toEqual(stageTasks(ITEMS))
    expect(searchStages(ITEMS, "  ")).toEqual(stageTasks(ITEMS))
  })

  it("済みの段の番号の降順は絞っても保たれる", () => {
    expect(idsOf(searchStages(ITEMS, "青").filter((group) => group.stage === "done"))).toEqual([
      "X-010",
      "X-003",
    ])
  })
})

describe("isSearching", () => {
  it("空白だけは絞っていない", () => {
    expect([isSearching(""), isSearching(" "), isSearching(" a ")]).toEqual([false, false, true])
  })
})

describe("titleMatchParts", () => {
  it("当たった範囲だけ matched で、つなぎ直すと元の題に戻る", () => {
    const parts = titleMatchParts(codeSpanParts("a`bcd`ef"), "CDE")
    expect(parts.map((part) => part.text).join("")).toBe("abcdef")
    expect(parts.filter((part) => part.matched).map((part) => part.text)).toEqual(["cd", "e"])
    expect(parts.find((part) => part.text === "cd")?.kind).toBe("code")
  })

  it("空の語は当たりなしの1片ずつ", () => {
    expect(titleMatchParts(codeSpanParts("a`b`"), " ")).toEqual([
      { kind: "text", text: "a", matched: false },
      { kind: "code", text: "b", matched: false },
    ])
  })

  it("同じ語が複数回当たる", () => {
    const parts = titleMatchParts(codeSpanParts("abab"), "ab")
    expect(parts).toEqual([{ kind: "text", text: "abab", matched: true }])
  })
})

describe("moveActiveIndex", () => {
  it("端で止まる", () => {
    expect(moveActiveIndex(0, -1, 3)).toBe(0)
    expect(moveActiveIndex(2, 1, 3)).toBe(2)
    expect(moveActiveIndex(1, 1, 3)).toBe(2)
  })

  it("当たりが0件なら -1、範囲外からの ↓ は 0", () => {
    expect(moveActiveIndex(0, 1, 0)).toBe(-1)
    expect(moveActiveIndex(-1, 1, 3)).toBe(0)
  })
})
