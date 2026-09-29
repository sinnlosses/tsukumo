// `sed -i` を止める PreToolUse hook の契約（終了コード 2 で実行を止め、stderr で Edit を促す）を、
// スクリプトを実際に起こして確かめる。

import process from "node:process"

import { describe, expect, test } from "vitest"

import { runSubprocess } from "../fixture/subprocess.ts"

const HOOK_PATH = "scripts/deny-sed-in-place.ts"

describe("sed -i を拒否する hook", () => {
  test.each([
    ["-i", "sed -i 's/a/b/' file.ts"],
    ["-i.bak", "sed -i.bak 's/a/b/' file.ts"],
    ["-i と空の接尾辞", "sed -i '' 's/a/b/' file.ts"],
    ["--in-place", "sed --in-place 's/a/b/' file.ts"],
    ["他の短い引数とまとめた -ni", "sed -ni 's/a/b/p' file.ts"],
    ["パイプの後ろ", "cat list | xargs sed -i 's/a/b/'"],
    ["&& の後ろ", "cd src && sed -i.bak 's/a/b/' file.ts"],
  ])("%s は止めて Edit を促す", async (_name, command) => {
    const result = await runHook(command)
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("Edit")
  })

  test.each([
    ["読むだけの sed -n", "sed -n '1,5p' file.ts"],
    ["標準出力へ出す sed", "sed 's/a/b/' file.ts"],
    ["語として書いただけの grep", "grep 'sed -i' docs/workflow.md"],
  ])("%s は通す", async (_name, command) => {
    expect((await runHook(command)).exitCode).toBe(0)
  })

  test("Bash 以外のツールには関わらない", async () => {
    expect((await runHook("sed -i 's/a/b/' f", "Read")).exitCode).toBe(0)
  })

  test("形が違う入力では実行を止めない", async () => {
    expect((await runRaw("これは JSON ではない")).exitCode).toBe(0)
  })
})

function runHook(command: string, toolName = "Bash") {
  return runRaw(JSON.stringify({ tool_name: toolName, tool_input: { command } }))
}

function runRaw(input: string) {
  return runSubprocess(process.execPath, [HOOK_PATH], { input })
}
