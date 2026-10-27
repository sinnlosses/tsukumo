// hook が標準入力へ流す JSON から、WebFetch ツールの呼び出しのうち入口が見るところを取り出す。

import { readField, readString, safeParse } from "./hook-json.ts"

/** WebFetch ツールの hook の入力のうち、入口が見るところ。 */
export type WebFetchHookCall = {
  readonly url: string
  readonly fromSubagent: boolean
}

/** hook が stdin へ流す JSON から WebFetch の呼び出しを取り出す。壊れた JSON・WebFetch 以外・形が違えば `undefined`。 */
export function parseWebFetchHookCall(rawInput: string): WebFetchHookCall | undefined {
  const input = safeParse(rawInput)
  if (readField(input, "tool_name") !== "WebFetch") {
    return undefined
  }

  const url = readString(readField(input, "tool_input"), "url")
  if (url === undefined) {
    return undefined
  }

  return { url, fromSubagent: typeof readField(input, "agent_id") === "string" }
}
