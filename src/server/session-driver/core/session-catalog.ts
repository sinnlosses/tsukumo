// 印の付いたセッションの一覧を、このプロセスのメモリに持つ。
// 続きの選択と切り替え先の一覧は持っている一覧から出し、SDK の一覧を読み直すのは作ったときと `refresh` のときだけ。
// 持つのは印・ID・時刻・見出しだけで、会話の内容は持たない。

import { isPlainObject } from "remeda"

import { MAX_SESSION_CHOICES, type SessionChoice } from "../../../shared/session/session-choice.ts"
import type { Config } from "../../core/config.ts"
import { readSessionMark } from "./session-mark.ts"

/** 印の付いたセッション1件（目印まで揃えた印つき）。 */
export type TaggedSession = SessionChoice & {
  /** 目印まで揃えた印（{@link readSessionMark} が返す `tag`）。 */
  readonly tag: string
}

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

/**
 * 続きを探す起こし方かどうか。探さないときは、切り替え先の一覧も空、続きも `{ kind: "new" }` にする。
 * `TSUKUMO_NEW_SESSION=1` は探さない。新規に起こすと決めているときに続きを探しても無駄。
 * fake driver は疑似セッションの名指しの場面が続きを持つときだけ探す（探す先は fake の一覧が決める）。
 */
export function canResume(config: Pick<Config, "newSession">): boolean {
  return !config.newSession
}

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
  // セッションごとに最新の印だけを持つ。読み直した一覧に載った印は捨てる。
  let marks: ReadonlyMap<string, Marked> = new Map()
  let refreshCount = 0

  const current = async (): Promise<readonly TaggedSession[]> => {
    const sessions = await loaded
    return [...marks.values()].reduce(withSessionMark, sessions)
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
      marks = unreflectedMarks(marks, reading.sessions)
      return "refreshed"
    },
    noteMarked: (sessionId, tag) => {
      if (readSessionMark(tag) === undefined) {
        return
      }
      marks = new Map(marks).set(sessionId, { sessionId, tag, at: options.now() })
    },
  }
}

/** 一覧にまだ載っていない印だけを残す。載っているとは、同じ ID で同じ印・最終更新が印を付けた時刻以降のこと。 */
function unreflectedMarks<Marked extends { readonly tag: string; readonly at: number }>(
  marks: ReadonlyMap<string, Marked>,
  sessions: readonly TaggedSession[],
): ReadonlyMap<string, Marked> {
  const listed = new Map(sessions.map((session) => [session.sessionId, session]))
  return new Map(
    [...marks].filter(([sessionId, marked]) => {
      const session = listed.get(sessionId)
      return (
        session === undefined ||
        session.tag !== readSessionMark(marked.tag)?.tag ||
        session.lastModified < marked.at
      )
    }),
  )
}

/**
 * 続きから始めるセッションを選ぶ。印（`tagSession` で付けたもの）のあるもののうち、`lastModified` が最新の1つ。
 *
 * `cwd` での絞り込みは呼び出し側（`listSessions({ dir })`）が済ませている前提で、ここは印だけを見る。
 * 印は目印まで揃えてあるので（{@link readTaggedSessions}）、昔の印（目印の無いもの・1文字の `@A`）は同じポートの印と一致する。
 * 渡した印のものが1つも無ければ undefined（＝新規に起こす）を返す。
 */
export function selectSessionToResume(
  sessions: readonly TaggedSession[],
  tag: string,
): string | undefined {
  const matched = sessions.filter((session) => session.tag === tag)
  return matched.reduce<TaggedSession | undefined>(
    (latest, session) =>
      latest === undefined || session.lastModified > latest.lastModified ? session : latest,
    undefined,
  )?.sessionId
}

/**
 * SDK の `listSessions` が返した一覧（外来の値）を、印の付いたセッションの並びにする。
 * tsukumo の印を持たないもの・形が壊れているものは落とす（同じ cwd の素の `claude` のセッションはここで消える）。
 * 一覧そのものが配列でなければ空。
 */
