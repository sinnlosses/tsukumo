// 押し出し（フレーム）の購読の契約。
// コマンドではないので断る条件（`meta`）も `REFUSED` も持たず、`/ws` の束（`socketContract`）でだけコマンドと並ぶ。

import { eventIterator, oc, type } from "@orpc/contract"

import type { ServerFrame } from "../frame.ts"

export const frameContract = {
  /**
   * 接続ごとに1回呼ぶ購読。
   * 最初の1つは必ず `hello`（いまの姿の snapshot）で、以後 `events`（と、起こし直したときの `hello`・開発中の `refresh`）が届いた順に流れる。
   * 切れたらつなぎ直して呼び直し、新しい `hello` で状態を置き換える。
   *
   * 出力はサーバでは検証しない（`type` は型だけを運ぶ）。封筒を zod で見るのは受け取るブラウザの1箇所（`parseServerFrame`）。
   *
   * この名前（`frame.subscribe`）と `hello` の封筒は版をまたいで変えない。
   * 古いタブが新しいプロセスへつなぎ直したとき、`hello` の `protocolVersion` を読めることが「読み込み直してください」を出す唯一の道だから。
   */
  subscribe: oc.output(eventIterator(type<ServerFrame>())),
}
