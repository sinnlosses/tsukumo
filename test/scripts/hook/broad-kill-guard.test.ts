// 広い `kill` を止める PreToolUse hook の契約（終了コード 2 で実行を止める）を、
// スクリプトを実際に起こして確かめる。判定だけを取り出して呼ぶと、hook が守るべき
// 「終了コードで伝える」という約束のほうが抜けるため。
// 判定の表は findBroadKillDenial のテストが持ち、ここは止める・通すを1本ずつ見る。

import process from "node:process"

import { describe, expect, test } from "vitest"

import { runSubprocess } from "../../fixture/subprocess.ts"

const HOOK_PATH = "scripts/hook/bash-guard.ts"

describe("広い kill を拒否する hook", () => {
  test("名前で薙ぐ pkill は止める", async () => {
    expect(await runHook("pkill -f vitest")).toBe(2)
  })

  test("pid を名指しする kill は通す", async () => {
    expect(await runHook("kill 34390")).toBe(0)
  })
})

/** hook を起こして終了コードを返す（シグナルで終わったときは `undefined`）。stderr は拒否の理由が入るので見ない。 */
async function runHook(command: string): Promise<number | undefined> {
  const input = JSON.stringify({ tool_name: "Bash", tool_input: { command } })
  const result = await runSubprocess(process.execPath, [HOOK_PATH], { input })
  return result.exitCode
}
