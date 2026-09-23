import { describe, expect, it } from "bun:test"

import { summarizeToolInput, toolInputText } from "../../../src/browser/lib/tool-summary.ts"

describe("summarizeToolInput", () => {
  it("Bash はコマンドを出す", () => {
    expect(summarizeToolInput("Bash", { command: "echo dummy" })).toBe("echo dummy")
  })

  it("Edit はファイルパスを出す", () => {
    expect(
      summarizeToolInput("Edit", {
        file_path: "/tmp/dummy.txt",
        old_string: "a",
        new_string: "b",
      }),
    ).toBe("/tmp/dummy.txt")
  })

  it("未知のツールは入力の最初の文字列値を出す", () => {
    expect(summarizeToolInput("MysteryTool", { note: "ダミーの説明", count: 3 })).toBe(
      "ダミーの説明",
    )
  })

  it("120文字を超えたら切り詰める（入力の全文は出さない）", () => {
    const long = "a".repeat(200)

    const summary = summarizeToolInput("Bash", { command: long })

    expect(summary.length).toBeLessThan(long.length)
    expect(summary).toEndWith("…")
  })

  it("要約に使わないフィールドの値は混ざらない", () => {
    const summary = summarizeToolInput("Bash", { command: "echo dummy", secret: "内緒" })

    expect(summary).not.toContain("内緒")
  })

  it("入力がオブジェクトの形でないときは空文字", () => {
    expect(summarizeToolInput("Bash", "echo dummy")).toBe("")
    expect(summarizeToolInput("Bash", undefined)).toBe("")
  })
})

describe("toolInputText（同じ欄を切り詰めずに返す。帯の「実行中の手順の全文」用）", () => {
  it("120文字を超えても切り詰めない（summarizeToolInput とは違う）", () => {
    const long = "a".repeat(200)

    expect(toolInputText("Bash", { command: long })).toBe(long)
  })

  it("summarizeToolInput と同じ欄を読む（Edit は file_path）", () => {
    expect(
      toolInputText("Edit", { file_path: "/tmp/dummy.txt", old_string: "a", new_string: "b" }),
    ).toBe("/tmp/dummy.txt")
  })

  it("入力がオブジェクトの形でないときは空文字", () => {
    expect(toolInputText("Bash", "echo dummy")).toBe("")
  })
})
