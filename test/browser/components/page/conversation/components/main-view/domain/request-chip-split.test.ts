import { describe, expect, it } from "vitest"

import { requestChips } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/request-chip-split.ts"
import type {
  TaskSummaryItem,
  TaskSummaryResult,
} from "../../../../../../../../src/shared/repository/task-summary.ts"

// 依頼とタスクはすべて手で書いた架空のもの（実物の会話は使わない）。

function item(id: string, summary: string): TaskSummaryItem {
  return {
    id,
    summary,
    status: { kind: "known", status: "todo" },
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    importance: "normal",
    urgency: "normal",
    body: "",
    location: { kind: "none" },
  }
}

const KNOWN: TaskSummaryResult = {
  kind: "known",
  items: [item("TK-2100", "架空の題"), item("TK-7", "別の架空の題")],
  omittedClosedCount: 0,
}

describe("requestChips", () => {
  it("コマンドとタスクIDだけの依頼は、札だけで地の文が空", () => {
    expect(requestChips("/demo-plugin:next-task TK-2100", KNOWN)).toEqual({
      command: "/next-task",
      tasks: [{ id: "TK-2100", summary: "架空の題" }],
      prose: "",
    })
  })

  it("名前空間の無いコマンドはそのまま出す", () => {
    expect(requestChips("/loop 5m 様子を見て", undefined)).toEqual({
      command: "/loop",
      tasks: [],
      prose: "5m 様子を見て",
    })
  })

  it("小文字の ID も一覧の字で当て、地の文から抜く", () => {
    const chips = requestChips("tk-2100 を進めて、tk-7 は待つ", KNOWN)
    expect(chips.tasks.map((task) => task.id)).toEqual(["TK-2100", "TK-7"])
    expect(chips.prose).toBe("を進めて、 は待つ")
  })

  it("一覧に無い ID らしい語は札にせず、地の文に残す", () => {
    expect(requestChips("TK-999 を見て", KNOWN)).toEqual({
      command: undefined,
      tasks: [],
      prose: "TK-999 を見て",
    })
  })

  it("一覧が known でないときはタスクの札を出さない", () => {
    for (const tasks of [{ kind: "loading" }, { kind: "unknown" }, { kind: "no-beads" }] as const) {
      const chips = requestChips("TK-2100 を進めて", tasks)
      expect(chips.tasks).toEqual([])
      expect(chips.prose).toBe("TK-2100 を進めて")
    }
  })

  it("先頭が / でないときはコマンドの札にしない", () => {
    expect(requestChips("ここで /next-task を使う", KNOWN).command).toBeUndefined()
  })

  it("引用の記号は落とし、複数行の地の文は行を保つ", () => {
    expect(requestChips("> 1行目\n> 2行目", KNOWN).prose).toBe("1行目\n2行目")
  })
})
