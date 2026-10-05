import { describe, expect, it } from "vitest"

import type { Config } from "../../../../src/server/core/config.ts"
import {
  canResume,
  createSessionCatalog,
  readTaggedSessions,
  selectSessionToResume,
} from "../../../../src/server/session-driver/core/session-catalog.ts"
import { sessionTag } from "../../../../src/server/session-driver/core/session-mark.ts"
import { DEFAULT_VIEW_PORT } from "../../../../src/server/view-server/core/port-resolution.ts"
import {
  MAX_SESSION_CHOICES,
  type SessionChoice,
} from "../../../../src/shared/session/session-choice.ts"

// 印はキャラクターパックごと・雑談かどうか・ビューのポートごとに違う
// （`tsukumo:<パック名>@7327` と `tsukumo:<パック名>:chat@7327`。目印はポート番号そのもの）。
const TAG = sessionTag("架空のパック", false, DEFAULT_VIEW_PORT)
const CHAT_TAG = sessionTag("架空のパック", true, DEFAULT_VIEW_PORT)
const OTHER_PACK_TAG = sessionTag("別の架空のパック", false, DEFAULT_VIEW_PORT)
// 2つめの tsukumo（ポートが1つずれたぶん、目印も 7328 になる＝別の部屋）。
const SECOND_TAG = sessionTag("架空のパック", false, DEFAULT_VIEW_PORT + 1)

function sessionInfo(sessionId: string, lastModified: number, tag: string): unknown {
  return { sessionId, lastModified, tag, summary: `架空の見出し ${sessionId}` }
}

function sessionRecord(overrides: Readonly<Record<string, unknown>>): unknown {
  return { sessionId: "s-0", summary: "架空のセッション", lastModified: 1_000, ...overrides }
}

/** 読むたびに、渡した順に結果を返す偽の `listSessions`。読んだ回数も数える。 */
function scriptedRead(results: readonly (() => Promise<unknown>)[]): {
  readonly read: () => Promise<unknown>
  readonly count: () => number
} {
  let count = 0
  return {
    read: () => {
      const next = results[count] ?? results.at(-1)
      count += 1
      return next === undefined ? Promise.resolve([]) : next()
    },
    count: () => count,
  }
}

