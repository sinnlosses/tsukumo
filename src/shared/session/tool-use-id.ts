// ツール呼び出しの ID（SDK の `tool_use` の `id`）を、空でないと検査した型。

/**
 * 空でないツール呼び出しの ID。SDK が `tool_use` に振る `id` と、疑似の駆動が振る `fake-…` の両方が通る。
 * 委譲先を指す ID（委譲した Agent ツールの呼び出しの ID）もこの型で、何を指すかは欄の名前で分ける。
 * 作れるのは {@link isToolUseId} を通した文字列だけ。
 */
export type ToolUseId = string & { readonly __brand: "ToolUseId" }

/** ツール呼び出しの ID なら検査済みの型にして返す。文字列でない値・空の文字列は undefined。 */
export function parseToolUseId(value: unknown): ToolUseId | undefined {
  return typeof value === "string" && isToolUseId(value) ? value : undefined
}

/** ツール呼び出しの ID か。型ガードなので、通した値は {@link ToolUseId} になる。 */
export function isToolUseId(value: string): value is ToolUseId {
  return value.length > 0
}
