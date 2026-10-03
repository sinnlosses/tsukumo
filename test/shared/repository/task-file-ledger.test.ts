import { describe, expect, it } from "vitest"

import {
  isTaskFormatSwitchChange,
  isTaskLedgerPath,
  taskFileIdOfPath,
} from "../../../src/shared/repository/task-file-ledger.ts"

describe("taskFileIdOfPath", () => {
  it("develop/task/T-xxx.md から ID を取る", () => {
    expect(taskFileIdOfPath("develop/task/T-561.md")).toBe("T-561")
  })

  it("当てはまらないパスは undefined", () => {
    expect(taskFileIdOfPath("develop/tasks.json")).toBeUndefined()
    expect(taskFileIdOfPath("docs/history/tasks.md")).toBeUndefined()
  })
})

describe("isTaskLedgerPath", () => {
  it("タスクファイル・旧形式の一覧・アーカイブ・進捗の帳面は帳面のパス", () => {
    expect(isTaskLedgerPath("develop/task/T-001.md")).toBe(true)
    expect(isTaskLedgerPath("develop/tasks.json")).toBe(true)
    expect(isTaskLedgerPath("develop/progress.md")).toBe(true)
    expect(isTaskLedgerPath("docs/history/tasks.md")).toBe(true)
    expect(isTaskLedgerPath("docs/history/progress.md")).toBe(true)
  })

  it("それ以外のパスは帳面のパスでない", () => {
    expect(isTaskLedgerPath("src/index.ts")).toBe(false)
    expect(isTaskLedgerPath("develop/direction.md")).toBe(false)
  })
})

describe("isTaskFormatSwitchChange", () => {
  it("旧形式の一覧の削除だけが形式の切り替え", () => {
    expect(isTaskFormatSwitchChange({ status: "D", path: "develop/tasks.json" })).toBe(true)
    expect(isTaskFormatSwitchChange({ status: "M", path: "develop/tasks.json" })).toBe(false)
    expect(isTaskFormatSwitchChange({ status: "D", path: "develop/task/T-001.md" })).toBe(false)
  })
})
