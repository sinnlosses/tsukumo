// 印の付いたセッションの一覧を、このプロセスのメモリに持つ。
// 続きの選択と切り替え先の一覧は持っている一覧から出し、SDK の一覧を読み直すのは作ったときと `refresh` のときだけ。
// 持つのは印・ID・時刻・見出しだけで、会話の内容は持たない。

import type { SessionChoice } from "../../../shared/session/session-choice.ts"
import {
  listMarkedSessions,
  readTaggedSessions,
  selectSessionToResume,
  type TaggedSession,
  withSessionMark,
} from "./session-restore.ts"

export type SessionCatalog = {
  /** その印の続きから始めるセッション（無ければ undefined）。最初に読み終わるまでは待つ。 */
  readonly findToResume: (tag: string) => Promise<string | undefined>
  /** その印の、切り替え先として選べるセッション。最初に読み終わるまでは待つ。 */
  readonly listChoices: (tag: string) => Promise<readonly SessionChoice[]>
  /**
   * 一覧を読み直す。例外を投げない。
   * 読めなかったとき・後から始めた読み直しに追い越されたときは持っている一覧のままで、`kept` を返す。
   */
  readonly refresh: () => Promise<SessionCatalogRefresh>
  /** このプロセスが印を付けた（付け直した）ことを、持っている一覧へ写す。 */
  readonly noteMarked: (sessionId: string, tag: string) => void
}

/** 読み直した一覧を採ったか（`refreshed`）、持っている一覧のままか（`kept`）。 */
export type SessionCatalogRefresh = "refreshed" | "kept"

/** 何も読まず、続きも切り替え先も無い一覧（続きを探さない起こし方のとき）。 */
export const EMPTY_SESSION_CATALOG: SessionCatalog = {
  findToResume: () => Promise.resolve(undefined),
  listChoices: () => Promise.resolve([]),
  refresh: () => Promise.resolve("kept"),
  noteMarked: () => {},
}

/**
 * 一覧を1つ作り、その場で1回読み始める。
 * `read` は SDK の `listSessions` の結果（外来の値）を返す。投げたら読めなかったものとして扱う。
 * `now` は印を写すときの `lastModified` に使う。
 */
export function createSessionCatalog(options: {
  readonly read: () => Promise<unknown>
  readonly now: () => number
}): SessionCatalog {
  type Marked = { readonly sessionId: string; readonly tag: string; readonly at: number }
  type Reading =
    | { readonly kind: "read"; readonly sessions: readonly TaggedSession[] }
    | { readonly kind: "unreadable" }

  const readOnce = async (): Promise<Reading> => {
    try {
      return { kind: "read", sessions: readTaggedSessions(await options.read()) }
    } catch {
      return { kind: "unreadable" }
    }
  }

  let loaded: Promise<readonly TaggedSession[]> = readOnce().then((reading) =>
    reading.kind === "read" ? reading.sessions : [],
  )
  // 読み直した一覧にも写し直すので、付けた印は捨てない（このプロセスが印を付けたセッションの数だけ）。
  let marks: readonly Marked[] = []
  let refreshCount = 0

  const current = async (): Promise<readonly TaggedSession[]> => {
    const sessions = await loaded
    return marks.reduce(withSessionMark, sessions)
  }

  return {
    findToResume: async (tag) => selectSessionToResume(await current(), tag),
    listChoices: async (tag) => listMarkedSessions(await current(), tag),
    refresh: async () => {
      refreshCount += 1
      const started = refreshCount
      const reading = await readOnce()
      // 後から始めた読み直しが先に終わっていたら、古いほうは採らない。
      if (reading.kind !== "read" || started !== refreshCount) {
        return "kept"
      }
      loaded = Promise.resolve(reading.sessions)
      return "refreshed"
    },
    noteMarked: (sessionId, tag) => {
      marks = [...marks, { sessionId, tag, at: options.now() }]
    },
  }
}
