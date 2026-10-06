// 広い `kill` を止める PreToolUse hook の契約（終了コード 2 で実行を止める）を、
// スクリプトを実際に起こして確かめる。判定だけを取り出して呼ぶと、hook が守るべき
// 「終了コードで伝える」という約束のほうが抜けるため。

import process from "node:process"

import { describe, expect, test } from "vitest"

import { runSubprocess } from "../fixture/subprocess.ts"

const HOOK_PATH = "scripts/deny-broad-kill.ts"

describe("広い kill を拒否する hook", () => {
  test.each([
    ["パターンで薙ぐ pkill", "pkill -f 'pnpm run'"],
    ["エントリポイントを狙う pkill", 'pkill -f "src/cli.ts"'],
    ["名前で薙ぐ killall", "killall node"],
    ["pgrep から kill へ流す形", "pgrep -f pnpm | xargs kill"],
    ["前段のコマンドに続けて書いた pkill", "echo stopping && pkill -f tsukumo"],
    ["vitest を名前で狙う pkill", "pkill -f vitest"],
    ["引用符の中に vitest を書いた pkill", 'pkill -9 -f "vitest run --reporter=dot"'],
    ["chrome を名前で狙う killall", "killall chrome"],
    ["playwright を狙う pkill", "pkill -f playwright"],
    ["台本の名前と引数を狙う pkill", 'pkill -f "check.ts --full"'],
    ["台本の名前だけを狙う pkill", "pkill -f check.ts"],
    ["tw のサブコマンドを狙う pkill", 'pkill -f "tw ship"'],
  ])("%s は止める", async (_name, command) => {
    expect(await runHook(command)).toBe(2)
  })

  test.each([
    ["pid を名指しする kill", "kill 34390"],
    ["ポートから引いた pid を渡す kill", "kill $(lsof -ti tcp:7398 -sTCP:LISTEN)"],
    ["語として書いただけの grep", 'grep -rn "pkill" docs/workflow.md'],
    ["取り合わない相手を狙う pkill", "pkill -f my-python-worker"],
    ["自分で起こした python の台本を狙う pkill", "pkill -f my-own-python-script.py"],
    ["tw を含むだけの別の語を狙う pkill", "pkill -f twitter-bot"],
    ["引用符の中に語を書いた grep", "grep -rn 'pkill\\|killall' .claude/"],
    ["コミットメッセージに語を書いた git commit", 'git commit -m "node の pkill を止める hook"'],
    [
      "heredoc の本文に語を書いた tw new",
      "tw new --body-file - <<'EOF'\npkill -f vitest\nkillall node\nEOF",
    ],
  ])("%s は通す", async (_name, command) => {
    expect(await runHook(command)).toBe(0)
  })

  test("Bash 以外のツールには関わらない", async () => {
    expect(await runHook("pkill -f pnpm", "Read")).toBe(0)
  })

  test("形が違う入力では実行を止めない", async () => {
    expect(await runRaw("これは JSON ではない")).toBe(0)
  })
})

function runHook(command: string, toolName = "Bash"): Promise<number | undefined> {
  return runRaw(JSON.stringify({ tool_name: toolName, tool_input: { command } }))
}

/** hook を起こして終了コードを返す（シグナルで終わったときは `undefined`）。stderr は拒否の理由が入るので見ない。 */
async function runRaw(input: string): Promise<number | undefined> {
  const result = await runSubprocess(process.execPath, [HOOK_PATH], { input })
  return result.exitCode
}
