import { describe, expect, it } from "vitest"

import { createSessionCatalog } from "../../../../src/server/session-driver/core/session-catalog.ts"
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
// 2つめの tsukumo（ポートが1つずれたぶん、目印も 7328 になる）。
const SECOND_TAG = sessionTag("架空のパック", false, DEFAULT_VIEW_PORT + 1)

// tsukumo を起こした作業ディレクトリ（いまの作業ツリー）と、同じリポジトリの別の作業ツリー。
const CWD = "/work/架空のリポジトリ/main"
const WORKTREE = "main"
const OTHER_CWD = "/work/架空のリポジトリ/wt-other"
const OTHER_WORKTREE = "wt-other"

function sessionInfo(sessionId: string, lastModified: number, tag: string): unknown {
  return { sessionId, lastModified, tag, cwd: CWD, summary: `架空の見出し ${sessionId}` }
}

function sessionRecord(overrides: Readonly<Record<string, unknown>>): unknown {
  return {
    sessionId: "s-0",
    summary: "架空のセッション",
    lastModified: 1_000,
    cwd: CWD,
    ...overrides,
  }
}

/** 一覧に出る行1件の期待。既定はいまの作業ツリーの、既定のポートの行。 */
function choiceOf(
  sessionId: string,
  lastModified: number,
  overrides: Partial<SessionChoice> = {},
): SessionChoice {
  return {
    viewPort: DEFAULT_VIEW_PORT,
    sessionId,
    lastModified,
    startedAt: lastModified,
    heading: "架空のセッション",
    worktree: WORKTREE,
    inCurrentWorktree: true,
    ...overrides,
  }
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
  it("作ったときに1回だけ読み、切り替え先の一覧を何度引いても読み直さない", async () => {
    const reads = scriptedRead([
      () =>
        Promise.resolve([sessionInfo("s-work", 200, TAG), sessionInfo("s-chat", 100, CHAT_TAG)]),
    ])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000, cwd: CWD })

    expect((await catalog.listChoices(TAG)).map((choice) => choice.sessionId)).toEqual(["s-work"])
    expect((await catalog.listChoices(CHAT_TAG)).map((choice) => choice.sessionId)).toEqual([
      "s-chat",
    ])
    expect(reads.count()).toBe(1)
  })

  it("印を付けたセッションは、読み直す前から切り替え先の一覧に並ぶ", async () => {
    const reads = scriptedRead([() => Promise.resolve([sessionInfo("s-old", 200, TAG)])])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000, cwd: CWD })
    await catalog.listChoices(TAG)

    catalog.noteMarked("s-new", TAG)

    expect((await catalog.listChoices(TAG)).map((choice) => choice.sessionId)).toEqual([
      "s-new",
      "s-old",
    ])
    expect(reads.count()).toBe(1)
  })

  it("古いセッションに印を付け直すと、そちらが一覧の先頭に来る", async () => {
    const reads = scriptedRead([
      () => Promise.resolve([sessionInfo("s-a", 100, TAG), sessionInfo("s-b", 200, TAG)]),
    ])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000, cwd: CWD })

    catalog.noteMarked("s-a", TAG)

    expect((await catalog.listChoices(TAG))[0]?.sessionId).toBe("s-a")
  })

  it("読み直すと見出しや新しいセッションが入れ替わり、読み直しの間に付けた印も残る", async () => {
    const second = Promise.withResolvers<unknown>()
    const reads = scriptedRead([
      () => Promise.resolve([sessionInfo("s-old", 200, TAG)]),
      () => second.promise,
    ])
    let now = 1_000
    const catalog = createSessionCatalog({ read: reads.read, now: () => now, cwd: CWD })
    await catalog.listChoices(TAG)

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
    const catalog = createSessionCatalog({ read: reads.read, now: () => now, cwd: CWD })

    catalog.noteMarked("s-a", TAG)
    now = 2_000
    catalog.noteMarked("s-a", SECOND_TAG)
    now = 3_000
    catalog.noteMarked("s-b", TAG)
    now = 4_000
    catalog.noteMarked("s-a", TAG)

    expect(await catalog.listChoices(TAG)).toEqual([
      expect.objectContaining({ sessionId: "s-a", lastModified: 4_000 }),
      expect.objectContaining({ sessionId: "s-b", lastModified: 3_000 }),
    ])
  })

  it("読めない印を付けても、先に付けた印も一覧も変わらない", async () => {
    const reads = scriptedRead([() => Promise.resolve([sessionInfo("s-a", 100, TAG)])])
    let now = 1_000
    const catalog = createSessionCatalog({ read: reads.read, now: () => now, cwd: CWD })

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
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000, cwd: CWD })

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
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000, cwd: CWD })

    expect(await catalog.refresh()).toBe("kept")
    expect((await catalog.listChoices(TAG)).map((choice) => choice.sessionId)).toEqual(["s-work"])
  })

  it("後から始めた読み直しが先に終わったら、遅れて終わった古い読み直しは採らない", async () => {
    const slow = Promise.withResolvers<unknown>()
    const reads = scriptedRead([
      () => Promise.resolve([]),
      () => slow.promise,
      () => Promise.resolve([sessionInfo("s-fresh", 300, TAG)]),
    ])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000, cwd: CWD })

    const older = catalog.refresh()
    expect(await catalog.refresh()).toBe("refreshed")
    slow.resolve([sessionInfo("s-stale", 100, TAG)])
    expect(await older).toBe("kept")

    expect((await catalog.listChoices(TAG)).map((choice) => choice.sessionId)).toEqual(["s-fresh"])
  })

  it("最初に読めなかったときは、切り替え先が空", async () => {
    const reads = scriptedRead([() => Promise.reject(new Error("架空の読み取り失敗"))])
    const catalog = createSessionCatalog({ read: reads.read, now: () => 1_000, cwd: CWD })

    expect(await catalog.listChoices(TAG)).toEqual([])
  })
})

