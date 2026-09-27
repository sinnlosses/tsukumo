// 経路に起動トークン（`SESSION_TOKEN_QUERY_NAME`）を足した URL を組み立てる。トークンは今開いて
// いるページの URL から読む（`showView` に渡す URL に乗って配られたもの）。
//
// トークンが無いとき（未起動のページを直接開いたときなど）は空文字を送る。拒むのはサーバ側
// （`hasStartupToken`・`rpcGuard`）なので、ここでは「無い」を握りつぶさずそのまま伝える。
//
// 返すのは相対パス+クエリだけで、プロトコルとホストは付けない。

import { SESSION_TOKEN_QUERY_NAME } from "../../shared/session-socket.ts"

/** `path` に起動トークンを付けた URL を返す。 */
export function sessionTokenUrl(path: string): string {
  const token = new URL(window.location.href).searchParams.get(SESSION_TOKEN_QUERY_NAME) ?? ""
  const query = new URLSearchParams({ [SESSION_TOKEN_QUERY_NAME]: token })
  return `${path}?${query.toString()}`
}
