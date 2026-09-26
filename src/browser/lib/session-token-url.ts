// 経路に起動トークン（`SESSION_TOKEN_QUERY_NAME`）を足した URL を組み立てる。トークンは今開いて
// いるページの URL から読む（`showView` に渡す URL に乗って配られたもの。docs/design.md 9章
// 「起動トークン」）。読み方が散っていた（`/ws`・`/rpc`・`/prompt-image/<id>` の各口）ので、
// ここへ寄せた。
//
// トークンが無いとき（未起動のページを直接開いたときなど）は空文字を送る。サーバ側
// （`/prompt-image` は `src/server/view-server/adapter/server.ts` の `hasStartupToken`、`/rpc` は
// `rpc-guard.ts`）が拒む側を持っているので、ここでは「無い」を握りつぶさずそのまま伝える。
//
// `/ws` の `ws:` / `wss:` への差し替えはこの関数の外。 `lib/socket.ts` がプロトコルと
// ホストを組み立ててから、この関数が返した経路とクエリをそのまま続ける（この関数はどの経路も
// 相対パス+クエリの文字列としてしか知らない）。`/prompt-image` は `<img src>` にそのまま渡し、
// `/rpc` は `lib/rpc-client.ts` が今のページの URL を基準に絶対 URL にする。

import { SESSION_TOKEN_QUERY_NAME } from "../../shared/session-socket.ts"

/** `path` に起動トークンを付けた URL を返す。 */
export function sessionTokenUrl(path: string): string {
  const token = new URL(window.location.href).searchParams.get(SESSION_TOKEN_QUERY_NAME) ?? ""
  const query = new URLSearchParams({ [SESSION_TOKEN_QUERY_NAME]: token })
  return `${path}?${query.toString()}`
}
