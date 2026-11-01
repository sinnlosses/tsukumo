import { parseSessionId, type SessionId } from "../../src/server/session-driver/core/session-id.ts"

/** セッションの ID として通る文字列を検査済みの型にする。通らない文字列を渡したテストの書き間違いは throw で落とす。 */
export function checkedSessionId(value: string): SessionId {
  const id = parseSessionId(value)
  if (id === undefined) {
    throw new Error(`セッションの ID として通らない: ${value}`)
  }
  return id
}
