// 部品のテストが本物の WebSocket 接続を経由せず姿を差し込むための store
// （`src/browser/stores/session.tsx` の `createSessionStore` をそのまま使い、`hello` フレームで
// 姿を入れる。テストのための口を `src/` 側に増やさない）。
//
// フィクスチャの中身は各テストが持つ（ここは組み立てだけ。会話の実物は使わない。
// docs/coding-standards.md「会話内容の扱い」）。

import { createSessionStore, type SessionStore } from "../../src/browser/stores/session.tsx"
import { type ClientCommand } from "../../src/shared/command.ts"
import { PROTOCOL_VERSION } from "../../src/shared/frame.ts"
import { type SessionState } from "../../src/shared/session-state.ts"

/** 部品が送ったコマンド（毎回変わる `commandId` を落としたもの）の受け取り口。 */
export type CommandSpy = (command: unknown) => void

/** 姿を差し込んだ store。送られたコマンドは `spy` へ渡る。 */
export function sessionStoreWith(state: SessionState, spy: CommandSpy = () => {}): SessionStore {
  const store = createSessionStore()
  store.attachSocket({
    send: (command) => {
      spy(withoutCommandId(command))
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
    sessionId: "fictional-session",
    state,
  })
}

/** `commandId` は送るたびに新しく振られるので、テストが見るのは残りだけにする。 */
function withoutCommandId(command: ClientCommand): Record<string, unknown> {
  return Object.fromEntries(Object.entries(command).filter(([key]) => key !== "commandId"))
}
