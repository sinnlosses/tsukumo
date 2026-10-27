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

  test("--brief を読み、省けば未指定になる", () => {
    expect(parseReplayOptions(["--tasks", "a-1", "--brief", "/tmp/b.md"])).toHaveProperty(
      "brief",
      "/tmp/b.md",
    )
    expect(parseReplayOptions(["--tasks", "a-1"])).toHaveProperty("brief", undefined)
  })

  test.each([
    [[]],
    [["--tasks", ""]],
    [["--tasks", "a-1", "--k", "0"]],
    [["--tasks", "a-1", "--brief", ""]],
    [["--foo"]],
  ])("%j は崩れた引数として invalid に畳む", (args) => {
    expect(parseReplayOptions(args)).toBe("invalid")
  })
})
