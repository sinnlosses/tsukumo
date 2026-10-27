// hook の入力 JSON から WebFetch の呼び出しを取り出す処理の契約。

import { describe, expect, test } from "vitest"

import { parseWebFetchHookCall } from "../../../../scripts/hook/lib/web-fetch-hook-call.ts"

const URL_OF_DUMMY = "https://example.test/a"

function webFetchInput(
  extra: Record<string, unknown> = {},
  toolInput: object = { url: URL_OF_DUMMY },
) {
  return JSON.stringify({
    tool_name: "WebFetch",
    tool_input: { prompt: "p", ...toolInput },
    ...extra,
  })
}

describe("parseWebFetchHookCall", () => {
  test.each([
    ["壊れた JSON", "{not json"],
    ["Bash の呼び出し", JSON.stringify({ tool_name: "Bash", tool_input: { url: URL_OF_DUMMY } })],
    ["url が文字列でない", webFetchInput({}, { url: 1 })],
  ])("%s は undefined", (_name, raw) => {
    expect(parseWebFetchHookCall(raw)).toBeUndefined()
  })

  test("主のセッションの呼び出しは fromSubagent が偽", () => {
    expect(parseWebFetchHookCall(webFetchInput())).toEqual({
      url: URL_OF_DUMMY,
      fromSubagent: false,
    })
  })

  test("agent_id が文字列ならサブエージェントの呼び出し", () => {
    expect(parseWebFetchHookCall(webFetchInput({ agent_id: "a1" }))).toEqual({
      url: URL_OF_DUMMY,
      fromSubagent: true,
    })
  })
})
