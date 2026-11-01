// セッションの ID を、パスに組んでよい形として検査した型。

import { MAX_SESSION_ID_LENGTH } from "../../../shared/session/session-choice.ts"

/**
 * 英小文字・数字・`-` だけで綴った、{@link MAX_SESSION_ID_LENGTH} 字以下のセッションの ID。
 * SDK が振る UUID と、疑似の駆動が振る `fake-session` の両方が通る。作れるのは {@link parseSessionId} だけ。
 */
export type SessionId = string & { readonly __brand: "SessionId" }

const SESSION_ID_PATTERN = /^[0-9a-z-]+$/u

/** セッションの ID の綴りなら検査済みの型にして返す。受け取った文字列をパスにしないための門。 */
export function parseSessionId(value: string): SessionId | undefined {
  return hasSessionIdShape(value) ? value : undefined
}

function hasSessionIdShape(value: string): value is SessionId {
  return value.length <= MAX_SESSION_ID_LENGTH && SESSION_ID_PATTERN.test(value)
}
