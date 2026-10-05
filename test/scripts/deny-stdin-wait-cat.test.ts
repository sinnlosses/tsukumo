// 入力を与えない `cat` を止める PreToolUse hook の契約（終了コード 2 と、stderr の理由）を、
// スクリプトを実際に起こして確かめる。

import process from "node:process"

import { describe, expect, test } from "vitest"

import { runSubprocess } from "../fixture/subprocess.ts"

const HOOK_PATH = "scripts/deny-stdin-wait-cat.ts"

describe("入力を与えない cat を拒否する hook", () => {
  test.each([
    ["引数なしの cat", "cat"],
    ["/dev/null へ流す cat", "cat > /dev/null"],
    ["リダイレクトだけの cat", "cat >/tmp/x"],
    ["オプションだけの cat", "cat -n"],
    ["前段のコマンドに続けた cat", "echo a && cat > /dev/null"],
    ["|| の右側の cat", "false || cat"],
    ["パイプの左側の cat", "cat | wc -l"],
  ])("%s は止める", async (_name, command) => {
    const result = await runHook(command)
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("標準入力を待って止まる")
  })

  test.each([
    ["パイプの右側の cat", "git diff | cat"],
    ["パイプの右側のサブシェルの cat", "echo a | (cat)"],
    ["パイプの右側のグループの cat", "echo a | { cat; }"],
    ["heredoc を渡す cat", "cat <<'EOF'\nhello\nEOF"],
    ["ファイルを引数に取る cat", "cat file"],
    ["< で入力を渡す cat", "cat < file"],
    ["here-string を渡す cat", "cat <<< x"],
    ["オプションとファイルの cat", "cat -n file"],
  ])("%s は通す", async (_name, command) => {
    expect((await runHook(command)).exitCode).toBe(0)
  })

  test("Bash 以外のツールには関わらない", async () => {
    expect((await runHook("cat", "Read")).exitCode).toBe(0)
  })

  test("形が違う入力では実行を止めない", async () => {
    expect((await run("これは JSON ではない")).exitCode).toBe(0)
  })
})

function runHook(command: string, toolName = "Bash") {
  return run(JSON.stringify({ tool_name: toolName, tool_input: { command } }))
}

function run(input: string) {
  return runSubprocess(process.execPath, [HOOK_PATH], {
    input,
    env: { ...process.env, TSUKUMO_HOOK_DENIAL_RECORD: "off" },
  })
}
