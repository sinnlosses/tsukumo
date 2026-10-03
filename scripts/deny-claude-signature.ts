// コミットメッセージに Claude の署名（`Co-Authored-By: Claude …`・`Generated with [Claude Code]`）が
// 入っていたら、コミットを止める git の commit-msg フック（`.githooks/commit-msg` から呼ばれる）。
//
// 引数はメッセージのファイルのパス。終了コード 1 でコミットが止まり、stderr が出力に出る。
// メッセージが読めないときは止めない。

import { readFileSync } from "node:fs"
import process from "node:process"

import { recordHookDenial } from "./lib/hook-denial-record.ts"

/** 行頭の `Co-Authored-By:` で、Claude または Anthropic を名指すトレーラー。 */
const CO_AUTHOR_TRAILER = /^\s*co-authored-by:.*(?:claude|anthropic)/i

/** Claude Code が付ける「生成した」旨の行。 */
const GENERATED_MARK = /^\s*(?:🤖\s*)?generated with \[?claude code/i

const message = readMessage(process.argv[2])
const offending = message === undefined ? [] : findSignatureLines(message)
if (message !== undefined && offending.length > 0) {
  recordHookDenial({
    hook: "deny-claude-signature",
    rule: findSignatureRule(message),
    actor: "git",
  })
  process.stderr.write(
    `コミットメッセージに Claude の署名が入っている。\n${offending.map((line) => `  ${line}`).join("\n")}\nこの行を消して、署名なしのメッセージで打ち直すこと。\n`,
  )
  process.exit(1)
}

/** 署名の行のうち先に見つかった種類の規則のキー。 */
function findSignatureRule(text: string): string {
  const lines = text.split("\n").filter((line) => !line.startsWith("#"))
  return lines.some((line) => CO_AUTHOR_TRAILER.test(line)) ? "co-author-trailer" : "generated-mark"
}

/** `#` で始まるコメント行を除いた行のうち、署名に当たるもの。 */
function findSignatureLines(text: string): readonly string[] {
  return text
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .filter((line) => CO_AUTHOR_TRAILER.test(line) || GENERATED_MARK.test(line))
    .map((line) => line.trim())
}

function readMessage(path: string | undefined): string | undefined {
  if (path === undefined) {
    return undefined
  }
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}
