import { describe, expect, it } from "vitest"

import { isTaskLedgerPath } from "../../../src/shared/repository/task-file-ledger.ts"

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
