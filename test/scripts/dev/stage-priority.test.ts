import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { delimiter, join } from "node:path"

import { describe, expect, test } from "vitest"

import { findPriorityTool, stageCommand } from "../../../scripts/dev/lib/stage-priority.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

describe("findPriorityTool", () => {
  const tempDir = useTempDir("stage-priority")

  function directoryWith(name: string, mode: number): string {
    const directory = join(tempDir(), name)
    mkdirSync(directory)
    const file = join(directory, "taskpolicy")
    writeFileSync(file, "#!/bin/sh\n")
    chmodSync(file, mode)
    return directory
  }

  test("PATH のどこかに実行できる taskpolicy があれば taskpolicy を選ぶ", () => {
    const empty = join(tempDir(), "empty")
    mkdirSync(empty)
    const withTool = directoryWith("bin", 0o755)

    expect(findPriorityTool([empty, withTool].join(delimiter))).toBe("taskpolicy")
  })

  test("taskpolicy が無いか実行できなければ nice を選ぶ", () => {
    const notExecutable = directoryWith("bin", 0o644)

    expect(findPriorityTool(notExecutable)).toBe("nice")
    expect(findPriorityTool("")).toBe("nice")
  })
})

describe("stageCommand", () => {
  test("taskpolicy があれば、E2E 以外の段は utility の clamp で起こす", () => {
    expect(stageCommand("test", ["--reporter=default"], "taskpolicy")).toEqual({
      command: "taskpolicy",
      args: ["-c", "utility", "pnpm", "run", "test", "--reporter=default"],
    })
  })

  test("E2E の段は taskpolicy があっても nice で起こす", () => {
    expect(stageCommand("test:e2e", ["--bail=3"], "taskpolicy")).toEqual({
      command: "nice",
      args: ["pnpm", "run", "test:e2e", "--bail=3"],
    })
  })

  test("taskpolicy が無ければどの段も nice で起こす", () => {
    expect(stageCommand("typecheck", [], "nice")).toEqual({
      command: "nice",
      args: ["pnpm", "run", "typecheck"],
    })
  })
})
