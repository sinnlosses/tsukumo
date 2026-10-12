import type { McpSdkServerConfigWithInstance, Options } from "@anthropic-ai/claude-agent-sdk"
import { describe, expect, it } from "vitest"

import {
  usageProposalQueryOptions,
  usageReviewQueryOptions,
} from "../../../../src/server/usage-review/adapter/sdk-usage-review-option.ts"
import type { UsageReviewQueryRequest } from "../../../../src/server/usage-review/core/usage-review-runner.ts"
import { createUsageReviewIntake } from "../../../../src/server/usage-review/core/usage-review-tool.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { callTool, listedToolNames } from "../../../fixture/mcp-server.ts"

// 確かめるのは渡す `options`（許す道具と設定）と、載せる MCP サーバの口だけ。フィクスチャはすべて手で書いた架空の値。

const REQUEST = {
  persona: "架空の人格",
  expressions: [{ name: "default", label: "通常" }],
  model: "sonnet",
  cwd: "/tmp/tsukumo-架空のcwd",
  env: { PATH: "/usr/bin" },
  systemPromptAppend: "架空の人格\n\n架空の役目",
  prompt: "架空の依頼",
} as const satisfies UsageReviewQueryRequest

const VALID_PROPOSAL = {
  kind: "unused-mcp",
  target: "example-server",
  impact: "small",
  title: "架空の MCP サーバを外す",
  basis: "架空の根拠（10 ターンぶん）",
  action: "架空のやること",
  followUp: "delegate",
} as const

const VALID_FINDINGS = {
  days: 7,
  headline: "架空の冒頭の一言。",
  proposals: [VALID_PROPOSAL],
} as const

/** 見直しの `options`。ツールの handler が流したイベントは `events` に積み、見送りの一覧は `dismissed` を返す。 */
function reviewOptions(events: SessionEvent[] = [], dismissed: readonly string[] = []): Options {
  const onEvent = (event: SessionEvent): void => {
    events.push(event)
  }
  return usageReviewQueryOptions(
    REQUEST,
    createUsageReviewIntake(
      () => dismissed,
      async () => true,
      onEvent,
    ),
    onEvent,
  )
}

/** `options` に載せた tsukumo の MCP サーバ。 */
function tsukumoServerOf(options: Options): McpSdkServerConfigWithInstance {
  const server = options.mcpServers?.["tsukumo"]
  if (server === undefined || server.type !== "sdk" || !("instance" in server)) {
    throw new Error("tsukumo の MCP サーバが載っていない")
  }
  return server
}

