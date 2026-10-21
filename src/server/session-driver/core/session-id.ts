// SDK が振るセッションの ID を、パスに組んでよい形として検査した型。

/** UUID の綴り（小文字の16進）として検査したセッションの ID。作れるのは {@link parseSessionId} だけ。 */
export type SessionId = string & { readonly __brand: "SessionId" }

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** UUID の綴りなら検査済みの型にして返す。受け取った文字列をパスにしないための門。 */
export function parseSessionId(value: string): SessionId | undefined {
  return hasSessionIdShape(value) ? value : undefined
}

function hasSessionIdShape(value: string): value is SessionId {
  return SESSION_ID_PATTERN.test(value)
}
