import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  loadTaskBoardListWidth,
  saveTaskBoardListWidth,
  taskBoardListWidthFromRatio,
} from "../../../../../src/browser/features/task-board/domain/task-board-list-width.ts"

const STORAGE_KEY = "tsukumo-task-board-list-width:v2"
const OLD_STORAGE_KEY = "tsukumo-task-board-list-width:v1"

const TASK_BOARD_LIST_WIDTH_MIN_PX = 480
const DETAIL_MIN_PX = 360

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(OLD_STORAGE_KEY)
})

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(OLD_STORAGE_KEY)
})

describe("loadTaskBoardListWidth", () => {
  it("保存が無いときは undefined（CSS の既定に任せる）", () => {
    expect(loadTaskBoardListWidth()).toBeUndefined()
  })

  it("保存した幅をそのまま読む", () => {
    saveTaskBoardListWidth(640)

    expect(loadTaskBoardListWidth()).toBe(640)
  })

  it("数でない・最小幅を割る保存値は undefined に落ちる", () => {
    for (const raw of ["wide", "", String(TASK_BOARD_LIST_WIDTH_MIN_PX - 1)]) {
      localStorage.setItem(STORAGE_KEY, raw)
      expect(loadTaskBoardListWidth()).toBeUndefined()
    }
  })

  it("前の鍵（v1）の値は読まず、消しもしない", () => {
    localStorage.setItem(OLD_STORAGE_KEY, "520")

    expect(loadTaskBoardListWidth()).toBeUndefined()
    saveTaskBoardListWidth(640)
    expect(localStorage.getItem(OLD_STORAGE_KEY)).toBe("520")
  })
})

describe("taskBoardListWidthFromRatio", () => {
  const rect = (width: number): DOMRect => new DOMRect(0, 0, width, 600)

  it("器の幅に比率を掛けた px にする", () => {
    expect(taskBoardListWidthFromRatio(0.6, rect(1200))).toBe(720)
  })

  it("表は最小幅より、詳細は 360px より詰めない", () => {
    expect(taskBoardListWidthFromRatio(0, rect(1200))).toBe(TASK_BOARD_LIST_WIDTH_MIN_PX)
    expect(taskBoardListWidthFromRatio(1, rect(1200))).toBe(1200 - DETAIL_MIN_PX)
  })

  it("詳細に 360px を残すと表が最小幅を割る狭い器では、表の最小幅", () => {
    expect(taskBoardListWidthFromRatio(0.9, rect(700))).toBe(TASK_BOARD_LIST_WIDTH_MIN_PX)
  })
})
