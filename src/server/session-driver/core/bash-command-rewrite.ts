// Bash の呼び出しの `command` だけを別の文字列に差し替える。他のキーには触らない。
// 差し替え先を決めるのは呼び出し側が渡す関数で、`undefined` を返したら元のまま通す。

import { isPlainObject } from "remeda"

const BASH_TOOL_NAME = "Bash"

/** `command` を `rewrite` で差し替えた入力。Bash でない・`command` が文字列でない・差し替えが無い・同じ文字列なら `undefined`。 */
export async function rewriteBashCommand(
  toolName: string,
  toolInput: unknown,
  rewrite: (command: string) => Promise<string | undefined>,
): Promise<Readonly<Record<string, unknown>> | undefined> {
  if (toolName !== BASH_TOOL_NAME || !isPlainObject(toolInput)) {
    return undefined
  }
  const { command } = toolInput
  if (typeof command !== "string" || command.trim() === "") {
    return undefined
  }
  const rewritten = await rewrite(command)
  return rewritten === undefined || rewritten === command
    ? undefined
    : { ...toolInput, command: rewritten }
}
