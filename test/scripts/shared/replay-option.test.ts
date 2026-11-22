import { describe, expect, test } from "vitest"

import {
  parseReplayCompareOptions,
  parseReplayOptions,
} from "../../../scripts/shared/replay-option.ts"

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

  test("--out を読み、省けば未指定になる", () => {
    expect(parseReplayOptions(["--tasks", "a-1", "--out", "/tmp/r.json"])).toHaveProperty(
      "out",
      "/tmp/r.json",
    )
    expect(parseReplayOptions(["--tasks", "a-1"])).toHaveProperty("out", undefined)
  })

  test.each([
    [[]],
    [["--tasks", ""]],
    [["--tasks", "a-1", "--k", "0"]],
    [["--tasks", "a-1", "--brief", ""]],
    [["--tasks", "a-1", "--out", ""]],
    [["--foo"]],
  ])("%j は崩れた引数として invalid に畳む", (args) => {
    expect(parseReplayOptions(args)).toBe("invalid")
  })
})

describe("parseReplayCompareOptions", () => {
  test("--baseline と --candidate をカンマで割り、先頭の -- を読み飛ばす", () => {
    expect(
      parseReplayCompareOptions(["--", "--baseline", "a.json, b.json", "--candidate", "c.json"]),
    ).toEqual({ baseline: ["a.json", "b.json"], candidate: ["c.json"] })
  })

  test.each([
    [[]],
    [["--baseline", "a.json"]],
    [["--candidate", "c.json"]],
    [["--baseline", "", "--candidate", "c.json"]],
    [["--baseline", "a.json", "--candidate", "c.json", "--foo"]],
  ])("%j は崩れた引数として invalid に畳む", (args) => {
    expect(parseReplayCompareOptions(args)).toBe("invalid")
  })
})
