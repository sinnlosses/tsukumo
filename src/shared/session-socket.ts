// WebSocket の経路名とトークンのクエリ名。**サーバ（`adapter/server.ts` が upgrade を受け付ける）と
// ブラウザ（`browser/socket.ts` が繋ぎに行く）の両方が同じ値を見る**ので、shared に置く
// （docs/design.md 4章と同じ考え方。ここは値だけで `node:` にも `document` にも触らない）。
//
// 前は `adapter/server.ts` と `browser/socket.ts` がそれぞれ同じ値を再掲していた（import で共有できない
// ため）。ここへ集めたので、両側とも import して使う。

/** WebSocket の経路。 */
export const SESSION_SOCKET_PATH = "/ws"

/** 起動トークンを載せるクエリの名前（`/ws?t=<token>`）。 */
export const SESSION_TOKEN_QUERY_NAME = "t"
