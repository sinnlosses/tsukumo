// 広い `kill` を止める PreToolUse hook の契約（終了コード 2 で実行を止める）を、
// **スクリプトを実際に起こして**確かめる。判定だけを取り出して呼ぶと、hook が守るべき
// 「終了コードで伝える」という約束のほうが抜けるため。

import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import process from "node:process"

const HOOK_PATH = "scripts/deny-broad-kill.ts"

describe("広い kill を拒否する hook", () => {
  test.each([
    ["パターンで薙ぐ pkill", "pkill -f 'bun run'"],
    ["エントリポイントを狙う pkill", 'pkill -f "src/cli.ts"'],
    ["名前で薙ぐ killall", "killall bun"],
    ["pgrep から kill へ流す形", "pgrep -f bun | xargs kill"],
    ["前段のコマンドに続けて書いた pkill", "echo stopping && pkill -f tsukumo"],
  ])("%s は止める", (_name, command) => {
    expect(runHook(command)).toBe(2)
  })

  test.each([
    ["pid を名指しする kill", "kill 34390"],
    ["ポートから引いた pid を渡す kill", "kill $(lsof -ti tcp:7398 -sTCP:LISTEN)"],
    ["語として書いただけの grep", 'grep -rn "pkill" docs/workflow.md'],
    ["取り合わない相手を狙う pkill", "pkill -f my-python-worker"],
  ])("%s は通す", (_name, command) => {
    expect(runHook(command)).toBe(0)
  })

  test("Bash 以外のツールには関わらない", () => {
    expect(runHook("pkill -f bun", "Read")).toBe(0)
  })

  test("形が違う入力では実行を止めない", () => {
    expect(runRaw("これは JSON ではない")).toBe(0)
  })
})

function runHook(command: string, toolName = "Bash"): number {
  return runRaw(JSON.stringify({ tool_name: toolName, tool_input: { command } }))
}

/** hook を起こして終了コードを返す。stderr は拒否の理由が入るので捨てる。 */
function runRaw(input: string): number {
  try {
    execFileSync(process.execPath, [HOOK_PATH], { input, stdio: ["pipe", "pipe", "pipe"] })
    return 0
  } catch (error) {
    const status = (error as { readonly status?: unknown }).status
    return typeof status === "number" ? status : -1
  }
}
