import { describe, expect, it } from "vitest"

import { requestPromptOf } from "../../../src/shared/repository/task-run-prompt.ts"

describe("requestPromptOf", () => {
  it("着手の文面は、保留のときだけ判断を聞く旨を末尾に添える", () => {
    expect(requestPromptOf("X-1", { kind: "start", held: false })).toBe(
      "タスク X-1 を進めて（bd show X-1 で読める）。",
    )
    expect(requestPromptOf("X-1", { kind: "start", held: true })).toBe(
      "タスク X-1 を進めて（bd show X-1 で読める）。このタスクは保留なので、着手の前に判断を聞いて。",
    )
  })

  it("ドラフトの計画と却下は、それぞれ固定の文面になる", () => {
    expect(requestPromptOf("X-2", { kind: "plan" })).toBe(
      "ドラフト X-2 を計画して（bd show X-2 で読める）。## 完了条件 と ## やること を書いて、着手できる todo にする。",
    )
    expect(requestPromptOf("X-2", { kind: "drop" })).toBe(
      "ドラフト X-2 を却下して（bd show X-2 で読める）。理由を ## 結果 に書いて、dropped で閉じる。",
    )
  })
})
