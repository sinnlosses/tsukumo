// Bash の呼び出しの `command` だけを別の文字列に差し替える。他のキーには触らない。
// 差し替え先を決めるのは呼び出し側が渡す関数で、`undefined` を返したら元のまま通す。

import { isPlainObject } from "remeda"

import type { ToolVerdict } from "../../core/tool-verdict.ts"

const BASH_TOOL_NAME = "Bash"

/** `command` を `rewrite` で差し替える判定。Bash でない・`command` が文字列でない・差し替えが無い・同じ文字列なら `allow`。 */
export async function rewriteBashCommand(
  toolName: string,
  toolInput: unknown,
  rewrite: (command: string) => Promise<string | undefined>,
): Promise<ToolVerdict> {
  if (toolName !== BASH_TOOL_NAME || !isPlainObject(toolInput)) {
    return { kind: "allow" }
  }
  const { command } = toolInput
  if (typeof command !== "string" || command.trim() === "") {
    return { kind: "allow" }
  }
  const rewritten = await rewrite(command)
  return rewritten === undefined || rewritten === command
    ? { kind: "allow" }
    : { kind: "rewrite", input: { ...toolInput, command: rewritten } }
}