describe("createSessionCatalog", () => {
  it("作ったときに1回だけ読み、続きの選択と切り替え先の一覧では読み直さない", async () => {
    const reads = scriptedRead([
      () =>
        Promise.resolve([sessionInfo("s-work", 200, TAG), sessionInfo("s-chat", 100, CHAT_TAG)]),
    ])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000 })

    expect(await catalog.findToResume(TAG)).toBe("s-work")
    expect(await catalog.findToResume(CHAT_TAG)).toBe("s-chat")
    expect((await catalog.listChoices(TAG)).map((choice) => choice.sessionId)).toEqual(["s-work"])
    expect(reads.count()).toBe(1)
  })

  it("印を付けたセッションは、読み直す前から続きとして選ばれ、切り替え先の一覧にも並ぶ", async () => {
    const reads = scriptedRead([() => Promise.resolve([sessionInfo("s-old", 200, TAG)])])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000 })
    await catalog.findToResume(TAG)

    catalog.noteMarked("s-new", TAG)

    expect(await catalog.findToResume(TAG)).toBe("s-new")
    expect((await catalog.listChoices(TAG)).map((choice) => choice.sessionId)).toEqual([
      "s-new",
      "s-old",
    ])
    expect(reads.count()).toBe(1)
  })

  it("古いセッションに印を付け直すと、そちらが最新として続きに選ばれる", async () => {
    const reads = scriptedRead([
      () => Promise.resolve([sessionInfo("s-a", 100, TAG), sessionInfo("s-b", 200, TAG)]),
    ])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000 })

    catalog.noteMarked("s-a", TAG)

    expect(await catalog.findToResume(TAG)).toBe("s-a")
  })

  it("読み直すと見出しや新しいセッションが入れ替わり、読み直しの間に付けた印も残る", async () => {
    const second = Promise.withResolvers<unknown>()
    const reads = scriptedRead([
      () => Promise.resolve([sessionInfo("s-old", 200, TAG)]),
      () => second.promise,
    ])
    let now = 1_000
    const catalog = createSessionCatalog({ read: reads.read, now: () => now })
    await catalog.findToResume(TAG)

    const refreshing = catalog.refresh()
    now = 2_000
    catalog.noteMarked("s-marked", TAG)
    // 読み直した一覧には、読み始めたあとに付いた印がまだ入っていない。
    second.resolve([sessionInfo("s-old", 200, TAG), sessionInfo("s-outside", 300, TAG)])
    await refreshing

    expect((await catalog.listChoices(TAG)).map((choice) => choice.sessionId)).toEqual([
      "s-marked",
      "s-outside",
      "s-old",
    ])
  })

  it("同じセッションに何度も印を付け直しても、最新の印（時刻と印）が一覧に出る", async () => {
    const reads = scriptedRead([
      () => Promise.resolve([sessionInfo("s-a", 100, TAG), sessionInfo("s-b", 200, TAG)]),
    ])
    let now = 1_000
    const catalog = createSessionCatalog({ read: reads.read, now: () => now })

    catalog.noteMarked("s-a", TAG)
    now = 2_000
    catalog.noteMarked("s-a", SECOND_TAG)
    now = 3_000
    catalog.noteMarked("s-b", TAG)
    now = 4_000
    catalog.noteMarked("s-a", TAG)

    expect(await catalog.listChoices(SECOND_TAG)).toEqual([])
    expect(await catalog.listChoices(TAG)).toEqual([
      expect.objectContaining({ sessionId: "s-a", lastModified: 4_000 }),
      expect.objectContaining({ sessionId: "s-b", lastModified: 3_000 }),
    ])
  })

  it("読めない印を付けても、先に付けた印も一覧も変わらない", async () => {
    const reads = scriptedRead([() => Promise.resolve([sessionInfo("s-a", 100, TAG)])])
    let now = 1_000
    const catalog = createSessionCatalog({ read: reads.read, now: () => now })

    catalog.noteMarked("s-a", TAG)
    now = 2_000
    catalog.noteMarked("s-a", "架空の読めない印")
    catalog.noteMarked("s-new", "架空の読めない印")

    expect(await catalog.listChoices(TAG)).toEqual([
      expect.objectContaining({ sessionId: "s-a", lastModified: 1_000 }),
    ])
  })

  it("読み直した一覧に載った印は捨て、載っていない印は読み直したあとも残る", async () => {
    const reads = scriptedRead([
      () => Promise.resolve([]),
      () => Promise.resolve([sessionInfo("s-listed", 1_500, TAG), sessionInfo("s-late", 500, TAG)]),
      () => Promise.resolve([sessionInfo("s-listed", 100, TAG), sessionInfo("s-late", 500, TAG)]),
    ])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000 })

    catalog.noteMarked("s-listed", TAG)
    catalog.noteMarked("s-late", TAG)
    await catalog.refresh()
    // 載った印は捨てたので、次に一覧が古い値を返しても付け直されない。
    await catalog.refresh()

    expect(await catalog.listChoices(TAG)).toEqual([
      expect.objectContaining({ sessionId: "s-late", lastModified: 1_000 }),
      expect.objectContaining({ sessionId: "s-listed", lastModified: 100 }),
    ])
  })

  it("読み直せなかったときは、持っている一覧のまま", async () => {
    const reads = scriptedRead([
      () => Promise.resolve([sessionInfo("s-work", 200, TAG)]),
      () => Promise.reject(new Error("架空の読み取り失敗")),
    ])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000 })

    expect(await catalog.refresh()).toBe("kept")
    expect(await catalog.findToResume(TAG)).toBe("s-work")
  })

  it("後から始めた読み直しが先に終わったら、遅れて終わった古い読み直しは採らない", async () => {
    const slow = Promise.withResolvers<unknown>()
    const reads = scriptedRead([
      () => Promise.resolve([]),
      () => slow.promise,
      () => Promise.resolve([sessionInfo("s-fresh", 300, TAG)]),
    ])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000 })

    const older = catalog.refresh()
    expect(await catalog.refresh()).toBe("refreshed")
    slow.resolve([sessionInfo("s-stale", 100, TAG)])
    expect(await older).toBe("kept")

    expect(await catalog.findToResume(TAG)).toBe("s-fresh")
  })

  it("最初に読めなかったときは、続きが無い（新規に起こす）", async () => {
    const reads = scriptedRead([() => Promise.reject(new Error("架空の読み取り失敗"))])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000 })

    expect(await catalog.findToResume(TAG)).toBeUndefined()
    expect(await catalog.listChoices(TAG)).toEqual([])
  })
})

