// コマンドの受け手に見せるセッションの口。
// 断る条件は契約の `meta` にあり、見るのは `rpcGuard`。
// ここは口の形と `session` の行の型、行を呼ぶ `receiveSessionCommand` と、モードの直前のセッションを覚え直す `rememberedModeSessions` だけを持つ。

import type { SessionState } from "../../../shared/session/session-state.ts"
import {
  type DispatchResult,
  type FeatureReceiver,
  receiveFeatureCommand,
} from "../../core/command-receiver.ts"
import { parseSessionId } from "../../session-driver/core/session-id.ts"
import type {
  CommandSession,
  RememberedSession,
  SessionLaunchRequest,
} from "./command-session-port.ts"

export type ModeSessions = {
  readonly work: RememberedSession
  readonly chat: RememberedSession
}

export const NO_MODE_SESSIONS: ModeSessions = { work: { kind: "none" }, chat: { kind: "none" } }

/**
 * セッションの口を受け取る行。型がここにあるので、`session` の表にだけ書ける。
 * 受け手が投げても常駐プロセスは落とさず、自分で定型文の理由に畳む。
 */
export type SessionReceiver<C> = {
  readonly kind: "session"
  readonly receive: (input: C, session: CommandSession) => Promise<DispatchResult>
}

/** `session` の表の行（3種。葉の機能と同じ `write` / `call` も書ける）。 */
export type CommandReceiver<C> = FeatureReceiver<C> | SessionReceiver<C>

/** `session` の表の行を1件呼ぶ（行の種類で呼び方を分けるだけ）。 */
export function receiveSessionCommand<C>(
  receiver: CommandReceiver<C>,
  input: C,
  session: CommandSession,
): Promise<DispatchResult> {
  return receiver.kind === "session"
    ? receiver.receive(input, session)
    : receiveFeatureCommand(receiver, input, session)
}

/**
 * モードを切り替える起こし直しのときだけ、いま出しているセッションをいまのモードの欄へ書く。
 * パックを名指しする起こし直しでは捨てる（セッションの印はパックごとなので、別のパックで続きにできない）。
 */
export function rememberedModeSessions(
  modeSessions: ModeSessions,
  state: SessionState,
  request: SessionLaunchRequest,
): ModeSessions {
  if (request.selection.by === "name") {
    return NO_MODE_SESSIONS
  }
  if (request.chat === state.chatMode || state.session.kind === "starting") {
    return modeSessions
  }
  const sessionId = parseSessionId(state.session.sessionId)
  if (sessionId === undefined) {
    return modeSessions
  }
  const remembered = { kind: "remembered", sessionId } as const
  return state.chatMode
    ? { ...modeSessions, chat: remembered }
    : { ...modeSessions, work: remembered }
}
