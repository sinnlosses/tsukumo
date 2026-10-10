// 疑似セッションの続き。名指しの場面が持つ過去の transcript を、続きとして探す・組み直す。
// transcript は疑似セッションに手書きした架空のメッセージ列で、組み直しは本物と同じ変換を通る。

import type { Expression } from "../../../shared/character-pack/expression.ts"
import type { RestoredEvent } from "../../../shared/session/session-event.ts"
import { worktreeNameOf, type SessionCatalog } from "../core/session-catalog.ts"
import { readSessionMark } from "../core/session-mark.ts"
import { toRestoredEvents } from "../core/session-restore.ts"
import type { FakeSession } from "./fake-driver.ts"

/**
 * 名指しの場面が `resume` に過去の transcript を指しているときだけ、それを切り替え先の1件に出す一覧。
 * 印の目印（ポート）は渡された印のものを使い、行は起こした作業ディレクトリ `cwd` のいまの作業ツリーの行にする。
 */
export function createFakeSessionCatalog(
  session: FakeSession,
  scene: string | undefined,
  cwd: string,
): SessionCatalog {
  const resume = session.turns.find((candidate) => candidate.name === scene)?.resume
  const sessionId = session.pastSessions.find((past) => past.sessionId === resume)?.sessionId
  const worktree = worktreeNameOf(cwd, undefined)
  return {
    listChoices: (tag) => {
      const viewPort = readSessionMark(tag)?.viewPort
      return Promise.resolve(
        sessionId === undefined || viewPort === undefined || worktree === undefined
          ? []
          : [
              {
                viewPort,
                sessionId,
                lastModified: 0,
                startedAt: 0,
                heading: undefined,
                worktree,
                inCurrentWorktree: true,
              },
            ],
      )
    },
    refresh: () => Promise.resolve("kept"),
    noteMarked: () => {},
  }
}

/** 過去の transcript を画面の履歴の組み直しに通す。知らない ID は空。 */
export function readFakeRestoredEvents(
  session: FakeSession,
  sessionId: string,
  expressions: readonly Expression[],
): readonly RestoredEvent[] {
  const past = session.pastSessions.find((candidate) => candidate.sessionId === sessionId)
  return past === undefined ? [] : toRestoredEvents(past.messages, expressions)
}