describe("canResume", () => {
  function config(overrides: Partial<Pick<Config, "newSession">>): Pick<Config, "newSession"> {
    return { newSession: false, ...overrides }
  }

  it("既定（新規指定なし）では続きを探す", () => {
    expect(canResume(config({}))).toBe(true)
  })

  it("TSUKUMO_NEW_SESSION=1（newSession）のときは探さない", () => {
    expect(canResume(config({ newSession: true }))).toBe(false)
  })
})

describe("selectSessionToResume", () => {
  it("印のあるセッションが複数あるとき、lastModified が最新のものを選ぶ", () => {
    const sessions = [
      sessionRecord({ sessionId: "s-old", lastModified: 100, tag: TAG }),
      sessionRecord({ sessionId: "s-new", lastModified: 300, tag: TAG }),
      sessionRecord({ sessionId: "s-mid", lastModified: 200, tag: TAG }),
    ]

    expect(selectSessionToResume(readTaggedSessions(sessions), TAG)).toBe("s-new")
  })

  it("印が無いセッション（同じ cwd の素の claude）は選ばない", () => {
    const sessions = [
      sessionRecord({ sessionId: "s-bare", lastModified: 900 }),
      sessionRecord({ sessionId: "s-other-tag", lastModified: 800, tag: "別の道具" }),
      sessionRecord({ sessionId: "s-tsukumo", lastModified: 100, tag: TAG }),
    ]

    expect(selectSessionToResume(readTaggedSessions(sessions), TAG)).toBe("s-tsukumo")
  })

  it("一覧が空・印が1つも無いときは復元しない（新規に起こす）", () => {
    expect(selectSessionToResume(readTaggedSessions([]), TAG)).toBeUndefined()
    expect(
      selectSessionToResume(
        readTaggedSessions([sessionRecord({ sessionId: "s-bare", lastModified: 900 })]),
        TAG,
      ),
    ).toBeUndefined()
  })

  it("別のパックの印を持つセッションは選ばない（キャラクターごとに別のセッション）", () => {
    const sessions = [
      sessionRecord({ sessionId: "s-other-pack", lastModified: 900, tag: OTHER_PACK_TAG }),
      sessionRecord({ sessionId: "s-this-pack", lastModified: 100, tag: TAG }),
    ]

    expect(selectSessionToResume(readTaggedSessions(sessions), TAG)).toBe("s-this-pack")
  })

  it("同じパックでも雑談と仕事で別のセッションを選ぶ（文脈ごと分ける）", () => {
    const sessions = [
      sessionRecord({ sessionId: "s-work", lastModified: 900, tag: TAG }),
      sessionRecord({ sessionId: "s-chat", lastModified: 100, tag: CHAT_TAG }),
    ]

    expect(selectSessionToResume(readTaggedSessions(sessions), TAG)).toBe("s-work")
    expect(selectSessionToResume(readTaggedSessions(sessions), CHAT_TAG)).toBe("s-chat")
  })

  it("仕事のセッションしか無ければ、雑談は新規に起こす（仕事の続きを拾わない）", () => {
    const sessions = [sessionRecord({ sessionId: "s-work", lastModified: 900, tag: TAG })]

    expect(selectSessionToResume(readTaggedSessions(sessions), CHAT_TAG)).toBeUndefined()
  })

  it("形が壊れているときは復元しない（落ちない）", () => {
    expect(selectSessionToResume(readTaggedSessions(undefined), TAG)).toBeUndefined()
    expect(selectSessionToResume(readTaggedSessions({ sessions: [] }), TAG)).toBeUndefined()
    expect(selectSessionToResume(readTaggedSessions([null, 42, "s-1"]), TAG)).toBeUndefined()
    expect(
      selectSessionToResume(
        readTaggedSessions([{ sessionId: 1, lastModified: 100, tag: TAG }]),
        TAG,
      ),
    ).toBeUndefined()
    expect(
      selectSessionToResume(
        readTaggedSessions([{ sessionId: "s-1", lastModified: "きのう", tag: TAG }]),
        TAG,
      ),
    ).toBeUndefined()
  })

  it("壊れた要素が混じっていても、読めた印のあるものから選ぶ", () => {
    const sessions = [
      null,
      { sessionId: "s-broken", tag: TAG },
      sessionRecord({ sessionId: "s-ok", lastModified: 500, tag: TAG }),
    ]

    expect(selectSessionToResume(readTaggedSessions(sessions), TAG)).toBe("s-ok")
  })

  it("目印の違うセッションは選ばない（同じディレクトリの2つめの tsukumo）", () => {
    const sessions = [
      sessionRecord({ sessionId: "s-first", lastModified: 900, tag: TAG }),
      sessionRecord({ sessionId: "s-second", lastModified: 100, tag: SECOND_TAG }),
    ]

    expect(selectSessionToResume(readTaggedSessions(sessions), TAG)).toBe("s-first")
    expect(selectSessionToResume(readTaggedSessions(sessions), SECOND_TAG)).toBe("s-second")
  })

  it("目印の無い昔の印は、既定のポートの続きとして選ぶ（互換）", () => {
    const sessions = [
      sessionRecord({ sessionId: "s-legacy", lastModified: 900, tag: "tsukumo:架空のパック" }),
      sessionRecord({
        sessionId: "s-legacy-chat",
        lastModified: 800,
        tag: "tsukumo:架空のパック:chat",
      }),
    ]

    expect(selectSessionToResume(readTaggedSessions(sessions), TAG)).toBe("s-legacy")
    expect(selectSessionToResume(readTaggedSessions(sessions), CHAT_TAG)).toBe("s-legacy-chat")
    expect(selectSessionToResume(readTaggedSessions(sessions), SECOND_TAG)).toBeUndefined()
  })
})

