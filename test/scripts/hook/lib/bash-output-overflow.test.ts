// Bash の結果が既定の行数を超えたかと、包み直せる形かの判定を、入力の文字列だけで確かめる(hook は起こさない)。

import { describe, expect, test } from "vitest"

import { findBashOutputOverflow } from "../../../../scripts/hook/lib/bash-output-overflow.ts"
import { bashCall } from "../../../fixture/bash-hook-call.ts"

const LINE_LIMIT = 200

function linesOf(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index}`).join("\n")
}

describe("findBashOutputOverflow", () => {
  test("既定の行数ちょうどは超えていない", () => {
    expect(findBashOutputOverflow(bashCall("ls"), linesOf(LINE_LIMIT))).toBeUndefined()
  })

  test("末尾の改行は1行に数えない", () => {
    const output = `${linesOf(LINE_LIMIT)}\n`
    expect(findBashOutputOverflow(bashCall("ls"), output)).toBeUndefined()
  })

  test("超えた分の行数を切ったであろう行数にする", () => {
    expect(findBashOutputOverflow(bashCall("ls -R"), linesOf(LINE_LIMIT + 35))).toEqual({
      hook: "truncate-bash-output",
      rule: "wrappable",
      cutLines: 35,
    })
  })

  test.each([
    ["パイプ", "git log | head -500", "wrappable"],
    ["&& の連なり", "cd foo && ls -R", "wrappable"],
    ["heredoc", "cat <<'EOF'\na\nEOF", "heredoc"],
    ["here-string", 'grep a <<< "$text"', "heredoc"],
  ])("%s は %s", (_name, command, rule) => {
    expect(findBashOutputOverflow(bashCall(command), linesOf(300))?.rule).toBe(rule)
  })

  test("背景で走らせた呼び出しは background", () => {
    const call = bashCall("pnpm run test", { runsInBackground: true })
    expect(findBashOutputOverflow(call, linesOf(300))?.rule).toBe("background")
  })
})
