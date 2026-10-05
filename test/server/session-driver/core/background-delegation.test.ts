import { describe, expect, it } from "vitest"

import { pinToBackground } from "../../../../src/server/session-driver/core/background-delegation.ts"

describe("pinToBackground", () => {
  it("run_in_background の無いメインの Agent 呼び出しを true にし、prompt は変えない", () => {
    expect(pinToBackground("Agent", { description: "調べる", prompt: "手順" }, false)).toEqual({
      kind: "rewrite",
      input: { description: "調べる", prompt: "手順", run_in_background: true },
    })
  })

  it("false が明示されていても true にする", () => {
    expect(pinToBackground("Agent", { prompt: "手順", run_in_background: false }, false)).toEqual({
      kind: "rewrite",
      input: { prompt: "手順", run_in_background: true },
    })
  })

  it.each([
    ["すでに true", "Agent", { prompt: "手順", run_in_background: true }, false],
    ["Agent 以外のツール", "Bash", { command: "ls" }, false],
    ["サブエージェント内の呼び出し", "Agent", { prompt: "手順" }, true],
    ["入力がオブジェクトでない", "Agent", "文字列", false],
  ])("%s は書き換えない", (_name, toolName, toolInput, inSubagent) => {
    expect(pinToBackground(toolName, toolInput, inSubagent)).toEqual({ kind: "keep" })
  })
})
