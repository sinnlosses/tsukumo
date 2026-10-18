import { describe, expect, it } from "vitest"

import { rewriteBashCommand } from "../../../../src/server/session-driver/core/bash-command-rewrite.ts"

const shorten = (command: string): Promise<string | undefined> => Promise.resolve(`rtk ${command}`)

describe("rewriteBashCommand", () => {
  it("Bash の command だけを差し替え、ほかのキーは変えない", async () => {
    expect(
      await rewriteBashCommand("Bash", { command: "git status", description: "状態" }, shorten),
    ).toEqual({ command: "rtk git status", description: "状態" })
  })

  it.each([
    ["Bash 以外のツール", "Read", { command: "git status" }],
    ["入力がオブジェクトでない", "Bash", "git status"],
    ["command が文字列でない", "Bash", { command: 1 }],
    ["command が空白だけ", "Bash", { command: "  " }],
  ])("%s は rewrite を呼ばず書き換えない", async (_name, toolName, toolInput) => {
    let called = false
    const result = await rewriteBashCommand(toolName, toolInput, (command) => {
      called = true
      return shorten(command)
    })
    expect(result).toBeUndefined()
    expect(called).toBe(false)
  })

  it("rewrite が undefined を返したときと、同じ文字列を返したときは書き換えない", async () => {
    expect(
      await rewriteBashCommand("Bash", { command: "ls" }, () => Promise.resolve(undefined)),
    ).toBeUndefined()
    expect(
      await rewriteBashCommand("Bash", { command: "ls" }, () => Promise.resolve("ls")),
    ).toBeUndefined()
  })
})
