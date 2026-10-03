import { describe, expect, it } from "vitest"

import { runDestinationOf } from "../../../../../src/browser/features/task-board/domain/run-destination.ts"

const COMMANDS = [
  { name: "clear", description: undefined },
  { name: "next-task", description: undefined },
]

describe("runDestinationOf", () => {
  it("文面の最初の語のコマンドが一覧に在れば present", () => {
    expect(runDestinationOf("/next-task {id}", COMMANDS)).toEqual({ kind: "present" })
  })

  it("一覧に無ければ missing（コマンド名を添える）", () => {
    expect(runDestinationOf("/work {id}", COMMANDS)).toEqual({ kind: "missing", command: "work" })
  })

  it("一覧がまだ届いていない・文面が / で始まらないときは判定しない", () => {
    expect(runDestinationOf("/work {id}", [])).toEqual({ kind: "unknown" })
    expect(runDestinationOf("次を進めて {id}", COMMANDS)).toEqual({ kind: "unknown" })
  })
})
