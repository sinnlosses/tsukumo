// 委譲先が `tw verify` を背景で打つのを止める PreToolUse hook の契約（終了コード 2 で
// 実行を止める）を、スクリプトを実際に起こして確かめる。
// コマンドの形の表は runsTwVerify のテストが持ち、ここは委譲先と背景の組み合わせを見る。
//
// 入力の形（`agent_id`・`tool_input.run_in_background`）は、この hook を実機で起こして
// 控えた形に合わせている。

import process from "node:process"

import { describe, expect, test } from "vitest"

import { runSubprocess } from "../../fixture/subprocess.ts"

const HOOK_PATH = "scripts/hook/bash-guard.ts"
const SUBAGENT_ID = "subagent-1"

describe("委譲先の背景の tw verify を拒否する hook", () => {
  test("委譲先の背景の tw verify は止める", async () => {
    expect(await runHook("tw verify", { fromSubagent: true, runInBackground: true })).toBe(2)
  })

  test("委譲先の前景の tw verify は通す", async () => {
    expect(await runHook("tw verify", { fromSubagent: true, runInBackground: false })).toBe(0)
  })

  test("メインの背景の tw verify は通す", async () => {
    expect(await runHook("tw verify", { fromSubagent: false, runInBackground: true })).toBe(0)
  })
})

/** hook を起こして終了コードを返す（シグナルで終わったときは `undefined`）。stderr は拒否の理由が入るので見ない。 */
async function runHook(
  command: string,
  options: { readonly fromSubagent: boolean; readonly runInBackground: boolean },
): Promise<number | undefined> {
  const input = JSON.stringify({
    tool_name: "Bash",
    tool_input: { command, run_in_background: options.runInBackground },
    ...(options.fromSubagent ? { agent_id: SUBAGENT_ID, agent_type: "implementer" } : {}),
  })
  const result = await runSubprocess(process.execPath, [HOOK_PATH], { input })
  return result.exitCode
}
