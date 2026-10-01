// 疑似セッションの続き。名指しの場面が持つ過去の transcript を、続きとして探す・組み直す。
// transcript は疑似セッションに手書きした架空のメッセージ列で、組み直しは本物と同じ変換を通る。

import type { Expression } from "../../../shared/character-pack/expression.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { SessionCatalog } from "../core/session-catalog.ts"
import { toRestoredEvents } from "../core/session-restore.ts"
import type { FakeSession } from "./fake-driver.ts"

/**
 * 名指しの場面が `resume` に過去の transcript を指しているときだけ、それを続きにする一覧。
 * 印は見ない。切り替え先の一覧は常に空。
 */
export function createFakeSessionCatalog(
  session: FakeSession,
  scene: string | undefined,
): SessionCatalog {
  const resume = session.turns.find((candidate) => candidate.name === scene)?.resume
  const sessionId = session.pastSessions.find((past) => past.sessionId === resume)?.sessionId
  return {
    findToResume: () => Promise.resolve(sessionId),
    listChoices: () => Promise.resolve([]),
    refresh: () => Promise.resolve("kept"),
    noteMarked: () => {},
  }
}

/** 過去の transcript を画面の履歴の組み直しに通す。知らない ID は空。 */
export function readFakeRestoredEvents(
  session: FakeSession,
  sessionId: string,
  expressions: readonly Expression[],
): readonly SessionEvent[] {
  const past = session.pastSessions.find((candidate) => candidate.sessionId === sessionId)
  return past === undefined ? [] : toRestoredEvents(past.messages, expressions)
}
