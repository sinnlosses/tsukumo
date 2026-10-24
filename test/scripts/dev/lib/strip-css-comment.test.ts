import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { expect, test } from "vitest"

import { stripCssCommentInFile } from "../../../../scripts/dev/lib/strip-css-comment.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const tempDir = useTempDir("strip-css-comment")

test("ブロックコメントを落とし、文字列の中の /* は残す", async () => {
  const path = join(tempDir(), "main.css")
  writeFileSync(
    path,
    '/* 先頭 */\n.a { /* 中 */ content: "/* 文字列 */"; color: red }\n/* 末尾 */\n',
  )

  await stripCssCommentInFile(path)

  const stripped = readFileSync(path, "utf8")
  expect(stripped).not.toContain("先頭")
  expect(stripped).not.toContain("中 */")
  expect(stripped).not.toContain("末尾")
  expect(stripped).toContain('content: "/* 文字列 */"')
  expect(stripped).toContain("color: red")
})
