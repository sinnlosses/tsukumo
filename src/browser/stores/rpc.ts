// 画面全体で共有する手続きの口。今のページの URL と `fetch` を読んで `createRpc` に渡す、読む側の置き場。

import { RPC_PATH } from "../../shared/rpc.ts"
import { createRpc } from "../domain/rpc.ts"
import { sessionTokenUrl } from "../domain/session-token-url.ts"

export const rpc = createRpc({
  resolveUrl: () =>
    new URL(sessionTokenUrl(RPC_PATH, window.location.href), window.location.href).href,
  // `fetch` も呼ぶたびに引く。client はモジュールに1つだけ置くので、握ったままだとページが後から差し替えた `fetch` を使わない。
  fetch: (request, init) => globalThis.fetch(request, init),
})
