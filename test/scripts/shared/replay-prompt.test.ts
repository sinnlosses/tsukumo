import { describe, expect, test } from "vitest"

import { buildReplayPrompt } from "../../../scripts/shared/replay-prompt.ts"

describe("buildReplayPrompt", () => {
  test("課題の本文を含み、検証コマンドは含まない", () => {
    const prompt = buildReplayPrompt("本文です", undefined)

    expect(prompt).toContain("本文です")
    expect(prompt).not.toContain("vitest")
  })

  test("brief が無ければ課題の文面だけで、先頭は実装の依頼", () => {
    expect(buildReplayPrompt("本文です", undefined)).toBe(
      [
        "次の課題を、いまの作業ツリーで実装してください。コミットはしないでください。",
        "完了の判定は別の検査が行います。課題の完了条件を満たすことを目指してください。",
        "",
        "本文です",
      ].join("\n"),
    )
  })

  test("brief があれば先頭に決まりの本文が入り、課題の本文も残る", () => {
    const prompt = buildReplayPrompt("本文です", "決まりの本文")

    expect(prompt.startsWith("次の決まりを最初に読んで従ってください。")).toBe(true)
    expect(prompt.indexOf("決まりの本文")).toBeLessThan(prompt.indexOf("本文です"))
    expect(prompt).toContain(buildReplayPrompt("本文です", undefined))
  })
})
