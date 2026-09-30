// `/rpc` と `/ws` の接続を許す条件。
// 起動トークンが合うこと、`Origin` があれば自分のオリジンと一致すること（無ければ通す。ブラウザ経由でない呼び出し）。
// 経路名は見ない。

export type ConnectionCredentials = {
  /** 要求の `?t=`。無ければ undefined。 */
  readonly presentedToken: string | undefined
  /** 要求の `Origin` ヘッダ。無ければ undefined。 */
  readonly requestOrigin: string | undefined
  readonly startupToken: string
  /** 自分のオリジン（`http://127.0.0.1:<port>`）。 */
  readonly serverOrigin: string
}

export function isConnectionGranted(credentials: ConnectionCredentials): boolean {
  if (credentials.presentedToken !== credentials.startupToken) {
    return false
  }
  return (
    credentials.requestOrigin === undefined ||
    credentials.requestOrigin === credentials.serverOrigin
  )
}
