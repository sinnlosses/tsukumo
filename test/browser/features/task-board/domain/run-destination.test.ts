import { describe, expect, it } from "vitest"

import { runDestinationOf } from "../../../../../src/browser/features/task-board/domain/run-destination.ts"

const COMMANDS = [
  { name: "clear", description: undefined },
  { name: "next-task", description: undefined },
]

describe("runDestinationOf", () => {
  it("/ で始まらない文面は unknown", () => {
    expect(runDestinationOf("次を進めて {id}", COMMANDS)).toEqual({ kind: "unknown" })
  })
})
