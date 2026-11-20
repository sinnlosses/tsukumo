// 部品のテストが本物の WebSocket 接続を経由せず、`useSession` の store へ姿を差し込む口。
// 姿は `hello` フレームで入れる（サーバが繋ぎ直しのたびに押すのと同じ経路）。
//

import { act } from "@testing-library/react"
import { isPlainObject } from "remeda"

import { useSession } from "../../src/browser/stores/session.ts"
import { PROTOCOL_VERSION } from "../../src/shared/frame.ts"
import {
  BUILTIN_GEAR_PREFERENCES,
  gearPreferenceChangeSchema,
  type GearPreferences,
} from "../../src/shared/session/gear-preference.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../src/shared/session/session-state.ts"

/**
 * 部品が送ったコマンドを受け取る関数。手続きの名前（`session.prompt` のように `.` で繋いだもの）を
 * `procedure` に、入力のフィールドを同じ階層に平らに並べた記録を受け取る（入力の無い手続きは
 * `procedure` だけ）。Promise を返すと手続きの結果になり、reject すれば断りを再現できる。
 */
export type CommandSpy = (command: SentCommand) => unknown

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
          return Promise.resolve(
            spy({ procedure: path.join("."), ...(isPlainObject(input) ? input : {}) }),
          )
        },
      },
    })
    useSession.getState().setConnection("open")
    putState(state)
  })
}

/**
 * 姿を丸ごと入れ替える（送り先はそのまま）。
 * `hello` の歯車の設定はページが畳まないので、`state` に歯車の設定があれば `gear-preferences-changed` で続けて届ける。
 */
export function putState(state: SessionState): void {
  const { receive } = useSession.getState()
  receive({ type: "hello", protocolVersion: PROTOCOL_VERSION, state })
  if (state.gearPreferences !== undefined) {
    receive({
      type: "events",
      events: [
        {
          at: 0,
          event: { kind: "gear-preferences-changed", gearPreferences: state.gearPreferences },
        },
      ],
    })
  }
}

/** いまの姿のうち、歯車の設定だけを同梱の既定に `patch` を重ねた値へ差し替える（`gear-preferences-changed` が届いたのと同じ姿）。 */
export function putGearPreferences(patch: Partial<GearPreferences>): void {
  act(() => {
    putState({
      ...useSession.getState().state,
      gearPreferences: { ...BUILTIN_GEAR_PREFERENCES, ...patch },
    })
  })
}

/**
 * `session.setGearPreference` を受けたら、サーバと同じく書いたあとの5欄を `gear-preferences-changed` で返す送り先。
 * 送ったコマンドは `sent` にも溜める。
 */
export function echoGearPreference(sent: SentCommand[] = []): CommandSpy {
  return (command) => {
    sent.push(command)
    const change = gearPreferenceChangeSchema.safeParse(command)
    if (command.procedure !== "session.setGearPreference" || !change.success) {
      return
    }
    const current = useSession.getState().state.gearPreferences ?? BUILTIN_GEAR_PREFERENCES
    useSession.getState().receive({
      type: "events",
      events: [
        {
          at: 0,
          event: {
            kind: "gear-preferences-changed",
            gearPreferences: { ...current, [change.data.field]: change.data.value },
          },
        },
      ],
    })
  }
}

/** 姿の世代を替えずに、届いた記録などで姿が進んだことを再現する。 */
export function advanceState(state: SessionState): void {
  useSession.setState({ state })
}

/** 初期の姿のうち `patch` に書いたところだけを差し替えた姿。 */
export function stateWith(patch: Partial<SessionState>): SessionState {
  return { ...INITIAL_SESSION_STATE, ...patch }
}
