// セッションの ID を、パスに組んでよい形として検査した型。

import { z } from "zod"

/** セッションの ID の長さの上限。UUID を通せる素朴な上限。 */
const MAX_SESSION_ID_LENGTH = 200

/**
 * 英小文字・数字・`-` だけで綴った、{@link MAX_SESSION_ID_LENGTH} 字以下のセッションの ID。
 * SDK が振る UUID と、疑似の駆動が振る `fake-session` の両方が通る。作れるのは {@link isSessionId} を通した文字列だけ。
 */
export type SessionId = string & { readonly __brand: "SessionId" }

/** 契約でセッションの ID を受ける schema。出力は {@link SessionId}。 */
export const sessionIdSchema = z.string().refine(isSessionId)

const SESSION_ID_PATTERN = /^[0-9a-z-]+$/u

/** セッションの ID の綴りなら検査済みの型にして返す。受け取った文字列をパスにしないための門。 */
export function parseSessionId(value: string): SessionId | undefined {
  return isSessionId(value) ? value : undefined
}

/** セッションの ID の綴りか。型ガードなので、通した値は {@link SessionId} になる。 */
export function isSessionId(value: string): value is SessionId {
  return value.length <= MAX_SESSION_ID_LENGTH && SESSION_ID_PATTERN.test(value)
}