function catalogOf(sessions: unknown): ReturnType<typeof createSessionCatalog> {
  return createSessionCatalog({ read: () => Promise.resolve(sessions), now: () => 1_000, cwd: CWD })
}

function listChoicesOf(sessions: unknown, tag: string): Promise<readonly SessionChoice[]> {
  return catalogOf(sessions).listChoices(tag)
}

const LEGACY_SESSIONS = [
  sessionRecord({ sessionId: "s-legacy", lastModified: 900, tag: "tsukumo:架空のパック" }),
  sessionRecord({
    sessionId: "s-legacy-chat",
    lastModified: 800,
    tag: "tsukumo:架空のパック:chat",
  }),
]

describe("createSessionCatalog の昔の印", () => {
  it.each<[string, string, string]>([
    ["目印の無い昔の仕事の印は、既定のポートの一覧に並ぶ", TAG, "s-legacy"],
    ["目印の無い昔の雑談の印は、既定のポートの雑談の一覧に並ぶ", CHAT_TAG, "s-legacy-chat"],
    [
      "目印の無い昔の印は、ほかのポートの一覧にも並ぶ（ポートでは絞らない）",
      SECOND_TAG,
      "s-legacy",
    ],
  ])("%s", async (_name, tag, expected) => {
    expect((await listChoicesOf(LEGACY_SESSIONS, tag)).map((choice) => choice.sessionId)).toEqual([
      expected,
    ])
  })
})

