// 印の付いたセッションの一覧を、このプロセスのメモリに持つ。
// 切り替え先の一覧は持っている一覧から出し、SDK の一覧を読み直すのは作ったときと `refresh` のときだけ。
// 持つのは印・ID・時刻・見出しだけで、会話の内容は持たない。

import { isPlainObject, omit } from "remeda"

import { MAX_SESSION_CHOICES, type SessionChoice } from "../../../shared/session/session-choice.ts"
import { readSessionMark } from "./session-mark.ts"

/** 印の付いたセッション1件（目印まで揃えた印と、目印を除いた印つき）。 */
export type TaggedSession = SessionChoice & {
  /** 目印まで揃えた印（{@link readSessionMark} が返す `tag`）。 */
  readonly tag: string
  /** 目印を除いた印（{@link readSessionMark} が返す `family`）。 */
  readonly family: string
}

export type SessionCatalog = {
  /**
   * 渡した印と同じパック・同じモードの、切り替え先として選べるセッション。目印（ポート）では絞らない。
   * 作業ツリーを問わず新しい順に並べて、先頭から {@link MAX_SESSION_CHOICES} 件まで。最初に読み終わるまでは待つ。
   */
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
 * 一覧を1つ作り、その場で1回読み始める。
 * `read` は SDK の `listSessions` の結果（外来の値）を返す。投げたら読めなかったものとして扱う。
 * `now` は印を写すときの `lastModified` に使う。
 * `cwd` はこのプロセスを起こした作業ディレクトリで、SDK の `cwd` と同じ行を「いまの作業ツリー」とする。
 */
export function createSessionCatalog(options: {
  readonly read: () => Promise<unknown>
  readonly now: () => number
  readonly cwd: string
}): SessionCatalog {
  type Marked = { readonly sessionId: string; readonly tag: string; readonly at: number }
  type Reading =
    | { readonly kind: "read"; readonly sessions: readonly TaggedSession[] }
    | { readonly kind: "unreadable" }

  const readOnce = async (): Promise<Reading> => {
    try {
      return { kind: "read", sessions: readTaggedSessions(await options.read(), options.cwd) }
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
    const worktree = worktreeNameOf(options.cwd, undefined)
    return [...marks.values()].reduce(
      (listed, marked) => withSessionMark(listed, marked, worktree),
      sessions,
    )
  }

  return {
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

/**
 * SDK の `cwd`・`gitBranch`（外来の値）を作業ツリーの名前へ畳む（`SessionChoice.worktree`）。
 * `cwd` の末尾の空でないディレクトリ名、無ければ空白だけでない `gitBranch`。どちらも無ければ undefined。
 */
export function worktreeNameOf(cwd: unknown, gitBranch: unknown): string | undefined {
  const directory =
    typeof cwd === "string" ? cwd.split("/").findLast((part) => part !== "") : undefined
  return (
    directory ?? (typeof gitBranch === "string" && gitBranch.trim() !== "" ? gitBranch : undefined)
  )
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
 * SDK の `listSessions` が返した一覧（外来の値）を、印の付いたセッションの並びにする。
 * tsukumo の印を持たないもの・形が壊れているものは落とす（同じ cwd の素の `claude` のセッションはここで消える）。
 * 作業ツリーの名前が取れないものも落とす。
 * 一覧そのものが配列でなければ空。
 */
function readTaggedSessions(sessions: unknown, cwd: string): readonly TaggedSession[] {
  return Array.isArray(sessions) ? sessions.flatMap((session) => taggedSession(session, cwd)) : []
}

/**
 * 印を付けたことを並びへ写す。一覧に無いセッションなら足す（見出しは次に読み直すまで無い）。
 * 足す行は、このプロセスの作業ツリー（名前は `worktree`）の行になる。
 * `lastModified` は新しいほうを採る。
 * tsukumo の印として読めない `tag` か、足す行の作業ツリーの名前が無いなら並びをそのまま返す。
 */
function withSessionMark(
  sessions: readonly TaggedSession[],
  marked: { readonly sessionId: string; readonly tag: string; readonly at: number },
  worktree: string | undefined,
): readonly TaggedSession[] {
  const mark = readSessionMark(marked.tag)
  if (mark === undefined) {
    return sessions
  }

  const existing = sessions.find((session) => session.sessionId === marked.sessionId)
  if (existing === undefined) {
    return worktree === undefined
      ? sessions
      : [
          ...sessions,
          {
            viewPort: mark.viewPort,
            tag: mark.tag,
            family: mark.family,
            sessionId: marked.sessionId,
            lastModified: marked.at,
            startedAt: marked.at,
            heading: undefined,
            worktree,
            inCurrentWorktree: true,
          },
        ]
  }

  const updated: TaggedSession = {
    ...existing,
    viewPort: mark.viewPort,
    tag: mark.tag,
    family: mark.family,
    lastModified: Math.max(existing.lastModified, marked.at),
  }
  return [...sessions.filter((session) => session.sessionId !== marked.sessionId), updated]
}

/**
 * 切り替え先として選べるセッションを一覧にする（印そのものがセッションの一覧。別の保存先は作らない）。
 * 渡した `tag` と同じパック・同じモード（目印を除いた印）のものだけを、作業ツリーを問わず新しい順に並べる。
 * 印は目印まで揃えてあるので、昔の印（目印の無いもの・1文字の `@A`）も同じパック・モードの一覧に並ぶ。
 *
 * 返すのは先頭から {@link MAX_SESSION_CHOICES} 件まで（印は使うほど増え続ける）。
 * 作業ツリーを問わず新しい順で切るので、いまの作業ツリーの行が10件に入らないことがある。
 */
function listMarkedSessions(
  sessions: readonly TaggedSession[],
  tag: string,
): readonly SessionChoice[] {
  const family = readSessionMark(tag)?.family
  return sessions
    .filter((session) => family !== undefined && session.family === family)
    .map((session) => omit(session, ["tag", "family"]))
    .sort((left, right) => right.lastModified - left.lastModified)
    .slice(0, MAX_SESSION_CHOICES)
}

/**
 * 一覧の要素1つを、印の付いたセッションとして受け取る。読めないものは空の並びにして落とす。
 * `cwd` は起動した作業ディレクトリで、SDK の `cwd` と同じなら「いまの作業ツリー」の行にする。
 */
function taggedSession(value: unknown, cwd: string): readonly TaggedSession[] {
  if (!isPlainObject(value) || typeof value.tag !== "string") {
    return []
  }

  const mark = readSessionMark(value.tag)
  const sessionId = value.sessionId
  const lastModified = value.lastModified
  const worktree = worktreeNameOf(value.cwd, value.gitBranch)
  return mark !== undefined &&
    worktree !== undefined &&
    typeof sessionId === "string" &&
    sessionId !== "" &&
    typeof lastModified === "number" &&
    Number.isFinite(lastModified)
    ? [
        {
          viewPort: mark.viewPort,
          tag: mark.tag,
          family: mark.family,
          sessionId,
          lastModified,
          startedAt:
            typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
              ? value.createdAt
              : lastModified,
          heading: headingFrom(value.summary),
          worktree,
          inCurrentWorktree: value.cwd === cwd,
        },
      ]
    : []
}

/** SDK の `summary`（外来の値）を行の見出しへ畳む。文字列でない・空・空白だけなら無いものとして扱う（`SessionChoice.heading`）。 */
function headingFrom(summary: unknown): string | undefined {
  return typeof summary === "string" && summary.trim() !== "" ? summary : undefined
}
