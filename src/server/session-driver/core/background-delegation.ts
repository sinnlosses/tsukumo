// メインの Agent 呼び出しを背景に固定する。
// フォアグラウンドの委譲はツール呼び出しの中でメインを止め、`speak` を呼べなくなる。
// 引数の `run_in_background` だけを `true` にし、`prompt` など他のキーには触らない。
// サブエージェント内の呼び出し（`agentId` あり）は対象にしない。

import { isPlainObject } from "remeda"

export const AGENT_TOOL_NAME = "Agent"

export type BackgroundDelegation =
  | { readonly kind: "keep" }
  | { readonly kind: "rewrite"; readonly input: Readonly<Record<string, unknown>> }

export function pinToBackground(
  toolName: string,
  toolInput: unknown,
  inSubagent: boolean,
): BackgroundDelegation {
  if (
    toolName !== AGENT_TOOL_NAME ||
    inSubagent ||
    !isPlainObject(toolInput) ||
    toolInput.run_in_background === true
  ) {
    return { kind: "keep" }
  }
  return { kind: "rewrite", input: { ...toolInput, run_in_background: true } }
}
