// 見直しと提案の実行の使い捨ての `query()` に渡す `options`（中断の口を除く）を組み立てる。
//
// どちらも `permissionMode: "dontAsk"` で、許す道具を `allowedTools` に並べたものだけを通す（許可を尋ねる先が無い）。
// 設定ファイルは読まず（`settingSources: []`）、transcript も書かない（`persistSession: false`）。
// スキルを読み込ませるため、`systemPrompt` は Claude Code の preset に人格と役目の指示を足す。
// MCP は `TSUKUMO_MCP_SERVER_NAME` の名の、この問い合わせ専用のサーバだけ（`speak` と、見直しのときだけ `usage_review_*` の2つ）。

import { createSdkMcpServer, tool, type Options } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import {
  type ExpressionChoice,
  expressionEnumForSpeak,
  expressionGuideForSpeak,
} from "../../../shared/character-pack/expression-choice.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import {
  USAGE_PROPOSAL_FOLLOW_UPS,
  USAGE_PROPOSAL_IMPACTS,
  USAGE_PROPOSAL_KINDS,
  USAGE_REVIEW_STAGES,
  type UsageProposalFollowUp,
} from "../../../shared/usage-review/usage-review.ts"
import { bundledFilePath } from "../../adapter/bundled-path.ts"
import {
  SPEAK_TOOL_NAME,
  TSUKUMO_MCP_SERVER_NAME,
  tsukumoToolFullName,
} from "../../core/tsukumo-tool-name.ts"
import { workflowPluginDir } from "../../session-driver/adapter/workflow-plugin.ts"
import type {
  UsageProposalQueryRequest,
  UsageReviewQueryRequest,
} from "../core/usage-review-runner.ts"
import {
  USAGE_REVIEW_RESULT_TOOL_DESCRIPTION,
  USAGE_REVIEW_RESULT_TOOL_NAME,
  USAGE_REVIEW_STAGE_TOOL_DESCRIPTION,
  USAGE_REVIEW_STAGE_TOOL_NAME,
  type UsageReviewIntake,
  usageProposalKindGuide,
  usageReviewStageGuide,
} from "../core/usage-review-tool.ts"

/** モデルに見せる、この問い合わせの `speak` の説明。 */
const USAGE_REVIEW_SPEAK_DESCRIPTION =
  "キャラクターが利用者に向けて、いまの進みや終わったことを一言で話す。手順・数・表は入れない。"

/** 見直しの期間の引数（2つのツールで同じ）。 */
const USAGE_REVIEW_DAYS = z.number().int().positive().describe("見た期間。今日を含む直近何日か")

/** 見直しで許す組み込みの道具。集計は同梱のスキルが `python3` で走らせる。 */
const REVIEW_BUILTIN_TOOLS = ["Skill", "Read", "Bash"]
const REVIEW_ALLOWED_BUILTIN_TOOLS = ["Skill", "Read", "Bash(python3:*)"]

/** 提案の実行で、押す口ごとに許す組み込みの道具。`task` はタスクを1件登録するだけ。 */
const PROPOSAL_TOOLS = {
  delegate: {
    tools: ["Read", "Edit", "Write", "Glob", "Grep"],
    allowed: ["Read", "Edit", "Write", "Glob", "Grep"],
  },
  task: { tools: ["Skill", "Read", "Bash"], allowed: ["Skill", "Read", "Bash(tw new:*)"] },
} as const satisfies Record<
  UsageProposalFollowUp,
  { readonly tools: readonly string[]; readonly allowed: readonly string[] }
>

/** 見直しの `query()` の `options`（中断の口を除く）。 */
export function usageReviewQueryOptions(
  request: UsageReviewQueryRequest,
  intake: UsageReviewIntake,
  onEvent: (event: SessionEvent) => void,
): Options {
  const server = createSdkMcpServer({
    name: TSUKUMO_MCP_SERVER_NAME,
    version: "0.0.0",
    tools: [speakTool(request.expressions, onEvent), ...usageReviewTools(intake)],
  })
  return {
    ...commonOptions(request),
    tools: [...REVIEW_BUILTIN_TOOLS],
    allowedTools: [
      ...REVIEW_ALLOWED_BUILTIN_TOOLS,
      tsukumoToolFullName(SPEAK_TOOL_NAME),
      tsukumoToolFullName(USAGE_REVIEW_STAGE_TOOL_NAME),
      tsukumoToolFullName(USAGE_REVIEW_RESULT_TOOL_NAME),
    ],
    mcpServers: { [TSUKUMO_MCP_SERVER_NAME]: server },
    plugins: [{ type: "local", path: bundledFilePath("plugin") }],
  }
}