describe("usageReviewQueryOptions", () => {
  it("speak と見直しの2つだけを載せ、集計の python3 のほかは聞かずに断る", async () => {
    const options = reviewOptions()

    expect(await listedToolNames(tsukumoServerOf(options))).toEqual([
      "speak",
      "usage_review_stage",
      "usage_review_result",
    ])
    expect(options.allowedTools).toEqual([
      "Skill",
      "Read",
      "Bash(python3:*)",
      "mcp__tsukumo__speak",
      "mcp__tsukumo__usage_review_stage",
      "mcp__tsukumo__usage_review_result",
    ])
    expect(options.permissionMode).toBe("dontAsk")
    expect(options.persistSession).toBe(false)
    expect(options.settingSources).toEqual([])
    expect(options.systemPrompt).toEqual({
      type: "preset",
      preset: "claude_code",
      append: REQUEST.systemPromptAppend,
    })
    expect(options.plugins?.map((plugin) => plugin.path.endsWith("plugin"))).toEqual([true])
  })

  it("speak はセリフを usage-review-speech で流し、ok を返す", async () => {
    const events: SessionEvent[] = []

    const reply = await callTool(tsukumoServerOf(reviewOptions(events)), "speak", {
      text: "架空のセリフ",
      expression: "default",
    })

    expect(reply.text).toBe("ok")
    expect(events).toEqual([{ kind: "usage-review-speech", text: "架空のセリフ" }])
  })

  it("正しい結果を渡すと ok が返り、結果のイベントが流れる", async () => {
    const events: SessionEvent[] = []

    const reply = await callTool(
      tsukumoServerOf(reviewOptions(events)),
      "usage_review_result",
      VALID_FINDINGS,
    )

    expect(reply).toEqual({ text: "ok", isError: false, endsTurn: false })
    expect(events).toEqual([{ kind: "usage-review-result", findings: VALID_FINDINGS }])
  })

  it("段を渡すとイベントが流れ、見送った提案の識別子が戻り値に並ぶ", async () => {
    const events: SessionEvent[] = []

    const reply = await callTool(
      tsukumoServerOf(reviewOptions(events, ["unused-mcp:example-server"])),
      "usage_review_stage",
      { stage: "cache", days: 7 },
    )

    expect(events).toEqual([{ kind: "usage-review-stage", stage: "cache", days: 7 }])
    expect(reply.isError).toBe(false)
    expect(reply.text.split("\n")[0]).toBe("ok")
    expect(reply.text).toContain("- unused-mcp:example-server")
  })

  it("列挙に無い種類は境界で断られ、理由が戻り値で返り、イベントは流れない", async () => {
    const events: SessionEvent[] = []

    const reply = await callTool(tsukumoServerOf(reviewOptions(events)), "usage_review_result", {
      ...VALID_FINDINGS,
      proposals: [{ ...VALID_PROPOSAL, kind: "unknown-kind" }],
    })

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("kind")
    expect(events).toEqual([])
  })

  it("形は合っていても条に外れる結果は、直し方つきで差し戻される", async () => {
    const events: SessionEvent[] = []

    const reply = await callTool(
      tsukumoServerOf(reviewOptions(events, ["unused-mcp:example-server"])),
      "usage_review_result",
      { ...VALID_FINDINGS, headline: " ", proposals: [VALID_PROPOSAL, VALID_PROPOSAL] },
    )

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("`headline` が空")
    expect(reply.text).toContain("同じ `kind` と `target` の組が1件重なっている")
    expect(reply.text).toContain("利用者が見送った提案が2件入っている")
    expect(events).toEqual([])
  })

  it("提案が上限を超えると差し戻される", async () => {
    const events: SessionEvent[] = []
    const proposals = ["a", "b", "c", "d", "e", "f"].map((target) => ({
      ...VALID_PROPOSAL,
      kind: "tool-result",
      target,
    }))

    const reply = await callTool(tsukumoServerOf(reviewOptions(events)), "usage_review_result", {
      ...VALID_FINDINGS,
      proposals,
    })

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("提案が6件ある")
    expect(events).toEqual([])
  })
})

describe("usageProposalQueryOptions", () => {
  it("tsukumo に頼む口は、ファイルの読み書きと speak だけを許し、Bash もプラグインも載せない", async () => {
    const options = usageProposalQueryOptions({ ...REQUEST, followUp: "delegate" }, () => {}, true)

    expect(await listedToolNames(tsukumoServerOf(options))).toEqual(["speak"])
    expect(options.tools).toEqual(["Read", "Edit", "Write", "Glob", "Grep"])
    expect(options.allowedTools).toEqual([
      "Read",
      "Edit",
      "Write",
      "Glob",
      "Grep",
      "mcp__tsukumo__speak",
    ])
    expect(options.permissionMode).toBe("dontAsk")
    expect(options.plugins).toEqual([])
  })

  it("タスクにする口は tw new だけを許し、取り込んだワークフローのプラグインは載せるときだけ載せる", () => {
    const mounted = usageProposalQueryOptions({ ...REQUEST, followUp: "task" }, () => {}, true)
    const unmounted = usageProposalQueryOptions({ ...REQUEST, followUp: "task" }, () => {}, false)

    expect(mounted.allowedTools).toEqual(["Skill", "Read", "Bash(tw new:*)", "mcp__tsukumo__speak"])
    expect(mounted.plugins?.map((plugin) => plugin.path.endsWith("tsukumo-plugins"))).toEqual([
      true,
    ])
    expect(unmounted.plugins).toEqual([])
  })
})
