// メインの Agent 呼び出しを背景に固定する。
// フォアグラウンドの委譲はツール呼び出しの中でメインを止め、`speak` を呼べなくなる。
// 引数の `run_in_background` だけを `true` にし、`prompt` など他のキーには触らない。
// サブエージェント内の呼び出し（`agentId` あり）は対象にしない。

import { isPlainObject } from "remeda"

import type { ToolVerdict } from "../../core/tool-verdict.ts"

const AGENT_TOOL_NAME = "Agent"

export function pinToBackground(
  toolName: string,
  toolInput: unknown,
  inSubagent: boolean,
): ToolVerdict {
  if (
    toolName !== AGENT_TOOL_NAME ||
    inSubagent ||
    !isPlainObject(toolInput) ||
    toolInput.run_in_background === true
  ) {
    return { kind: "allow" }
  }
  return { kind: "rewrite", input: { ...toolInput, run_in_background: true } }
}
