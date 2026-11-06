// hook が標準入力へ流す JSON から、Bash ツールの呼び出しのうち入口が見るところを取り出す。

import { readField, readString, safeParse } from "./hook-json.ts"

/** Bash ツールの hook の入力のうち、入口が見るところ。 */
export type BashHookCall = {
  readonly command: string
  readonly cwd?: string
  readonly runsInBackground: boolean
  readonly fromSubagent: boolean
}

/** hook が stdin へ流す JSON から Bash の呼び出しを取り出す。壊れた JSON・Bash 以外・形が違えば `undefined`。 */
export function parseBashHookCall(rawInput: string): BashHookCall | undefined {
  const input = safeParse(rawInput)
  if (readField(input, "tool_name") !== "Bash") {
    return undefined
  }

  const toolInput = readField(input, "tool_input")
  const command = readField(toolInput, "command")
  if (typeof command !== "string") {
    return undefined
  }

  return {
    command,
    cwd: readString(input, "cwd"),
    runsInBackground: readField(toolInput, "run_in_background") === true,
    fromSubagent: typeof readField(input, "agent_id") === "string",
  }
}

/** PostToolUse の Bash の呼び出しと、その結果（stdout と stderr を改行でつないだもの）。 */
export type BashHookResult = {
  readonly call: BashHookCall
  readonly output: string
}

/** PostToolUse の hook が stdin へ流す JSON から、Bash の呼び出しと結果を取り出す。結果の欄が無ければ `undefined`。 */
export function parseBashHookResult(rawInput: string): BashHookResult | undefined {
  const call = parseBashHookCall(rawInput)
  const response = readField(safeParse(rawInput), "tool_response")
  const stdout = readString(response, "stdout")
  if (call === undefined || stdout === undefined) {
    return undefined
  }
  const stderr = readString(response, "stderr") ?? ""
  const output = [stdout, stderr]
    .map((text) => text.replace(/\n$/u, ""))
    .filter((text) => text !== "")
    .join("\n")
  return { call, output }
}
