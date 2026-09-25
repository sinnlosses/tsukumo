// 部品のテストが本物の WebSocket 接続を経由せず姿を差し込むための store
// （`src/browser/stores/session.tsx` の `createSessionStore` をそのまま使い、`hello` フレームで
// 姿を入れる。テストのための口を `src/` 側に増やさない）。
//
// フィクスチャの中身は各テストが持つ（ここは組み立てだけ。会話の実物は使わない。
// docs/coding-standards.md「会話内容の扱い」）。

import { isPlainObject } from "remeda"

import { createSessionStore, type SessionStore } from "../../src/browser/stores/session.tsx"
import { PROTOCOL_VERSION } from "../../src/shared/frame.ts"
import { type SessionState } from "../../src/shared/session-state.ts"

/**
 * 部品が送ったコマンドの受け取り口。**手続きの名前（`session.prompt` のように `.` で繋いだもの）を
 * `procedure` に、入力のフィールドを同じ階層に平らに並べた記録**を受け取る（入力の無い手続きは
 * `procedure` だけ）。
 */
export type CommandSpy = (command: SentCommand) => void

/** 送られたコマンド1件の記録。 */
export type SentCommand = { readonly procedure: string } & Readonly<Record<string, unknown>>

/** 姿を差し込んだ store。送られたコマンドは `spy` へ渡る。 */
export function sessionStoreWith(state: SessionState, spy: CommandSpy = () => {}): SessionStore {
  const store = createSessionStore()
  store.attachSocket({
    commandLink: {
      call: (path, input) => {
        spy({ procedure: path.join("."), ...(isPlainObject(input) ? input : {}) })
        return Promise.resolve(undefined)
      },
    },
  })
  putState(store, state)
  return store
}

/** 姿を丸ごと入れ替える（サーバが繋ぎ直しのたびに押す `hello` と同じ経路）。 */
export function putState(store: SessionStore, state: SessionState): void {
  store.receive({
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    state,
  })
}
