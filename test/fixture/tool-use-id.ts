import { isToolUseId, type ToolUseId } from "../../src/shared/session/tool-use-id.ts"

/** ツール呼び出しの ID として通る文字列を検査済みの型にする。通らない文字列を渡したテストの書き間違いは throw で落とす。 */
export function checkedToolUseId(value: string): ToolUseId {
  if (!isToolUseId(value)) {
    throw new Error(`ツール呼び出しの ID として通らない: ${value}`)
  }
  return value
}

/** 無い（undefined）はそのまま返し、ある文字列は {@link checkedToolUseId} で検査済みの型にする。 */
export function checkedOptionalToolUseId(value?: string): ToolUseId | undefined {
  return value === undefined ? undefined : checkedToolUseId(value)
}
