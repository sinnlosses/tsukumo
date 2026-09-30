// コミットメッセージの Claude の署名を止める commit-msg フックの契約（終了コード 1 で止め、
// stderr に該当行と直し方を出す）を、スクリプトを実際に起こして確かめる。

import { writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { describe, expect, test } from "vitest"

import { runSubprocess } from "../fixture/subprocess.ts"
import { useTempDir } from "../fixture/temp-dir.ts"

const HOOK_PATH = "scripts/deny-claude-signature.ts"

const tempDir = useTempDir("claude-signature")

describe("Claude の署名を止める commit-msg フック", () => {
  test.each([
    [
      "Co-Authored-By: Claude",
      "件名:直す\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n",
    ],
    ["大文字小文字の違う co-authored-by", "件名:直す\n\nco-authored-by: claude <a@b>\n"],
    [
      "Anthropic のアドレスだけの署名",
      "件名:直す\n\nCo-Authored-By: Bot <noreply@anthropic.com>\n",
    ],
    [
      "Generated with Claude Code",
      "件名:直す\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n",
    ],
  ])("%s は止めて、該当行と消す指示を出す", async (_name, message) => {
    const result = await runHook(message)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("消して")
    expect(result.stderr).toMatch(/Co-Authored-By|Generated with|co-authored-by/i)
  })

  test.each([
    ["署名のないメッセージ", "件名:直す\n\n本文\n"],
    ["Claude 以外の共作者", "件名:直す\n\nCo-Authored-By: Fuji <fuji@example.com>\n"],
    ["文中で語として書いただけの行", "件名:Co-Authored-By: Claude を止める仕組みを足す\n"],
    ["コメント行に入っているだけの署名", "件名:直す\n# Co-Authored-By: Claude <a@b>\n"],
  ])("%s は通す", async (_name, message) => {
    expect((await runHook(message)).exitCode).toBe(0)
  })

  test("メッセージのファイルが読めないときは止めない", async () => {
    const result = await runSubprocess(process.execPath, [HOOK_PATH, join(tempDir(), "none")])
    expect(result.exitCode).toBe(0)
  })
})

async function runHook(message: string) {
  const path = join(tempDir(), "COMMIT_EDITMSG")
  writeFileSync(path, message)
  return runSubprocess(process.execPath, [HOOK_PATH, path])
}
