import { describe, expect, test } from "vitest"

import { buildReplayPrompt } from "../../../scripts/shared/replay-prompt.ts"

describe("buildReplayPrompt", () => {
  test("課題の本文を含み、検証コマンドは含まない", () => {
    const prompt = buildReplayPrompt("本文です")

    expect(prompt).toContain("本文です")
    expect(prompt).not.toContain("vitest")
  })
})
