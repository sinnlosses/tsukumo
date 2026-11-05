// `speak` の引数（セリフと表情）を、tsukumo 内部の `speech` イベントに変換する。
// 引数は外部由来の値なので、unknown で受けて検証する。

import type { Expression } from "../../../../shared/character-pack/expression.ts"
import type { SessionEvent } from "../../../../shared/session/session-event.ts"
import { SPEAK_TOOL_NAME, tsukumoToolFullName } from "../../../core/tsukumo-tool-name.ts"
import { speakInputSchema } from "./speak-input.ts"

export function speechEvents(
  input: unknown,
  expressions: readonly Expression[],
): readonly Extract<SessionEvent, { readonly kind: "speech" }>[] {
  const parsed = speakInputSchema(expressions).safeParse(input)
  if (!parsed.success) {
    return []
  }

  return [{ kind: "speech", text: parsed.data.text, expression: parsed.data.expression }]
}

/** モデルから見えるツールのフルネーム。MCP サーバ名とツール名から決まる。 */
export function speakToolFullName(): string {
  return tsukumoToolFullName(SPEAK_TOOL_NAME)
}
