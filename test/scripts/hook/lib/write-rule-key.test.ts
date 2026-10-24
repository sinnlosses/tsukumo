// 書き込みを拒むときの規則のキーが、書き込みの形ごとに分かれることを関数で確かめる。

import { describe, expect, test } from "vitest"

import { findDeniedBashRule } from "../../../../scripts/hook/lib/shell-write-rule.ts"

const WORK_ROOT = "/work/tree"

describe("書き込みの形ごとの規則のキー", () => {
  test.each([
    ["作業ツリーの中へのリダイレクト", "echo x > /work/tree/a.txt", "redirect-write"],
    ["書き先が変数のリダイレクト", 'echo x > "$OUT"', "redirect-write-unresolved"],
    ["作業ツリーの中への tee", "echo x | tee /work/tree/a.txt", "tee-write"],
    ["書き先が変数の tee", 'echo x | tee "$OUT"', "tee-write-unresolved"],
    ["作業ツリーの外から中への cp", "cp /tmp/x/a.svg /work/tree/a.svg", "copy-write"],
    ["書き先が変数の mv", 'mv /tmp/x/a.svg "$DEST"', "copy-write-unresolved"],
    [
      "作業ツリーの中への node -e",
      "node -e \"require('fs').writeFileSync('src/a.ts', 'x')\"",
      "node-write",
    ],
  ])("%s は形ごとのキーを返す", (_name, command, rule) => {
    expect(findDeniedBashRule(command, undefined, WORK_ROOT)).toBe(rule)
  })

  test.each([
    ["/tmp へのリダイレクト", "echo x > /tmp/x/a"],
    ["/dev/null へのリダイレクト", "echo x > /dev/null"],
    ["/tmp への tee", "echo x | tee /tmp/x/a"],
    ["/tmp への cp", "cp /work/tree/a /tmp/x/a"],
  ])("%s は規則のキーを返さない", (_name, command) => {
    expect(findDeniedBashRule(command, undefined, WORK_ROOT)).toBeUndefined()
  })
})
