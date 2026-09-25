// 押し出し（フレーム）の購読の契約（`docs/glossary.md`「契約」「フレーム」）。受け手は
// `src/server/view-server/adapter/frame-procedure.ts`。**コマンドではない**ので断る条件（`meta`）も
// `REFUSED` も持たず、`/ws` の束（`src/shared/rpc.ts` の `socketContract`）でだけコマンドと並ぶ。
//
// **会話の内容が乗る**（`hello` の `state` と `events`）。

import { eventIterator, oc, type } from "@orpc/contract"

import { type ServerFrame } from "../frame.ts"

export const frameContract = {
  /**
   * 接続ごとに1回呼ぶ購読。**最初の1つは必ず `hello`**（いまの姿の snapshot）で、以後 `events`
   * （と、起こし直したときの `hello`・開発中の `refresh`）が届いた順に流れる。切れたらつなぎ直して
   * 呼び直し、新しい `hello` で状態を置き換える（`docs/design.md` 3章「再接続」）。
   *
   * **出力はサーバでは検証しない**（`type` は型だけを運ぶ）。押す側は型の付いた値を組み立てるだけで、
   * 封筒を zod で見るのは受け取るブラウザの1箇所（`parseServerFrame`。`docs/design.md` 4章）。
   *
   * **この名前（`frame.subscribe`）と `hello` の封筒は版をまたいで変えない**——古いタブが新しい
   * プロセスへつなぎ直したとき、`hello` の `protocolVersion` を読めることが「読み込み直して
   * ください」を出す唯一の道だから（`docs/design.md` 4.4）。
   */
  subscribe: oc.output(eventIterator(type<ServerFrame>())),
}
