// 委譲先が `tw verify` を背景で打つのを止める PreToolUse hook の契約（終了コード 2 で
// 実行を止める）を、スクリプトを実際に起こして確かめる。
//
// 入力の形（`agent_id`・`tool_input.run_in_background`）は、この hook を実機で起こして
// 控えた形に合わせている。

import process from "node:process"

import { describe, expect, test } from "vitest"

import { runSubprocess } from "../fixture/subprocess.ts"

const HOOK_PATH = "scripts/deny-background-verify.ts"
const SUBAGENT_ID = "subagent-1"

describe("委譲先の背景の tw verify を拒否する hook", () => {
  test.each([
    ["ふつうの呼び出し", "tw verify"],
    ["前段のコマンドに続く形", "cd foo && tw verify"],
  ])("%s は止める", async (_name, command) => {
    expect(await runHook(command, { fromSubagent: true, runInBackground: true })).toBe(2)
  })

  test.each([
    ["別のサブコマンド verify-check", "tw verify-check"],
    ["tw verify 以外の背景コマンド", "pnpm run check"],
  ])("%s は通す", async (_name, command) => {
    expect(await runHook(command, { fromSubagent: true, runInBackground: true })).toBe(0)
  })

  test("委譲先の前景の tw verify は通す", async () => {
    expect(await runHook("tw verify", { fromSubagent: true, runInBackground: false })).toBe(0)
  })

  test("メインの背景の tw verify は通す", async () => {
    expect(await runHook("tw verify", { fromSubagent: false, runInBackground: true })).toBe(0)
  })

  test("Bash 以外のツールには関わらない", async () => {
    expect(
      await runRaw(
        JSON.stringify({
          tool_name: "Read",
          tool_input: { command: "tw verify", run_in_background: true },
          agent_id: SUBAGENT_ID,
        }),
      ),
    ).toBe(0)
  })

  test("形が違う入力では実行を止めない", async () => {
    expect(await runRaw("これは JSON ではない")).toBe(0)
  })
})

function runHook(
  command: string,
  options: { readonly fromSubagent: boolean; readonly runInBackground: boolean },
): Promise<number | undefined> {
  return runRaw(
    JSON.stringify({
      tool_name: "Bash",
      tool_input: { command, run_in_background: options.runInBackground },
      ...(options.fromSubagent ? { agent_id: SUBAGENT_ID, agent_type: "no-delegate" } : {}),
    }),
  )
}

/** hook を起こして終了コードを返す（シグナルで終わったときは `undefined`）。stderr は拒否の理由が入るので見ない。 */
async function runRaw(input: string): Promise<number | undefined> {
  const result = await runSubprocess(process.execPath, [HOOK_PATH], { input })
  return result.exitCode
}
