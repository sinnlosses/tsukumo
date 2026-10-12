// session-state のテストが共有する、畳み込みの道具。

import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../src/shared/session/session-state.ts"

// 時刻に依らないテストでは `now` を固定の 0 で流す（時刻を見る畳み込みは
// applySessionEvent を直接呼び、進める時刻を明示する）。
export function apply(...events: readonly SessionEvent[]): SessionState {
  return events.reduce((view, event) => applySessionEvent(view, event, 0), INITIAL_SESSION_STATE)
}

/**
 * `state.session` が `running`（`init` 済みで `permissionMode` も分かっている）である前提で
 * 取り出す。まだなら失敗させる。`running` という名前は他のテストがローカル変数として
 * 使っている（ツールが動いている状態の意味）ので、ここでは衝突しないよう `runningSession`
 * にする。`model` はここに無い（`SessionState.model` を直接読む。`session` の外にある
 * 理由は `SessionInfo` 冒頭のコメント）。
 */
export function runningSession(
  state: SessionState,
): Extract<SessionState["session"], { kind: "running" }> {
  if (state.session.kind !== "running") {
    throw new Error("session-info がまだ届いていない、または permissionMode が未確定")
  }
  return state.session
}

/** `sessionId` が分かっている（`identified` か `running`）ときだけ返す。まだなら undefined。 */
export function sessionIdOf(state: SessionState): string | undefined {
  return state.session.kind === "starting" ? undefined : state.session.sessionId
}