function listChoicesOf(sessions: unknown, tag: string): Promise<readonly SessionChoice[]> {
  return createSessionCatalog({
    read: () => Promise.resolve(sessions),
    now: () => 1_000,
  }).listChoices(tag)
}

describe("createSessionCatalog の切り替え先の一覧", () => {
  it("いまの部屋（同じ印）のセッションを新しい順に並べる", async () => {
    const sessions = [
      sessionRecord({ sessionId: "s-first", lastModified: 100, tag: TAG }),
      sessionRecord({ sessionId: "s-third", lastModified: 200, tag: TAG }),
    ]

    expect(await listChoicesOf(sessions, TAG)).toEqual([
      {
        viewPort: DEFAULT_VIEW_PORT,
        sessionId: "s-third",
        lastModified: 200,
        startedAt: 200,
        heading: "架空のセッション",
      },
      {
        viewPort: DEFAULT_VIEW_PORT,
        sessionId: "s-first",
        lastModified: 100,
        startedAt: 100,
        heading: "架空のセッション",
      },
    ])
  })

  // 部屋はビューのポート1つにつき1つ。同じパック・同じモードでも
  // 目印（ポート）が違えば別の部屋なので、一覧には並ばない。
  it("同じ一族でも目印の違うもの（別の部屋）は並ばない", async () => {
    const sessions = [
      sessionRecord({ sessionId: "s-here", lastModified: 100, tag: TAG }),
      sessionRecord({ sessionId: "s-other-room", lastModified: 300, tag: SECOND_TAG }),
    ]

    expect(await listChoicesOf(sessions, TAG)).toEqual([
      {
        viewPort: DEFAULT_VIEW_PORT,
        sessionId: "s-here",
        lastModified: 100,
        startedAt: 100,
        heading: "架空のセッション",
      },
    ])
    expect(await listChoicesOf(sessions, SECOND_TAG)).toEqual([
      {
        viewPort: DEFAULT_VIEW_PORT + 1,
        sessionId: "s-other-room",
        lastModified: 300,
        startedAt: 300,
        heading: "架空のセッション",
      },
    ])
  })

  // 一覧から選んでも、キャラクターも雑談かどうかも変わらない（`session.switchSession`）。
  // 別のパック・別のモードのセッションが混ざると、選んだ瞬間に相手だけが入れ替わる。
  it("別のパック・別のモードのセッションは落とす", async () => {
    const sessions = [
      sessionRecord({ sessionId: "s-work", lastModified: 100, tag: TAG }),
      sessionRecord({ sessionId: "s-chat", lastModified: 300, tag: CHAT_TAG }),
      sessionRecord({ sessionId: "s-other-pack", lastModified: 400, tag: OTHER_PACK_TAG }),
    ]

    expect(await listChoicesOf(sessions, TAG)).toEqual([
      {
        viewPort: DEFAULT_VIEW_PORT,
        sessionId: "s-work",
        lastModified: 100,
        startedAt: 100,
        heading: "架空のセッション",
      },
    ])
    expect(await listChoicesOf(sessions, CHAT_TAG)).toEqual([
      {
        viewPort: DEFAULT_VIEW_PORT,
        sessionId: "s-chat",
        lastModified: 300,
        startedAt: 300,
        heading: "架空のセッション",
      },
    ])
  })

  it("印の無いセッションと壊れた要素は落とす（昔の印は対応するポートの部屋に残す）", async () => {
    const sessions = [
      null,
      sessionRecord({ sessionId: "s-bare", lastModified: 900 }),
      sessionRecord({ sessionId: "s-other-tool", lastModified: 800, tag: "別の道具" }),
      sessionRecord({ sessionId: "s-broken", lastModified: "きのう", tag: TAG }),
      sessionRecord({ sessionId: "s-legacy", lastModified: 500, tag: "tsukumo:架空のパック" }),
    ]

    expect(await listChoicesOf(sessions, TAG)).toEqual([
      {
        viewPort: DEFAULT_VIEW_PORT,
        sessionId: "s-legacy",
        lastModified: 500,
        startedAt: 500,
        heading: "架空のセッション",
      },
    ])
  })

  // 印は使うほど増え続ける（実測: このリポジトリで120件）。`<select>` に全部は並べない。
  it("新しいほうから上限の件数までしか返さない", async () => {
    const many = Array.from({ length: MAX_SESSION_CHOICES + 5 }, (_unused, index) =>
      sessionRecord({ sessionId: `s-${String(index)}`, lastModified: index, tag: TAG }),
    )

    const listed = await listChoicesOf(many, TAG)
    expect(listed).toHaveLength(MAX_SESSION_CHOICES)
    expect(listed[0]?.sessionId).toBe(`s-${String(MAX_SESSION_CHOICES + 4)}`)
  })

  it("一覧が空・形が壊れているときは空（落ちない）", async () => {
    expect(await listChoicesOf([], TAG)).toEqual([])
    expect(await listChoicesOf(undefined, TAG)).toEqual([])
    expect(await listChoicesOf({ sessions: [] }, TAG)).toEqual([])
  })

  // SDK の `summary` は行の見出しになる外来の値なので、境界（taggedSession）で検証する。
  // 文字列でない・空・空白だけなら無いものとして畳み、`SessionSwitch` 側の「（題なし）」に任せる。
  it("summary が読める文字列ならそのまま見出しにし、文字列でない・空・空白だけなら無いものとして畳む", async () => {
    const sessions = [
      sessionRecord({
        sessionId: "s-titled",
        lastModified: 400,
        startedAt: 400,
        tag: TAG,
        summary: "架空の作業その1",
      }),
      sessionRecord({ sessionId: "s-missing", lastModified: 300, tag: TAG, summary: undefined }),
      sessionRecord({ sessionId: "s-number", lastModified: 200, tag: TAG, summary: 12345 }),
      sessionRecord({ sessionId: "s-blank", lastModified: 100, tag: TAG, summary: "   " }),
    ]

    expect(await listChoicesOf(sessions, TAG)).toEqual([
      {
        viewPort: DEFAULT_VIEW_PORT,
        sessionId: "s-titled",
        lastModified: 400,
        startedAt: 400,
        heading: "架空の作業その1",
      },
      {
        viewPort: DEFAULT_VIEW_PORT,
        sessionId: "s-missing",
        lastModified: 300,
        startedAt: 300,
        heading: undefined,
      },
      {
        viewPort: DEFAULT_VIEW_PORT,
        sessionId: "s-number",
        lastModified: 200,
        startedAt: 200,
        heading: undefined,
      },
      {
        viewPort: DEFAULT_VIEW_PORT,
        sessionId: "s-blank",
        lastModified: 100,
        startedAt: 100,
        heading: undefined,
      },
    ])
  })

  it("始まった時刻は SDK の createdAt を使い、無ければ最終更新時刻に畳む", async () => {
    const sessions = [
      sessionRecord({ sessionId: "s-created", lastModified: 300, createdAt: 120, tag: TAG }),
      sessionRecord({ sessionId: "s-no-created", lastModified: 200, tag: TAG }),
    ]

    expect(
      (await listChoicesOf(sessions, TAG)).map(({ sessionId, startedAt }) => ({
        sessionId,
        startedAt,
      })),
    ).toEqual([
      { sessionId: "s-created", startedAt: 120 },
      { sessionId: "s-no-created", startedAt: 200 },
    ])
  })
})
