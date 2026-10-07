import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  loadTaskBoardListWidth,
  saveTaskBoardListWidth,
  taskBoardListWidthFromRatio,
} from "../../../../../src/browser/features/task-board/domain/task-board-list-width.ts"

const STORAGE_KEY = "tsukumo-task-board-list-width:v1"

const TASK_BOARD_LIST_WIDTH_MIN_PX = 300
const TASK_BOARD_LIST_WIDTH_MAX_PX = 760

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

describe("loadTaskBoardListWidth", () => {
  it("保存が無いときは undefined（CSS の既定に任せる）", () => {
    expect(loadTaskBoardListWidth()).toBeUndefined()
  })

  it("保存した幅をそのまま読む", () => {
    saveTaskBoardListWidth(520)

    expect(loadTaskBoardListWidth()).toBe(520)
  })

  it("数でない・可動域の外の保存値は undefined に落ちる", () => {
    for (const raw of ["wide", "", String(TASK_BOARD_LIST_WIDTH_MIN_PX - 1)]) {
      localStorage.setItem(STORAGE_KEY, raw)
      expect(loadTaskBoardListWidth()).toBeUndefined()
    }
  })
})

describe("taskBoardListWidthFromRatio", () => {
  const rect = (width: number): DOMRect => new DOMRect(0, 0, width, 600)

  it("器の幅に比率を掛けた px にする", () => {
    expect(taskBoardListWidthFromRatio(0.4, rect(1300))).toBe(520)
  })

  it("可動域の外は端に寄せる", () => {
    expect(taskBoardListWidthFromRatio(0, rect(1300))).toBe(TASK_BOARD_LIST_WIDTH_MIN_PX)
    expect(taskBoardListWidthFromRatio(1, rect(1300))).toBe(TASK_BOARD_LIST_WIDTH_MAX_PX)
  })

  it("器が狭いときは詳細に 360px を残す", () => {
    expect(taskBoardListWidthFromRatio(0.9, rect(900))).toBe(540)
  })
})
