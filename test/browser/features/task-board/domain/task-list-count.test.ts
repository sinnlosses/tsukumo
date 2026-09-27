import { describe, expect, it } from "vitest"

import { taskListFilterLabel } from "../../../../../src/browser/features/task-board/domain/task-list-count.ts"

describe("taskListFilterLabel", () => {
  it("チップと同じ文言を返す", () => {
    expect(taskListFilterLabel("doing")).toBe("進行中")
    expect(taskListFilterLabel("todo")).toBe("未着手")
    expect(taskListFilterLabel("done")).toBe("完了")
  })
})