/**
 * 提案の実行の `query()` の `options`（中断の口を除く）。
 * `mountWorkflowPlugin` は取り込んだワークフローのプラグインを載せるか（会話と同じ判定。`task` のときだけ使う）。
 */
export function usageProposalQueryOptions(
  request: UsageProposalQueryRequest,
  onEvent: (event: SessionEvent) => void,
  mountWorkflowPlugin: boolean,
): Options {
  const server = createSdkMcpServer({
    name: TSUKUMO_MCP_SERVER_NAME,
    version: "0.0.0",
    tools: [speakTool(request.expressions, onEvent)],
  })
  const tools = PROPOSAL_TOOLS[request.followUp]
  return {
    ...commonOptions(request),
    tools: [...tools.tools],
    allowedTools: [...tools.allowed, tsukumoToolFullName(SPEAK_TOOL_NAME)],
    mcpServers: { [TSUKUMO_MCP_SERVER_NAME]: server },
    plugins:
      request.followUp === "task" && mountWorkflowPlugin
        ? [{ type: "local", path: workflowPluginDir() }]
        : [],
  }
}

function commonOptions(request: UsageReviewQueryRequest): Options {
  return {
    cwd: request.cwd,
    env: { ...request.env },
    model: request.model,
    systemPrompt: { type: "preset", preset: "claude_code", append: request.systemPromptAppend },
    strictMcpConfig: true,
    permissionMode: "dontAsk",
    settingSources: [],
    persistSession: false,
  }
}

/** この問い合わせの `speak`。セリフを `usage-review-speech` で流して `"ok"` を返す（会話のセリフの経路は通らない）。 */
function speakTool(
  expressions: readonly ExpressionChoice[],
  onEvent: (event: SessionEvent) => void,
) {
  return tool(
    SPEAK_TOOL_NAME,
    USAGE_REVIEW_SPEAK_DESCRIPTION,
    {
      text: z.string().describe("セリフ。1〜2文の短い一言"),
      expression: z
        .enum(expressionEnumForSpeak(expressions))
        .describe(expressionGuideForSpeak(expressions)),
    },
    async ({ text }) => {
      onEvent({ kind: "usage-review-speech", text })
      return { content: [{ type: "text" as const, text: "ok" }] }
    },
  )
}

/**
 * 見直しを受け取る2つのツール（`usage_review_stage` / `usage_review_result`）。
 * 形の検査はここの zod の形で、崩れた引数は handler に届かずに SDK が理由を返す。
 * 形の外の条と、受け付けたときにイベントを流すのは {@link UsageReviewIntake}。
 * 提案の件数の上限を zod に書かないのは、差し戻しの文面を core の1箇所で揃えるため。
 */
function usageReviewTools(intake: UsageReviewIntake) {
  return [
    tool(
      USAGE_REVIEW_STAGE_TOOL_NAME,
      USAGE_REVIEW_STAGE_TOOL_DESCRIPTION,
      {
        stage: z.enum(USAGE_REVIEW_STAGES).describe(usageReviewStageGuide()),
        days: USAGE_REVIEW_DAYS,
      },
      async ({ stage, days }) => ({
        content: [{ type: "text" as const, text: await intake.enterStage(stage, days) }],
      }),
    ),
    tool(
      USAGE_REVIEW_RESULT_TOOL_NAME,
      USAGE_REVIEW_RESULT_TOOL_DESCRIPTION,
      {
        days: USAGE_REVIEW_DAYS,
        headline: z.string().describe("冒頭の一言。キャラクターの口調で、見てきた結果を1〜2文で"),
        proposals: z
          .array(
            z.object({
              kind: z.enum(USAGE_PROPOSAL_KINDS).describe(usageProposalKindGuide()),
              target: z.string().describe("対象の名前（入れ方は kind の説明のとおり。無ければ空）"),
              impact: z
                .enum(USAGE_PROPOSAL_IMPACTS)
                .describe("効きめ。large（大）/ medium（中）/ small（小）"),
              title: z.string().describe("見出し。何を変えるかが分かる短い1行"),
              basis: z.string().describe("根拠。どの数から言っているか（記録の件数つき）"),
              action: z.string().describe("やること。利用者が何をすればよいか"),
              followUp: z
                .enum(USAGE_PROPOSAL_FOLLOW_UPS)
                .describe(
                  "押す口。delegate（tsukumo に頼む。その場で設定やファイルを直せば済む）/ task（タスクにする。あとでやる作業）",
                ),
            }),
          )
          .describe("提案。効きめの大きい順"),
      },
      async (findings) => {
        const verdict = await intake.submit(findings)
        return verdict.kind === "rejected"
          ? { content: [{ type: "text" as const, text: verdict.text }], isError: true }
          : { content: [{ type: "text" as const, text: "ok" }] }
      },
    ),
  ]
}