export function readTaggedSessions(sessions: unknown): readonly TaggedSession[] {
  return Array.isArray(sessions) ? sessions.flatMap((session) => taggedSession(session)) : []
}

/**
 * 印を付けたことを並びへ写す。一覧に無いセッションなら足す（見出しは次に読み直すまで無い）。
 * `lastModified` は新しいほうを採る。
 * tsukumo の印として読めない `tag` なら並びをそのまま返す。
 */
export function withSessionMark(
  sessions: readonly TaggedSession[],
  marked: { readonly sessionId: string; readonly tag: string; readonly at: number },
): readonly TaggedSession[] {
  const mark = readSessionMark(marked.tag)
  if (mark === undefined) {
    return sessions
  }

  const existing = sessions.find((session) => session.sessionId === marked.sessionId)
  const updated: TaggedSession =
    existing === undefined
      ? {
          viewPort: mark.viewPort,
          tag: mark.tag,
          sessionId: marked.sessionId,
          lastModified: marked.at,
          startedAt: marked.at,
          heading: undefined,
        }
      : {
          ...existing,
          viewPort: mark.viewPort,
          tag: mark.tag,
          lastModified: Math.max(existing.lastModified, marked.at),
        }
  return [...sessions.filter((session) => session.sessionId !== marked.sessionId), updated]
}

/**
 * 切り替え先として選べるセッションを一覧にする（印そのものがセッションの一覧。別の保存先は作らない）。
 * 新しい順に並べ、tsukumo の印を持たないものと、いまの部屋（渡した `tag`）と違う印のものは落とす。
 *
 * `cwd` での絞り込みは呼び出し側（`listSessions({ dir })`）が済ませている前提。
 * 渡す `tag` は、目印まで揃えた印（`sessionTag`）。部屋はビューのポート1つにつき1つなので、切り替え先も自分の部屋のものだけに絞る。
 * 印は目印まで揃えてあるので、昔の印（目印の無いもの・1文字の `@A`）も対応するポートの部屋の一覧に並ぶ。
 *
 * 返すのは新しいほうから {@link MAX_SESSION_CHOICES} 件まで（印は使うほど増え続ける）。
 */
function listMarkedSessions(
  sessions: readonly TaggedSession[],
  tag: string,
): readonly SessionChoice[] {
  return sessions
    .filter((session) => session.tag === tag)
    .map(({ viewPort, sessionId, lastModified, startedAt, heading }) => ({
      viewPort,
      sessionId,
      lastModified,
      startedAt,
      heading,
    }))
    .sort((left, right) => right.lastModified - left.lastModified)
    .slice(0, MAX_SESSION_CHOICES)
}

/**
 * 一覧の要素1つを、印の付いたセッションとして受け取る。読めないものは空の並びにして落とす。
 */
function taggedSession(value: unknown): readonly TaggedSession[] {
  if (!isPlainObject(value) || typeof value.tag !== "string") {
    return []
  }

  const mark = readSessionMark(value.tag)
  const sessionId = value.sessionId
  const lastModified = value.lastModified
  return mark !== undefined &&
    typeof sessionId === "string" &&
    sessionId !== "" &&
    typeof lastModified === "number" &&
    Number.isFinite(lastModified)
    ? [
        {
          viewPort: mark.viewPort,
          tag: mark.tag,
          sessionId,
          lastModified,
          startedAt:
            typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
              ? value.createdAt
              : lastModified,
          heading: headingFrom(value.summary),
        },
      ]
    : []
}

/** SDK の `summary`（外来の値）を行の見出しへ畳む。文字列でない・空・空白だけなら無いものとして扱う（`SessionChoice.heading`）。 */
function headingFrom(summary: unknown): string | undefined {
  return typeof summary === "string" && summary.trim() !== "" ? summary : undefined
}