describe("createSessionCatalog の切り替え先の一覧", () => {
  it("同じ作業ツリーのセッションを新しい順に並べる", async () => {
    const sessions = [
      sessionRecord({ sessionId: "s-first", lastModified: 100, tag: TAG }),
      sessionRecord({ sessionId: "s-third", lastModified: 200, tag: TAG }),
    ]

    expect(await listChoicesOf(sessions, TAG)).toEqual([
      choiceOf("s-third", 200),
      choiceOf("s-first", 100),
    ])
  })

  it("同じパック・同じモードなら、目印（ポート）の違うセッションも並ぶ", async () => {
    const sessions = [
      sessionRecord({ sessionId: "s-here", lastModified: 100, tag: TAG }),
      sessionRecord({ sessionId: "s-other-port", lastModified: 300, tag: SECOND_TAG }),
    ]

    const expected = [
      choiceOf("s-other-port", 300, { viewPort: DEFAULT_VIEW_PORT + 1 }),
      choiceOf("s-here", 100),
    ]
    expect(await listChoicesOf(sessions, TAG)).toEqual(expected)
    expect(await listChoicesOf(sessions, SECOND_TAG)).toEqual(expected)
  })

  it.each<[string, Readonly<Record<string, unknown>>, string, boolean]>([
    ["cwd が起動した作業ディレクトリと同じ", { cwd: CWD }, WORKTREE, true],
    ["cwd が別の作業ツリー", { cwd: OTHER_CWD, gitBranch: "架空の枝" }, OTHER_WORKTREE, false],
    ["cwd の末尾にスラッシュが付いている", { cwd: `${OTHER_CWD}/` }, OTHER_WORKTREE, false],
    ["cwd が無く gitBranch だけ", { cwd: undefined, gitBranch: "架空の枝" }, "架空の枝", false],
    ["cwd が空文字で gitBranch がある", { cwd: "", gitBranch: "架空の枝" }, "架空の枝", false],
  ])("作業ツリーの名前と、いまの作業ツリーか: %s", async (_name, fields, worktree, current) => {
    const sessions = [sessionRecord({ sessionId: "s-w", lastModified: 100, tag: TAG, ...fields })]

    expect(await listChoicesOf(sessions, TAG)).toEqual([
      choiceOf("s-w", 100, { worktree, inCurrentWorktree: current }),
    ])
  })

  it.each<[string, Readonly<Record<string, unknown>>]>([
    ["cwd も gitBranch も無い", { cwd: undefined }],
    ["cwd が根（名前が取れない）で gitBranch が無い", { cwd: "/" }],
    ["gitBranch が空白だけ", { cwd: undefined, gitBranch: "  " }],
    ["cwd も gitBranch も文字列でない", { cwd: 12, gitBranch: 34 }],
  ])("作業ツリーの名前が取れない行は落とす: %s", async (_name, fields) => {
    const sessions = [sessionRecord({ sessionId: "s-w", lastModified: 100, tag: TAG, ...fields })]

    expect(await listChoicesOf(sessions, TAG)).toEqual([])
  })

  it("作業ツリーをまたいで新しい順に並べる", async () => {
    const sessions = [
      sessionRecord({ sessionId: "s-other-new", lastModified: 900, tag: TAG, cwd: OTHER_CWD }),
      sessionRecord({ sessionId: "s-here-old", lastModified: 100, tag: TAG }),
      sessionRecord({ sessionId: "s-here-new", lastModified: 200, tag: TAG }),
      sessionRecord({ sessionId: "s-other-old", lastModified: 800, tag: TAG, cwd: OTHER_CWD }),
    ]

    expect((await listChoicesOf(sessions, TAG)).map((choice) => choice.sessionId)).toEqual([
      "s-other-new",
      "s-other-old",
      "s-here-new",
      "s-here-old",
    ])
  })

  it("いまの作業ツリーに上限以上あっても、別の作業ツリーの新しい行が上位に並び、古いものが落ちる", async () => {
    const here = Array.from({ length: MAX_SESSION_CHOICES + 1 }, (_unused, index) =>
      sessionRecord({ sessionId: `s-here-${String(index)}`, lastModified: index, tag: TAG }),
    )
    const sessions = [
      sessionRecord({ sessionId: "s-other", lastModified: 10_000, tag: TAG, cwd: OTHER_CWD }),
      ...here,
    ]

    const listed = await listChoicesOf(sessions, TAG)
    expect(listed).toHaveLength(MAX_SESSION_CHOICES)
    expect(listed[0]?.sessionId).toBe("s-other")
    expect(listed.map((choice) => choice.sessionId)).not.toContain("s-here-0")
  })

  it("作業ツリーを問わず新しい順の上限件数で切り、いまの作業ツリーの古い行は入らない", async () => {
    const others = Array.from({ length: 12 }, (_unused, index) =>
      sessionRecord({
        sessionId: `s-other-${String(index)}`,
        lastModified: 1_000 + index,
        tag: TAG,
        cwd: OTHER_CWD,
      }),
    )
    const here = Array.from({ length: 3 }, (_unused, index) =>
      sessionRecord({ sessionId: `s-here-${String(index)}`, lastModified: index, tag: TAG }),
    )

    const listed = await listChoicesOf([...others, ...here], TAG)
    expect(listed).toHaveLength(MAX_SESSION_CHOICES)
    expect(listed[0]?.sessionId).toBe("s-other-11")
    expect(listed.every((choice) => !choice.inCurrentWorktree)).toBe(true)
  })

  it("印を付けた一覧に無いセッションは、いまの作業ツリーの行として並ぶ", async () => {
    const catalog = catalogOf([])

    catalog.noteMarked("s-new", TAG)

    expect(await catalog.listChoices(TAG)).toEqual([
      choiceOf("s-new", 1_000, { heading: undefined }),
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

    expect(await listChoicesOf(sessions, TAG)).toEqual([choiceOf("s-work", 100)])
    expect(await listChoicesOf(sessions, CHAT_TAG)).toEqual([choiceOf("s-chat", 300)])
  })

  it("印の無いセッションと壊れた要素は落とす（昔の印は残す）", async () => {
    const sessions = [
      null,
      sessionRecord({ sessionId: "s-bare", lastModified: 900 }),
      sessionRecord({ sessionId: "s-other-tool", lastModified: 800, tag: "別の道具" }),
      sessionRecord({ sessionId: "s-broken", lastModified: "きのう", tag: TAG }),
      sessionRecord({ sessionId: 1, lastModified: 600, tag: TAG }),
      { lastModified: 700, tag: TAG },
      sessionRecord({ sessionId: "s-legacy", lastModified: 500, tag: "tsukumo:架空のパック" }),
    ]

    expect(await listChoicesOf(sessions, TAG)).toEqual([choiceOf("s-legacy", 500)])
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
      choiceOf("s-titled", 400, { heading: "架空の作業その1" }),
      choiceOf("s-missing", 300, { heading: undefined }),
      choiceOf("s-number", 200, { heading: undefined }),
      choiceOf("s-blank", 100, { heading: undefined }),
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
