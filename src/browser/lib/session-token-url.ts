// 経路に起動トークン（`SESSION_TOKEN_QUERY_NAME`）を足した URL を組み立てる。トークンは**今開いて
// いるページの URL から**読む（`showView` に渡す URL に乗って配られたもの。docs/design.md 9章
// 「起動トークン」）。読み方が5か所に散っていた（`/ws`・`/repository-file`・`/token-usage`・
// `/context-usage`・`/prompt-image/<id>` の各口）ので、ここへ寄せた。
//
// トークンが無いとき（未起動のページを直接開いたときなど）は空文字を送る。サーバ側
// （`src/server/view-server/adapter/server.ts` の `hasStartupToken`）が拒む側を持っているので、ここでは
// 「無い」を握りつぶさずそのまま伝える。
//
// **`/ws` の `ws:` / `wss:` への差し替えはこの関数の外。** `lib/socket.ts` がプロトコルと
// ホストを組み立ててから、この関数が返した経路とクエリをそのまま続ける（この関数はどの経路も
// 相対パス+クエリの文字列としてしか知らない）。それ以外の4か所は `fetch` / `<img src>` に
// そのまま渡せる。

import { SESSION_TOKEN_QUERY_NAME } from "../../shared/session-socket.ts"

/**
 * `path` に起動トークンと追加のクエリ（あれば）を付けた URL を返す。追加のクエリは
 * `/token-usage` の `days` のように、経路ごとに違うものだけを呼び出し側が渡す。
 */
export function sessionTokenUrl(
  path: string,
  extraQuery?: Readonly<Record<string, string>>,
): string {
  const token = new URL(window.location.href).searchParams.get(SESSION_TOKEN_QUERY_NAME) ?? ""
  const query = new URLSearchParams({ [SESSION_TOKEN_QUERY_NAME]: token, ...extraQuery })
  return `${path}?${query.toString()}`
}
