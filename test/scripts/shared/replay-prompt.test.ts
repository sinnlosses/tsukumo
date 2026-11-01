import { describe, expect, test } from "vitest"

import { buildReplayPrompt, prependReplayBrief } from "../../../scripts/shared/replay-prompt.ts"

describe("buildReplayPrompt", () => {
  test("課題の本文を含み、検証コマンドは含まない", () => {
    const prompt = buildReplayPrompt("本文です")

    expect(prompt).toContain("本文です")
    expect(prompt).not.toContain("vitest")
  })

  test("課題の文面だけで、先頭は実装の依頼", () => {
    expect(buildReplayPrompt("本文です")).toBe(
      [
        "次の課題を、いまの作業ツリーで実装してください。コミットはしないでください。",
        "完了の判定は別の検査が行います。課題の完了条件を満たすことを目指してください。",
        "",
        "本文です",
      ].join("\n"),
    )
  })
})

describe("prependReplayBrief", () => {
  test("先頭に決まりの本文が入り、課題の本文も残る", () => {
    const body = buildReplayPrompt("本文です")
    const prompt = prependReplayBrief("決まりの本文", body)

    expect(prompt.startsWith("次の決まりを最初に読んで従ってください。")).toBe(true)
    expect(prompt.indexOf("決まりの本文")).toBeLessThan(prompt.indexOf("本文です"))
    expect(prompt).toContain(body)
  })
})
