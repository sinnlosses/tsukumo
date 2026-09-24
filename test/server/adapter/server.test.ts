import { afterEach, describe, expect, it, spyOn } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { get } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  characterChangedEvent,
  listCharacterPacks,
  readCharacterAsset,
} from "../../../src/server/adapter/character-pack.ts"
import {
  createStartupToken,
  type ReadAchievement,
  type ServeCharacterAsset,
  startViewServer,
  type ViewServer,
} from "../../../src/server/adapter/server.ts"
import { ACHIEVEMENT_PATH, type DailyAchievement } from "../../../src/shared/achievement.ts"
import { type CharacterAssetLocation } from "../../../src/shared/character-asset.ts"
import {
  CONTEXT_USAGE_PATH,
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../../src/shared/context-usage.ts"
import { promptImagePath } from "../../../src/shared/prompt-image.ts"
import { REPOSITORY_FILE_PATH } from "../../../src/shared/repository-file.ts"
import {
  EMPTY_TOKEN_USAGE_SUMMARY,
  TOKEN_USAGE_SUMMARY_PATH,
  type TokenUsageDays,
  type TokenUsageSummary,
} from "../../../src/shared/token-usage-summary.ts"
import { readyContextUsage } from "../../fixture/context-usage.ts"

// 会話は流さない（配るのはページ・同梱物・立ち絵と、架空のファイル一覧だけ）。
const TOKEN = createStartupToken()

let runningView: ViewServer | undefined

/** ブラウザ側スクリプトの代役。**本物のビルドはしない**（テストから `bun build` を起こさない）。 */
const TEST_UI_SCRIPT = "/* テスト用の ui スクリプト */"

/** CSS の代役。**本物のビルドはしない**。 */
const TEST_STYLE_SHEET = "/* テスト用の CSS */"

/**
 * `/character/<pack>/<file>` を配る係の代役。既定では何も配らない（404）。個々のテストが必要な分だけ
 * 上書きする（`src/server/adapter/character-pack.ts` の `readCharacterAsset` の代役）。
 */
function noCharacterAsset(): undefined {
  return undefined
}

/** ファイル一覧の代役。既定では一覧そのものが空（git リポジトリでないときと同じ）。 */
function noRepositoryFile(): Promise<readonly string[]> {
  return Promise.resolve([])
}

/** 集計の代役。既定では記録が1件も無い期間と同じ（3つの軸がどれも空）。 */
function noTokenUsage(): TokenUsageSummary {
  return EMPTY_TOKEN_USAGE_SUMMARY
}

/** 内訳の代役。既定では取れなかったとき（セッションがまだ繋がっていないときと同じ）。 */
function noContextUsage(): Promise<ContextUsageReport> {
  return Promise.resolve(UNAVAILABLE_CONTEXT_USAGE)
}

/** 棚の代役。既定では何も置いていない（どの id を引いても無い）。 */
function noPromptImage(): undefined {
  return undefined
}

/** 成果の代役。既定では「main が読めない」（`main` ブランチが無いリポジトリと同じ）。 */
function noAchievement(): Promise<{ readonly kind: "ok"; readonly achievement: DailyAchievement }> {
  return Promise.resolve({ kind: "ok", achievement: { kind: "unknown" } })
}

async function startView(
  serveCharacterAsset: ServeCharacterAsset = noCharacterAsset,
  listRepositoryFiles: () => Promise<readonly string[]> = noRepositoryFile,
  readTokenUsageSummary: (days: TokenUsageDays) => TokenUsageSummary = noTokenUsage,
  readContextUsage: () => Promise<ContextUsageReport> = noContextUsage,
  findPromptImage: (id: string) => string | undefined = noPromptImage,
  readAchievement: ReadAchievement = noAchievement,
): Promise<ViewServer> {
  const server = await startViewServer(0, {
    assets: { uiScript: () => TEST_UI_SCRIPT, styleSheet: () => TEST_STYLE_SHEET },
    serveCharacterAsset,
    listRepositoryFiles,
    readTokenUsageSummary,
    readContextUsage,
    findPromptImage,
    readAchievement,
    token: TOKEN,
  })
  runningView = server
  return server
}

/** ファイル一覧の URL（起動トークン付き）。 */
function repositoryFileUrl(server: ViewServer, token: string | undefined): string {
  const origin = viewOrigin(server)
  return token === undefined
    ? `${origin}${REPOSITORY_FILE_PATH}`
    : `${origin}${REPOSITORY_FILE_PATH}?t=${token}`
}

/** 集計の URL（起動トークンと、指定があれば期間の長さ付き）。 */
function tokenUsageUrl(server: ViewServer, token: string | undefined, days?: number): string {
  const url = new URL(`${viewOrigin(server)}${TOKEN_USAGE_SUMMARY_PATH}`)
  if (token !== undefined) {
    url.searchParams.set("t", token)
  }
  if (days !== undefined) {
    url.searchParams.set("days", String(days))
  }
  return url.toString()
}

/** 内訳の URL（起動トークン付き）。 */
function contextUsageUrl(server: ViewServer, token: string | undefined): string {
  const url = new URL(`${viewOrigin(server)}${CONTEXT_USAGE_PATH}`)
  if (token !== undefined) {
    url.searchParams.set("t", token)
  }
  return url.toString()
}

/** 成果の URL（起動トークンと、指定があれば見る日付付き）。 */
function achievementUrl(server: ViewServer, token: string | undefined, date?: string): string {
  const url = new URL(`${viewOrigin(server)}${ACHIEVEMENT_PATH}`)
  if (token !== undefined) {
    url.searchParams.set("t", token)
  }
  if (date !== undefined) {
    url.searchParams.set("date", date)
  }
  return url.toString()
}

afterEach(async () => {
  await runningView?.close()
  runningView = undefined
})

function viewOrigin(server: ViewServer): string {
  return new URL(server.layoutUrl).origin
}

describe("startViewServer", () => {
  it("ループバックにだけバインドする", async () => {
    const server = await startView()

    expect(viewOrigin(server)).toStartWith("http://127.0.0.1:")
  })

  it("layoutUrl は同じサーバの / を指す", async () => {
    const server = await startView()

    expect(server.layoutUrl).toBe(`${viewOrigin(server)}/`)
  })

  it('/ が <div id="app"> と ui.js への script タグを持つページを返す', async () => {
    const server = await startView()

    const response = await fetch(server.layoutUrl)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('<div id="app"></div>')
    expect(body).toContain('<script type="module" src="/assets/ui.js"></script>')
    expect(body).toContain('<link rel="stylesheet" href="/assets/style.css">')
  })

  it("/assets/ui.js が、起動時に組み立てたブラウザ側スクリプトを返す", async () => {
    const server = await startView()

    const response = await fetch(`${viewOrigin(server)}/assets/ui.js`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/javascript")
    expect(await response.text()).toBe(TEST_UI_SCRIPT)
  })

  it("/assets/style.css が、起動時に組み立てた CSS を返す", async () => {
    const server = await startView()

    const response = await fetch(`${viewOrigin(server)}/assets/style.css`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/css")
    expect(await response.text()).toBe(TEST_STYLE_SHEET)
  })

  it("外部ライブラリを配る（allowlist に載っている名前だけ）", async () => {
    const server = await startView()
    const origin = viewOrigin(server)

    const theme = await fetch(`${origin}/vendor/highlight-theme.min.css`)
    expect(theme.status).toBe(200)
    expect(theme.headers.get("content-type")).toContain("text/css")

    const chart = await fetch(`${origin}/vendor/chart.umd.min.js`)
    expect(chart.status).toBe(200)
    expect(chart.headers.get("content-type")).toContain("text/javascript")
    expect((await chart.text()).length).toBeGreaterThan(1000)
  })

  it("消えたファイル（highlight.min.js / idiomorph.min.js）はもう配らない（移行の段6）", async () => {
    const server = await startView()
    const origin = viewOrigin(server)

    expect((await fetch(`${origin}/vendor/highlight.min.js`)).status).toBe(404)
    expect((await fetch(`${origin}/vendor/idiomorph.min.js`)).status).toBe(404)
  })

  it("allowlist に無い名前・上のディレクトリを指す名前は配らない", async () => {
    const server = await startView()
    const origin = viewOrigin(server)

    // allowlist に無い名前。
    expect((await fetch(`${origin}/vendor/other.js`)).status).toBe(404)
    // パスを組み立てないので、`..` を書いても外のファイルには届かない。
    expect((await fetch(`${origin}/vendor/../package.json`)).status).toBe(404)
    expect((await fetch(`${origin}/vendor/%2e%2e/package.json`)).status).toBe(404)
  })

  it("知らない経路には404を返す", async () => {
    const server = await startView()

    const response = await fetch(`${viewOrigin(server)}/balloon`)

    expect(response.status).toBe(404)
  })

  it("/character/<pack>/<file> は、デコードしたパック名とファイル名で引いた中身をそのまま配る", async () => {
    const asked: CharacterAssetLocation[] = []
    const server = await startView((location) => {
      asked.push(location)
      return location.fileName === "default.svg"
        ? { contentType: "image/svg+xml; charset=utf-8", content: Buffer.from("<svg></svg>") }
        : undefined
    })
    const origin = viewOrigin(server)

    const response = await fetch(`${origin}/character/my%20pack/default.svg?v=1`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("image/svg+xml")
    expect(await response.text()).toBe("<svg></svg>")
    expect(asked).toEqual([{ pack: "my pack", fileName: "default.svg" }])
  })

  it("/character/<pack>/<file> は、定義に無いファイル名（serveCharacterAsset が undefined を返す）なら404", async () => {
    const server = await startView()

    const response = await fetch(`${viewOrigin(server)}/character/fictional/not-defined.svg`)

    expect(response.status).toBe(404)
  })

  it("/character/<file>（パック名の無い形）は引きに行かずに404", async () => {
    const asked: CharacterAssetLocation[] = []
    const server = await startView((location) => {
      asked.push(location)
      return undefined
    })

    const response = await fetch(`${viewOrigin(server)}/character/default.svg`)

    expect(response.status).toBe(404)
    expect(asked).toEqual([])
  })

  it("/repository-file は、正しいトークンなら候補のパスを JSON の並びで返す", async () => {
    const server = await startView(noCharacterAsset, () =>
      Promise.resolve(["src/cli.ts", "docs/design.md"]),
    )

    const response = await fetch(repositoryFileUrl(server, TOKEN))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(await response.json()).toEqual(["src/cli.ts", "docs/design.md"])
  })

  it("/repository-file は、git リポジトリでない（一覧が空の）ときも空の並びを返す", async () => {
    const server = await startView()

    const response = await fetch(repositoryFileUrl(server, TOKEN))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
  })

  it("/repository-file は、トークンが無い・違うときは 403（一覧を作りにも行かない）", async () => {
    let asked = 0
    const server = await startView(noCharacterAsset, () => {
      asked += 1
      return Promise.resolve(["src/cli.ts"])
    })

    expect((await fetch(repositoryFileUrl(server, undefined))).status).toBe(403)
    expect((await fetch(repositoryFileUrl(server, "ちがう"))).status).toBe(403)
    expect(asked).toBe(0)
  })

  it("/token-usage は、正しいトークンなら集計を JSON で返す", async () => {
    const summary = {
      trend: {
        unit: "day",
        points: [
          {
            key: "2026-09-21",
            totals: {
              inputTokens: 12,
              outputTokens: 34,
              thinkingTokens: 5,
              cacheReadInputTokens: 6,
              cacheCreationInputTokens: 7,
              costUsd: 0.5,
            },
          },
        ],
      },
      byModel: [],
      byTool: [{ name: "Bash", calls: 3, resultBytes: 800 }],
    } satisfies TokenUsageSummary
    const server = await startView(noCharacterAsset, noRepositoryFile, () => summary)

    const response = await fetch(tokenUsageUrl(server, TOKEN))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(await response.json()).toEqual(summary)
  })

  it("/token-usage は、days をそのまま畳む側へ渡す（選べない値は既定の7日に落ちる）", async () => {
    const asked: number[] = []
    const server = await startView(noCharacterAsset, noRepositoryFile, (days) => {
      asked.push(days)
      return EMPTY_TOKEN_USAGE_SUMMARY
    })

    await fetch(tokenUsageUrl(server, TOKEN, 30))
    await fetch(tokenUsageUrl(server, TOKEN, 999))

    expect(asked).toEqual([30, 7])
  })

  it("/token-usage は、記録が1件も無くても空の集計を 200 で返す", async () => {
    const server = await startView()

    const response = await fetch(tokenUsageUrl(server, TOKEN))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(EMPTY_TOKEN_USAGE_SUMMARY)
  })

  it("/token-usage は、トークンが無い・違うときは 403（集計を作りにも行かない）", async () => {
    let asked = 0
    const server = await startView(noCharacterAsset, noRepositoryFile, () => {
      asked += 1
      return EMPTY_TOKEN_USAGE_SUMMARY
    })

    expect((await fetch(tokenUsageUrl(server, undefined))).status).toBe(403)
    expect((await fetch(tokenUsageUrl(server, "ちがう"))).status).toBe(403)
    expect(asked).toBe(0)
  })

  it("/context-usage は、正しいトークンなら内訳を JSON で返す", async () => {
    const report = readyContextUsage()
    const server = await startView(noCharacterAsset, noRepositoryFile, noTokenUsage, () =>
      Promise.resolve(report),
    )

    const response = await fetch(contextUsageUrl(server, TOKEN))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(report)
  })

  it("/context-usage は、セッションがまだ繋がっていない回も 200 で「取れない」を返す", async () => {
    const server = await startView()

    const response = await fetch(contextUsageUrl(server, TOKEN))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(UNAVAILABLE_CONTEXT_USAGE)
  })

  it("/context-usage は、トークンが無い・違うときは 403（駆動に問い合わせにも行かない）", async () => {
    let asked = 0
    const server = await startView(noCharacterAsset, noRepositoryFile, noTokenUsage, () => {
      asked += 1
      return Promise.resolve(UNAVAILABLE_CONTEXT_USAGE)
    })

    expect((await fetch(contextUsageUrl(server, undefined))).status).toBe(403)
    expect((await fetch(contextUsageUrl(server, "ちがう"))).status).toBe(403)
    expect(asked).toBe(0)
  })

  it("/achievement は、正しいトークンなら成果を JSON で返す", async () => {
    const achievement: DailyAchievement = {
      kind: "known",
      date: "2026-09-23",
      today: "2026-09-24",
      commitCount: 3,
      doneTasks: { kind: "known", items: [{ id: "T-1", summary: "架空のタスク" }] },
      graduations: [],
      milestones: [],
    }
    const server = await startView(
      noCharacterAsset,
      noRepositoryFile,
      noTokenUsage,
      noContextUsage,
      noPromptImage,
      () => Promise.resolve({ kind: "ok", achievement }),
    )

    const response = await fetch(achievementUrl(server, TOKEN))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(await response.json()).toEqual(achievement)
  })

  it("/achievement は、date をそのまま読み取り側へ渡す（検証は配線層の仕事）", async () => {
    const asked: (string | undefined)[] = []
    const server = await startView(
      noCharacterAsset,
      noRepositoryFile,
      noTokenUsage,
      noContextUsage,
      noPromptImage,
      (rawDate) => {
        asked.push(rawDate)
        return noAchievement()
      },
    )

    await fetch(achievementUrl(server, TOKEN, "2026-09-20"))
    await fetch(achievementUrl(server, TOKEN))

    expect(asked).toEqual(["2026-09-20", undefined])
  })

  it("/achievement は、main が読めなくても 200 で「不明」を返す", async () => {
    const server = await startView()

    const response = await fetch(achievementUrl(server, TOKEN))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ kind: "unknown" })
  })

  it("/achievement は、git の呼び出しが一時的に失敗したときは 503（部分的な数を出さない）", async () => {
    const server = await startView(
      noCharacterAsset,
      noRepositoryFile,
      noTokenUsage,
      noContextUsage,
      noPromptImage,
      () => Promise.resolve({ kind: "unavailable" }),
    )

    const response = await fetch(achievementUrl(server, TOKEN))

    expect(response.status).toBe(503)
  })

  it("/achievement は、トークンが無い・違うときは 403（読み取りにも行かない）", async () => {
    let asked = 0
    const server = await startView(
      noCharacterAsset,
      noRepositoryFile,
      noTokenUsage,
      noContextUsage,
      noPromptImage,
      () => {
        asked += 1
        return noAchievement()
      },
    )

    expect((await fetch(achievementUrl(server, undefined))).status).toBe(403)
    expect((await fetch(achievementUrl(server, "ちがう"))).status).toBe(403)
    expect(asked).toBe(0)
  })

  describe("/prompt-image/<id>", () => {
    // 棚に置いた原寸の代役。**中身は手で書いた数バイト**（実物の画像は使わない）。
    const SHELVED_ID = "0b6f7a52-3c1e-4d7a-9f2b-5e8c1d4a6b3f"
    const SHELVED_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03])
    const SHELVED_DATA_URL = `data:image/png;base64,${SHELVED_BYTES.toString("base64")}`

    function promptImageUrl(server: ViewServer, id: string, token: string | undefined): string {
      const path = `${viewOrigin(server)}${promptImagePath(id)}`
      return token === undefined ? path : `${path}?t=${token}`
    }

    function startWithShelf(requested: string[] = []): Promise<ViewServer> {
      return startView(noCharacterAsset, noRepositoryFile, noTokenUsage, noContextUsage, (id) => {
        requested.push(id)
        return id === SHELVED_ID ? SHELVED_DATA_URL : undefined
      })
    }

    it("正しいトークンなら、棚の原寸をデコードして受け取ったときのメディアタイプで配る", async () => {
      const server = await startWithShelf()

      const response = await fetch(promptImageUrl(server, SHELVED_ID, TOKEN))

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("image/png")
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(Buffer.from(await response.arrayBuffer())).toEqual(SHELVED_BYTES)
    })

    it("トークンが無い・違うときは 403（棚を引きにも行かない）", async () => {
      const requested: string[] = []
      const server = await startWithShelf(requested)

      const missing = await fetch(promptImageUrl(server, SHELVED_ID, undefined))
      const wrong = await fetch(promptImageUrl(server, SHELVED_ID, createStartupToken()))

      expect(missing.status).toBe(403)
      expect(wrong.status).toBe(403)
      expect(requested).toEqual([])
    })

    it("棚に無い id（捨てられた原寸）は 404", async () => {
      const server = await startWithShelf()

      const response = await fetch(
        promptImageUrl(server, "7d1c2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f", TOKEN),
      )

      expect(response.status).toBe(404)
    })

    it("id の形が違う（UUID でない・上のディレクトリを指す）ときは 404（棚を引きにも行かない）", async () => {
      const requested: string[] = []
      const server = await startWithShelf(requested)

      const malformed = await fetch(promptImageUrl(server, "not-an-id", TOKEN))
      const traversal = await fetch(
        `${viewOrigin(server)}/prompt-image/..%2F..%2Fetc%2Fpasswd?t=${TOKEN}`,
      )
      const empty = await fetch(promptImageUrl(server, "", TOKEN))

      expect(malformed.status).toBe(404)
      expect(traversal.status).toBe(404)
      expect(empty.status).toBe(404)
      expect(requested).toEqual([])
    })
  })

  it("/character/<pack>/<file> は、`..` を含む要求も404（パスから組み立てないので、そのまま allowlist に無い名前として扱われる）", async () => {
    const server = await startView((location) =>
      location.pack === "fictional" && location.fileName === "default.svg"
        ? { contentType: "image/svg+xml; charset=utf-8", content: Buffer.from("<svg></svg>") }
        : undefined,
    )
    const origin = viewOrigin(server)

    expect((await fetch(`${origin}/character/%2e%2e/package.json`)).status).toBe(404)
    expect((await fetch(`${origin}/character/..%2Fdefault.svg`)).status).toBe(404)
    expect((await fetch(`${origin}/character/fictional/..%2Fdefault.svg`)).status).toBe(404)
  })

  it("listen 後に error が起きても閉じない。stderr に1行書いて配信を続ける", async () => {
    const server = await startView()
    const stderr = spyOn(process.stderr, "write").mockImplementation(() => true)

    try {
      server.httpServer.emit("error", new Error("架空のエラー"))

      expect(stderr).toHaveBeenCalledWith(expect.stringContaining("架空のエラー"))
      // プロセスは落ちず、配信も続く。
      expect((await fetch(server.layoutUrl)).status).toBe(200)
    } finally {
      stderr.mockRestore()
    }
  })
})

