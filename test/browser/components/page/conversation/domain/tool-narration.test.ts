import { describe, expect, it } from "vitest"

import { narrateToolUse } from "../../../../../../src/browser/components/page/conversation/domain/tool-narration.ts"

describe("narrateToolUse", () => {
  it.each([
    ["Read", { file_path: "/tmp/dir/a.tsx" }, "a.tsxを読んでいる"],
    ["Edit", { file_path: "/tmp/dir/a.tsx" }, "a.tsxを直している"],
    ["Write", { file_path: "/tmp/dir/a.tsx" }, "a.tsxを書いている"],
    ["Bash", { command: "echo hi" }, "echo hiを走らせている"],
    ["Grep", { pattern: "foo" }, "fooを探している"],
    ["Glob", { pattern: "*.ts" }, "*.tsを探している"],
    ["WebFetch", { url: "https://example.test" }, "https://example.testを調べている"],
    ["WebSearch", { query: "架空" }, "架空を調べている"],
    ["Agent", { description: "架空の調べもの" }, "架空の調べものを任せている"],
    ["Task", { description: "架空の調べもの" }, "架空の調べものを任せている"],
  ])("%s の文を作る", (name, input, expected) => {
    expect(narrateToolUse(name, input)).toBe(expected)
  })

  it("パスは末尾の名前だけにする", () => {
    expect(narrateToolUse("Read", { file_path: "/secret/deep/x.ts" })).toBe("x.tsを読んでいる")
  })

  it("長い入力を切り詰める", () => {
    const sentence = narrateToolUse("Bash", { command: "a".repeat(300) })
    expect(sentence).toBe(`${"a".repeat(120)}…を走らせている`)
  })

  it("複数行を1行に畳む", () => {
    expect(narrateToolUse("Bash", { command: "echo a\n  echo b" })).toBe(
      "echo a echo bを走らせている",
    )
  })

  it("表に無い道具は undefined", () => {
    expect(narrateToolUse("Unknown", { command: "x" })).toBeUndefined()
  })

  it("欄が無い入力・形でない入力は undefined", () => {
    expect(narrateToolUse("Bash", {})).toBeUndefined()
    expect(narrateToolUse("Bash", "x")).toBeUndefined()
  })
})
