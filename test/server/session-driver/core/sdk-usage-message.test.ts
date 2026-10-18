import { expect, it } from "vitest"

import { toSessionEvents } from "../../../../src/server/session-driver/core/sdk-message.ts"
import { assistantMessage, EXPRESSIONS } from "../../../fixture/sdk-assistant-message.ts"

// ステップごとの使用量。ターンの中を持ち場ごとに割れるのはこの経路だけなので、
// `message.id` と持ち場が付いて出ることを固定する。
it("assistant の usage を message.id 付きのステップの使用量にする", () => {
  const message = {
    ...assistantMessage([{ type: "text", text: "ダミーの本文です。" }]),
    message: {
      role: "assistant",
      id: "msg_fictional_1",
      content: [{ type: "text", text: "ダミーの本文です。" }],
      usage: {
        input_tokens: 43_145,
        output_tokens: 13_371,
        cache_read_input_tokens: 9_000,
        cache_creation_input_tokens: 800,
      },
    },
  }

  expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
    { kind: "utterance", text: "ダミーの本文です。" },
    {
      kind: "step-usage",
      messageId: "msg_fictional_1",
      scope: "main",
      usage: {
        inputTokens: 43_145,
        outputTokens: 13_371,
        cacheReadInputTokens: 9_000,
        cacheCreationInputTokens: 800,
      },
    },
  ])
})

it("parent_tool_use_id のある assistant のステップはサブエージェントぶんになる", () => {
  const message = {
    type: "assistant",
    session_id: "s-1",
    parent_tool_use_id: "toolu_sub_1",
    message: {
      role: "assistant",
      id: "msg_fictional_2",
      content: [],
      // 欠けた鍵と `null`（`cache_creation_input_tokens` は null で来ることがある）は0に倒す。
      usage: { input_tokens: 55_431, cache_creation_input_tokens: null },
    },
  }

  expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
    {
      kind: "step-usage",
      messageId: "msg_fictional_2",
      scope: "subagent",
      usage: {
        inputTokens: 55_431,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    },
  ])
})

it("id や usage を持たない assistant はステップの使用量を出さない", () => {
  const withoutUsage = {
    ...assistantMessage([]),
    message: { role: "assistant", id: "msg_fictional_3", content: [] },
  }
  const withoutId = {
    ...assistantMessage([]),
    message: { role: "assistant", content: [], usage: { input_tokens: 10 } },
  }

  expect(toSessionEvents(withoutUsage, EXPRESSIONS)).toEqual([])
  expect(toSessionEvents(withoutId, EXPRESSIONS)).toEqual([])
})

// トークン消費の記録（`docs/requirements.md`「Claude Code の駆動」）。運ぶのは累計そのままで、増分に直すのは
// `tokenUsageDelta`。
it("result の modelUsage は累計のイベントにして、ターンの終わりの前に並べる", () => {
  const message = {
    type: "result",
    subtype: "success",
    // メインループぶんだけの `usage` は集計に使わないので、混ざらないことも一緒に見る。
    usage: { input_tokens: 1, output_tokens: 2 },
    total_cost_usd: 0.5,
    modelUsage: {
      "claude-opus-fictional": {
        inputTokens: 1_200,
        outputTokens: 340,
        thinkingTokens: 50,
        cacheReadInputTokens: 9_000,
        cacheCreationInputTokens: 800,
        costUSD: 0.125,
        contextWindow: 200_000,
      },
    },
  }

  expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
    {
      kind: "token-usage",
      cumulative: [
        {
          model: "claude-opus-fictional",
          inputTokens: 1_200,
          outputTokens: 340,
          thinkingTokens: 50,
          cacheReadInputTokens: 9_000,
          cacheCreationInputTokens: 800,
          costUsd: 0.125,
        },
      ],
    },
    { kind: "turn-finished", outcome: { kind: "completed" } },
  ])
})

it("modelUsage の欠けた鍵・数でない値は0に倒す", () => {
  const message = {
    type: "result",
    subtype: "success",
    modelUsage: { "claude-opus-fictional": { inputTokens: "たくさん", outputTokens: 7 } },
  }

  expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
    {
      kind: "token-usage",
      cumulative: [
        {
          model: "claude-opus-fictional",
          inputTokens: 0,
          outputTokens: 7,
          thinkingTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          costUsd: 0,
        },
      ],
    },
    { kind: "turn-finished", outcome: { kind: "completed" } },
  ])
})

it("modelUsage が無い・空・壊れている result は使用量のイベントを出さない", () => {
  for (const modelUsage of [undefined, {}, "こわれた", { "claude-opus-fictional": null }]) {
    expect(
      toSessionEvents({ type: "result", subtype: "success", modelUsage }, EXPRESSIONS),
    ).toEqual([{ kind: "turn-finished", outcome: { kind: "completed" } }])
  }
})

it("parent_tool_use_id のある result はターンの終わりにせず、使用量も出さない（案4-c。サブエージェントぶんは Claude Code の累計に含まれる）", () => {
  const message = {
    type: "result",
    subtype: "success",
    num_turns: 1,
    duration_ms: 10,
    parent_tool_use_id: "toolu_sub_1",
    modelUsage: { "claude-sonnet-fictional": { inputTokens: 10, outputTokens: 2 } },
  }

  expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
})