// 一覧に載せた URL をそのまま引いて、配信の全体（経路の読み分け → 一覧との突き合わせ →
// パックごとの allowlist）を確かめる（docs/design.md 7.2）。**素材は手で書いた
// 架空の SVG / PNG の中身**で、置き場は一時ディレクトリ（本物の `~/.tsukumo` を読まない）。
describe("キャラクターの素材（使用中以外のパックも配る）", () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>'
  const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47])

  let root: string | undefined

  afterEach(() => {
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true })
      root = undefined
    }
  })

  /**
   * 同梱に使用中の `spirit`、ホームに使用中以外の `other`（立ち絵・背景つき）を置き、
   * `current-character.ts` と同じ組み方でサーバを起こす。一覧（`packs`）も返す。
   */
  async function startWithPacks(): Promise<{
    readonly server: ViewServer
    readonly other: { readonly portrait: string; readonly background: string }
  }> {
    const base = mkdtempSync(join(tmpdir(), "tsukumo-server-character-"))
    root = base
    const bundled = join(base, "bundled")
    const home = join(base, "home")
    const cwd = join(base, "cwd")
    mkdirSync(join(bundled, "spirit"), { recursive: true })
    writeFileSync(
      join(bundled, "spirit", "character.json"),
      JSON.stringify({ portraits: { default: "default.svg" } }),
    )
    writeFileSync(join(bundled, "spirit", "default.svg"), SVG)
    mkdirSync(join(home, "other"), { recursive: true })
    writeFileSync(
      join(home, "other", "character.json"),
      JSON.stringify({
        portraits: { default: "portrait.svg" },
        background: { image: "background.png", veil: 0.5 },
      }),
    )
    writeFileSync(join(home, "other", "portrait.svg"), SVG)
    writeFileSync(join(home, "other", "background.png"), PNG_BYTES)
    // 定義に載っていないファイル（配ってはいけない）。
    writeFileSync(join(home, "other", "secret.svg"), SVG)

    const packs = listCharacterPacks(cwd, { bundled, home })
    const current = packs.find((pack) => pack.name === "spirit")
    if (current === undefined) {
      throw new Error("テストの前提: spirit が一覧に無い")
    }
    const event = characterChangedEvent(current, packs, cwd)
    const otherEntry =
      event.kind === "character-changed"
        ? event.packs.find((entry) => entry.name === "other")
        : undefined
    const portrait = otherEntry?.character.portraits?.default
    const background = otherEntry?.character.background?.image
    if (portrait === undefined || background === undefined) {
      throw new Error("テストの前提: other の立ち絵と背景が一覧に無い")
    }

    const server = await startView((location) => readCharacterAsset(current, packs, location))
    return { server, other: { portrait, background } }
  }

  it("使用中以外のパックの立ち絵を、一覧に載った URL のまま GET すると200で配る", async () => {
    const { server, other } = await startWithPacks()

    const response = await fetch(`${viewOrigin(server)}${other.portrait}`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("image/svg+xml")
    expect(await response.text()).toBe(SVG)
  })

  it("使用中以外のパックの背景も200で配る", async () => {
    const { server, other } = await startWithPacks()

    const response = await fetch(`${viewOrigin(server)}${other.background}`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/png")
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG_BYTES)
  })

  it("そのパックの定義に無いファイル名は、ディスクにあっても404", async () => {
    const { server } = await startWithPacks()

    const response = await fetch(`${viewOrigin(server)}/character/other/secret.svg`)

    expect(response.status).toBe(404)
  })

  it("`..` を含む名前は404（エンコードしたものも、生のままのものも）", async () => {
    const { server } = await startWithPacks()
    const origin = viewOrigin(server)

    // fetch は生の `..` を送る前に畳んでしまうので、エンコードした形と node:http の生の経路で送る。
    expect((await fetch(`${origin}/character/other/..%2Fother%2Fsecret.svg`)).status).toBe(404)
    expect((await fetch(`${origin}/character/..%2Fhome%2Fother/portrait.svg`)).status).toBe(404)
    expect(await rawStatus(origin, "/character/../other/portrait.svg")).toBe(404)
    expect(await rawStatus(origin, "/character/other/../spirit/default.svg")).toBe(404)
  })

  it("一覧に無いパック名は404", async () => {
    const { server } = await startWithPacks()

    const response = await fetch(`${viewOrigin(server)}/character/missing/portrait.svg`)

    expect(response.status).toBe(404)
  })
})

/** 経路を畳まずにそのまま送り、応答の状態コードだけを返す（`fetch` は `..` を送る前に畳むため）。 */
function rawStatus(origin: string, path: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = get(`${origin}/`, { path }, (response) => {
      response.resume()
      resolve(response.statusCode)
    })
    request.on("error", reject)
  })
}
