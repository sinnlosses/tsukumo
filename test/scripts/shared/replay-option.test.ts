import { describe, expect, test } from "vitest"

import { parseReplayOptions } from "../../../scripts/shared/replay-option.ts"

describe("parseReplayOptions", () => {
  test("--tasks をカンマで割り、--k の既定は2", () => {
    expect(parseReplayOptions(["--tasks", "a-1, a-2"])).toEqual({ tasks: ["a-1", "a-2"], k: 2 })
  })

  test("pnpm run が渡す先頭の -- を読み飛ばす", () => {
    expect(parseReplayOptions(["--", "--tasks", "a-1", "--k", "1"])).toEqual({
      tasks: ["a-1"],
      k: 1,
    })
  })

  test("--k を読む", () => {
    expect(parseReplayOptions(["--tasks", "a-1", "--k", "1"])).toEqual({ tasks: ["a-1"], k: 1 })
  })

  test.each([[[]], [["--tasks", ""]], [["--tasks", "a-1", "--k", "0"]], [["--foo"]]])(
    "%j は崩れた引数として invalid に畳む",
    (args) => {
      expect(parseReplayOptions(args)).toBe("invalid")
    },
  )
})
