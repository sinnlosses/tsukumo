// 部品のテストが本物の WebSocket 接続を経由せず、`useSession` の store へ姿を差し込む口。
// 姿は `hello` フレームで入れる（サーバが繋ぎ直しのたびに押すのと同じ経路）。
//
// フィクスチャの中身は各テストが持つ（ここは組み立てだけ。会話の実物は使わない。
// docs/coding-standards.md「会話内容の扱い」）。

import { act } from "@testing-library/react"
import { isPlainObject } from "remeda"

import { useSession } from "../../src/browser/stores/session.ts"
import { PROTOCOL_VERSION } from "../../src/shared/frame.ts"
import type { SessionState } from "../../src/shared/session-state.ts"

/**
 * 部品が送ったコマンドの受け取り口。手続きの名前（`session.prompt` のように `.` で繋いだもの）を
 * `procedure` に、入力のフィールドを同じ階層に平らに並べた記録を受け取る（入力の無い手続きは
 * `procedure` だけ）。
 */
export type CommandSpy = (command: SentCommand) => void

/** 送られたコマンド1件の記録。 */
export type SentCommand = { readonly procedure: string } & Readonly<Record<string, unknown>>

/**
 * store を初期の姿に戻してから `state` を入れる。送られたコマンドは `spy` へ渡る。
 * store はモジュールに1つなので、前のテストの姿と送り先を持ち越さないよう、テストごとに呼ぶ。
 * 同じテストの中で先に描いた部品が残っていても描き直しが `act` の外に漏れないよう、`act` で包む。
 */
export function putSession(state: SessionState, spy: CommandSpy = () => {}): void {
  act(() => {
    useSession.setState(useSession.getInitialState(), true)
    useSession.getState().attachSocket({
      commandLink: {
        call: (path, input) => {
          spy({ procedure: path.join("."), ...(isPlainObject(input) ? input : {}) })
          return Promise.resolve(undefined)
        },
      },
    })
    putState(state)
  })
}

/** 姿を丸ごと入れ替える（送り先はそのまま）。 */
export function putState(state: SessionState): void {
  useSession.getState().receive({
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    state,
  })
}
