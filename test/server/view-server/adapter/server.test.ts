import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { get } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createORPCClient, ORPCError } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createRpcRouter, type RpcRouterPorts } from "../../../../src/router.ts"
import {
  characterChangedEvent,
  listCharacterPacks,
  readCharacterAsset,
} from "../../../../src/server/character-pack/adapter/character-pack.ts"
import {
  createStartupToken,
  type FindReportImage,
  type ServeCharacterAsset,
  startViewServer,
  type ViewServer,
} from "../../../../src/server/view-server/adapter/server.ts"
import type { AchievementCalendar } from "../../../../src/shared/achievement/achievement-calendar.ts"
import type {
  AchievementDaySelection,
  DailyAchievement,
} from "../../../../src/shared/achievement/achievement.ts"
import type { CharacterAssetLocation } from "../../../../src/shared/character-pack/character-asset.ts"
import { UNAVAILABLE_CONTEXT_USAGE } from "../../../../src/shared/context-usage/context-usage.ts"
import { UNAVAILABLE_PLAN_USAGE } from "../../../../src/shared/plan-usage/plan-usage.ts"
import { reportImagePath } from "../../../../src/shared/report/report-image.ts"
import { RPC_PATH, type RpcClient } from "../../../../src/shared/rpc.ts"
import { promptImagePath } from "../../../../src/shared/session-driver/prompt-image.ts"
import { UNAVAILABLE_SESSION_DIGEST } from "../../../../src/shared/session/session-digest.ts"
import {
  EMPTY_TOKEN_USAGE_SUMMARY,
  type TokenUsageDays,
  type TokenUsageSummary,
} from "../../../../src/shared/token-usage/token-usage-summary.ts"
import { readyContextUsage } from "../../../fixture/context-usage.ts"
import { PLAIN_PROJECT_SETTINGS_DRAFT } from "../../../fixture/project-settings.ts"

// 会話は流さない（配るのはページ・同梱物・立ち絵と、架空のファイル一覧だけ）。
const TOKEN = createStartupToken()

let runningView: ViewServer | undefined

/** ブラウザ側スクリプトの代役。本物のビルドはしない（テストから `vite build` を起こさない）。 */
const TEST_UI_SCRIPT = "/* テスト用の ui スクリプト */"

/** CSS の代役。本物のビルドはしない。 */
const TEST_STYLE_SHEET = "/* テスト用の CSS */"

/** `import()` で分けたチャンクの代役。 */
const TEST_CHUNK_NAME = "markdown.js"
const TEST_CHUNK = "/* テスト用のチャンク */"

/**
 * `/character/<pack>/<file>` を配る係の代役。既定では何も配らない（404）。個々のテストが必要な分だけ
 * 上書きする（`readCharacterAsset` の代役）。
 */
function noCharacterAsset(): undefined {
  return undefined
}

/** 棚の代役。既定では何も置いていない（どの id を引いても無い）。 */
function noPromptImage(): undefined {
  return undefined
}

function noReportImage(): undefined {
  return undefined
}

/**
 * 手続きの口の代役。既定では、ファイル一覧は空（git リポジトリでないとき）、集計は記録が1件も
 * 無い期間、内訳は取れない（セッションがまだ繋がっていない）、成果と暦は「main が読めない」。
 * 個々のテストが必要な分だけ上書きする。
 */
const EMPTY_RPC_PORTS = {
  listRepositoryFiles: () => Promise.resolve([]),
  projectName: () => "架空のプロジェクト",
  projectSettingsDraft: () => Promise.resolve(PLAIN_PROJECT_SETTINGS_DRAFT),
  readTokenUsageSummary: () => EMPTY_TOKEN_USAGE_SUMMARY,
  readContextUsage: () => Promise.resolve(UNAVAILABLE_CONTEXT_USAGE),
  readPlanUsage: () => Promise.resolve(UNAVAILABLE_PLAN_USAGE),
  readSessionDigest: () => Promise.resolve(UNAVAILABLE_SESSION_DIGEST),
  readAchievementDay: () => Promise.resolve({ kind: "ok", achievement: { kind: "unknown" } }),
  readAchievementCalendar: () => Promise.resolve({ kind: "ok", calendar: { kind: "unknown" } }),
  reportBrowserError: () => {},
} satisfies RpcRouterPorts

async function startView(
  serveCharacterAsset: ServeCharacterAsset = noCharacterAsset,
  findPromptImage: (id: string) => string | undefined = noPromptImage,
  rpcPorts: Partial<RpcRouterPorts> = {},
  findReportImage: FindReportImage = noReportImage,
  onRuntimeError: (error: unknown) => void = () => {},
): Promise<ViewServer> {
  const server = await startViewServer(0, {
    ui: () => ({
      kind: "bundle",
      bundle: {
        uiScript: TEST_UI_SCRIPT,
        styleSheet: TEST_STYLE_SHEET,
        chunks: new Map([[TEST_CHUNK_NAME, TEST_CHUNK]]),
      },
    }),
    serveCharacterAsset,
    findPromptImage,
    findReportImage,
    rpcRouter: createRpcRouter({ ...EMPTY_RPC_PORTS, ...rpcPorts }),
    token: TOKEN,
    onRuntimeError,
  })
  runningView = server
  return server
}

/** 手続きの口だけを差し替えて起こす。 */
function startViewWithRpc(rpcPorts: Partial<RpcRouterPorts>): Promise<ViewServer> {
  return startView(noCharacterAsset, noPromptImage, rpcPorts)
}

/** ブラウザと同じ型付きの client（起動トークンを `?t=` に載せる。無ければ付けない）。 */
function rpcClientOf(server: ViewServer, token: string | undefined): RpcClient {
  const url = new URL(`${viewOrigin(server)}${RPC_PATH}`)
  if (token !== undefined) {
    url.searchParams.set("t", token)
  }
  return createORPCClient(new RPCLink({ url: url.toString() }))
}

/** 手続きを生の `POST` で呼ぶ（client が送らない形・ヘッダを確かめるため）。 */
function postRpc(
  server: ViewServer,
  procedurePath: string,
  init: { readonly body?: string; readonly origin?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (init.origin !== undefined) {
    headers["origin"] = init.origin
  }
  return fetch(`${viewOrigin(server)}${RPC_PATH}/${procedurePath}?t=${TOKEN}`, {
    method: "POST",
    headers,
    body: init.body ?? "{}",
  })
}

/** 手続きの呼び出しが投げた契約のエラーの `code` と `status`（投げなければ `undefined`）。 */
async function rpcErrorOf(
  call: Promise<unknown>,
): Promise<{ readonly code: string; readonly status: number } | undefined> {
  try {
    await call
    return undefined
  } catch (error) {
    return error instanceof ORPCError ? { code: error.code, status: error.status } : undefined
  }
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

    expect(viewOrigin(server).startsWith("http://127.0.0.1:")).toBe(true)
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

  it("/ の応答は、スクリプトを同じオリジンのファイルだけに絞る CSP を付ける", async () => {
    const server = await startView()

    const policy = (await fetch(server.layoutUrl)).headers.get("content-security-policy") ?? ""

    expect(policy.split("; ")).toContain("script-src 'self'")
    expect(policy.split("; ")).toContain("object-src 'none'")
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

  it("/assets/<チャンクの名前> が、組み立てたチャンクを返す", async () => {
    const server = await startView()

    const response = await fetch(`${viewOrigin(server)}/assets/${TEST_CHUNK_NAME}`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/javascript")
    expect(await response.text()).toBe(TEST_CHUNK)
  })

  it("/assets/ の下で組み立てた名前の一覧に無いものは 404 を返す（ディスクを読みに行かない）", async () => {
    const server = await startView()
    const origin = viewOrigin(server)

    expect((await fetch(`${origin}/assets/other.js`)).status).toBe(404)
    expect((await fetch(`${origin}/assets/..%2Fpackage.json`)).status).toBe(404)
  })

  it("開発サーバを差し込んだときは、ページを開発サーバに通し、経路に無い要求をそちらへ回す", async () => {
    const server = await startViewServer(0, {
      ui: () => ({
        kind: "dev",
        devServer: {
          entryScriptPath: "/main.tsx",
          transformPage: (_url, html) =>
            Promise.resolve(html.replace("</head>", "<!-- hmr -->\n</head>")),
          handle: (request, response, next) => {
            if (request.url !== "/main.tsx") {
              next()
              return
            }
            response.writeHead(200, { "content-type": "text/javascript" })
            response.end("/* 開発サーバの入口 */")
          },
          ownsUpgrade: () => false,
        },
      }),
      serveCharacterAsset: noCharacterAsset,
      findPromptImage: noPromptImage,
      findReportImage: noReportImage,
      rpcRouter: createRpcRouter(EMPTY_RPC_PORTS),
      token: TOKEN,
      onRuntimeError: () => {},
    })
    runningView = server
    const origin = viewOrigin(server)

    const pageResponse = await fetch(server.layoutUrl)
    expect(pageResponse.headers.get("content-security-policy")?.split("; ")).toContain(
      "script-src 'self' 'unsafe-inline'",
    )
    const page = await pageResponse.text()
    expect(page).toContain('<script type="module" src="/main.tsx"></script>')
    expect(page).toContain("<!-- hmr -->")
    expect(page).not.toContain("/assets/style.css")

    expect(await (await fetch(`${origin}/main.tsx`)).text()).toBe("/* 開発サーバの入口 */")
    expect((await fetch(`${origin}/assets/ui.js`)).status).toBe(404)
    expect((await fetch(`${origin}/unknown`)).status).toBe(404)
  })

  it("外部ライブラリを配る（allowlist に載っている名前だけ）", async () => {
    const server = await startView()
    const origin = viewOrigin(server)

    const theme = await fetch(`${origin}/vendor/highlight-theme.min.css`)
    expect(theme.status).toBe(200)
    expect(theme.headers.get("content-type")).toContain("text/css")
    expect(theme.headers.get("cache-control")).toBe("max-age=3600")

    const chart = await fetch(`${origin}/vendor/chart.umd.min.js`)
    expect(chart.status).toBe(200)
    expect(chart.headers.get("content-type")).toContain("text/javascript")
    expect((await chart.text()).length).toBeGreaterThan(1000)
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
        ? {
            contentType: "image/svg+xml; charset=utf-8",
            content: Buffer.from("<svg></svg>"),
            versioned: false,
          }
        : undefined
    })
    const origin = viewOrigin(server)

    const response = await fetch(`${origin}/character/my%20pack/default.svg?v=1`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("image/svg+xml")
    expect(await response.text()).toBe("<svg></svg>")
    expect(asked).toEqual([{ pack: "my pack", fileName: "default.svg" }])
  })

  it("/character/<pack>/<file> の `?v=` は、そのまま素材を引く側へ渡る（無ければ undefined）", async () => {
    const versions: (string | undefined)[] = []
    const server = await startView((_location, version) => {
      versions.push(version)
      return { contentType: "image/png", content: Buffer.from("x"), versioned: false }
    })
    const origin = viewOrigin(server)

    await fetch(`${origin}/character/p/a.png?v=1700000000000`)
    await fetch(`${origin}/character/p/a.png`)

    expect(versions).toEqual(["1700000000000", undefined])
  })

  it("/character/<pack>/<file> は、版が合った（versioned）ときだけ長期のキャッシュを指定し、そうでなければ no-store", async () => {
    const server = await startView((location) => ({
      contentType: "image/png",
      content: Buffer.from("x"),
      versioned: location.pack === "versioned",
    }))
    const origin = viewOrigin(server)

    const cached = await fetch(`${origin}/character/versioned/a.png?v=1`)
    const uncached = await fetch(`${origin}/character/other/a.png?v=1`)

    expect(cached.headers.get("cache-control")).toBe("max-age=31536000, immutable")
    expect(uncached.headers.get("cache-control")).toBe("no-store")
  })

  it("/character/<pack>/<file> は、直接開かれてもスクリプトが動かない CSP（sandbox）を付ける", async () => {
    const server = await startView(() => ({
      contentType: "image/svg+xml",
      content: Buffer.from("<svg/>"),
      versioned: false,
    }))

    const response = await fetch(`${viewOrigin(server)}/character/a/default.svg`)

    expect(response.headers.get("content-security-policy")?.split("; ")).toEqual(
      expect.arrayContaining(["default-src 'none'", "sandbox"]),
    )
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

  describe("/rpc（読み取りの手続き）", () => {
    it("repository.listFiles は、候補のパスを並びで返す。一覧を作れなかった回は空", async () => {
      const found = await startViewWithRpc({
        listRepositoryFiles: () => Promise.resolve(["src/cli.ts", "docs/architecture.md"]),
      })
      expect(await rpcClientOf(found, TOKEN).repository.listFiles()).toEqual([
        "src/cli.ts",
        "docs/architecture.md",
      ])
      await found.close()

      const failed = await startViewWithRpc({
        listRepositoryFiles: () => Promise.reject(new Error("架空の失敗")),
      })
      expect(await rpcClientOf(failed, TOKEN).repository.listFiles()).toEqual([])
    })

    it("repository.projectName は、渡された名前を返す", async () => {
      const found = await startViewWithRpc({ projectName: () => "fictional-project" })
      expect(await rpcClientOf(found, TOKEN).repository.projectName()).toBe("fictional-project")
    })

    it("tokenUsage.summary は、日数をそのまま畳む側へ渡し、集計を返す", async () => {
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
      const asked: TokenUsageDays[] = []
      const server = await startViewWithRpc({
        readTokenUsageSummary: (days) => {
          asked.push(days)
          return summary
        },
      })

      expect(await rpcClientOf(server, TOKEN).tokenUsage.summary({ days: 30 })).toEqual(summary)
      expect(asked).toEqual([30])
    })

    it("tokenUsage.summary は、選べない日数を 400 で断る（畳む側へ渡さない）", async () => {
      let asked = 0
      const server = await startViewWithRpc({
        readTokenUsageSummary: () => {
          asked += 1
          return EMPTY_TOKEN_USAGE_SUMMARY
        },
      })

      const response = await postRpc(server, "tokenUsage/summary", {
        body: JSON.stringify({ json: { days: 999 } }),
      })

      expect(response.status).toBe(400)
      expect(asked).toBe(0)
    })

    it("contextUsage.report は、内訳を返す。問い合わせが失敗した回は「取れない」", async () => {
      const report = readyContextUsage()
      const ready = await startViewWithRpc({ readContextUsage: () => Promise.resolve(report) })
      expect(await rpcClientOf(ready, TOKEN).contextUsage.report()).toEqual(report)
      await ready.close()

      const failed = await startViewWithRpc({
        readContextUsage: () => Promise.reject(new Error("架空の失敗")),
      })
      expect(await rpcClientOf(failed, TOKEN).contextUsage.report()).toEqual(
        UNAVAILABLE_CONTEXT_USAGE,
      )
    })

    it("achievement.day は、見る日の選び方をそのまま読み取り側へ渡し、成果を返す", async () => {
      const achievement: DailyAchievement = {
        kind: "known",
        date: "2026-09-23",
        today: "2026-09-24",
        commits: { kind: "known", count: 3 },
        doneTasks: { kind: "known", items: [{ id: "T-1", summary: "架空のタスク" }] },
        graduations: [],
        milestones: [],
        diary: { kind: "none" },
      }
      const asked: AchievementDaySelection[] = []
      const server = await startViewWithRpc({
        readAchievementDay: (selection) => {
          asked.push(selection)
          return Promise.resolve({ kind: "ok", achievement })
        },
      })
      const client = rpcClientOf(server, TOKEN)

      expect(await client.achievement.day({ kind: "chosen", date: "2026-09-20" })).toEqual(
        achievement,
      )
      await client.achievement.day({ kind: "today" })

      expect(asked).toEqual([{ kind: "chosen", date: "2026-09-20" }, { kind: "today" }])
    })

    it("achievement は、main が読めなくても「不明」を返す", async () => {
      const client = rpcClientOf(await startView(), TOKEN)

      expect(await client.achievement.day({ kind: "today" })).toEqual({ kind: "unknown" })
      expect(await client.achievement.calendar()).toEqual({ kind: "unknown" })
    })

    it("achievement.calendar は、暦を返す", async () => {
      const calendar: AchievementCalendar = {
        kind: "known",
        today: "2026-09-25",
        counted: "commits",
        days: [{ date: "2026-09-25", count: 3 }],
        diaryDates: [],
      }
      const server = await startViewWithRpc({
        readAchievementCalendar: () => Promise.resolve({ kind: "ok", calendar }),
      })

      expect(await rpcClientOf(server, TOKEN).achievement.calendar()).toEqual(calendar)
    })

    it("achievement は、git の呼び出しが一時的に失敗したときは 503 の UNAVAILABLE（部分的な数を出さない）", async () => {
      const server = await startViewWithRpc({
        readAchievementDay: () => Promise.resolve({ kind: "unavailable" }),
        readAchievementCalendar: () => Promise.reject(new Error("架空の失敗")),
      })
      const client = rpcClientOf(server, TOKEN)

      expect(await rpcErrorOf(client.achievement.day({ kind: "today" }))).toEqual({
        code: "UNAVAILABLE",
        status: 503,
      })
      expect(await rpcErrorOf(client.achievement.calendar())).toEqual({
        code: "UNAVAILABLE",
        status: 503,
      })
    })

    it("トークンが無い・違うときは 403 で、どの手続きの口も呼ばない", async () => {
      let asked = 0
      const count = <T>(value: T): T => {
        asked += 1
        return value
      }
      const server = await startViewWithRpc({
        listRepositoryFiles: () => count(Promise.resolve([])),
        readTokenUsageSummary: () => count(EMPTY_TOKEN_USAGE_SUMMARY),
        readContextUsage: () => count(Promise.resolve(UNAVAILABLE_CONTEXT_USAGE)),
        readAchievementDay: () =>
          count(Promise.resolve({ kind: "ok", achievement: { kind: "unknown" } })),
        readAchievementCalendar: () =>
          count(Promise.resolve({ kind: "ok", calendar: { kind: "unknown" } })),
      })

      for (const token of [undefined, "ちがう"]) {
        const client = rpcClientOf(server, token)
        const forbidden = { code: "FORBIDDEN", status: 403 }
        expect(await rpcErrorOf(client.repository.listFiles())).toEqual(forbidden)
        expect(await rpcErrorOf(client.repository.projectName())).toEqual(forbidden)
        expect(await rpcErrorOf(client.tokenUsage.summary({ days: 7 }))).toEqual(forbidden)
        expect(await rpcErrorOf(client.contextUsage.report())).toEqual(forbidden)
        expect(await rpcErrorOf(client.achievement.day({ kind: "today" }))).toEqual(forbidden)
        expect(await rpcErrorOf(client.achievement.calendar())).toEqual(forbidden)
      }
      expect(asked).toBe(0)
    })

    it("Origin があるときは自分のオリジンと一致しなければ 403（無ければ通す）", async () => {
      let asked = 0
      const server = await startViewWithRpc({
        listRepositoryFiles: () => {
          asked += 1
          return Promise.resolve([])
        },
      })

      const foreign = await postRpc(server, "repository/listFiles", {
        origin: "http://example.invalid",
      })
      const own = await postRpc(server, "repository/listFiles", { origin: viewOrigin(server) })
      const none = await postRpc(server, "repository/listFiles")

      expect(foreign.status).toBe(403)
      expect(own.status).toBe(200)
      expect(none.status).toBe(200)
      expect(asked).toBe(2)
    })

    it("知らない手続きは 404", async () => {
      const server = await startView()

      expect((await postRpc(server, "repository/unknown")).status).toBe(404)
    })

    it("本文が上限を超えた要求は手続きへ渡さずに断る", async () => {
      let asked = 0
      const server = await startViewWithRpc({
        readTokenUsageSummary: () => {
          asked += 1
          return EMPTY_TOKEN_USAGE_SUMMARY
        },
      })

      const response = await postRpc(server, "tokenUsage/summary", {
        body: JSON.stringify({ json: { days: 7, padding: "x".repeat(128 * 1024) } }),
      })

      expect(response.status).toBe(413)
      expect(asked).toBe(0)
    })
  })

  describe("/prompt-image/<id>", () => {
    // 棚に置いた原寸の代役。中身は手で書いた数バイト（実物の画像は使わない）。
    const SHELVED_ID = "0b6f7a52-3c1e-4d7a-9f2b-5e8c1d4a6b3f"
    const SHELVED_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03])
    const SHELVED_DATA_URL = `data:image/png;base64,${SHELVED_BYTES.toString("base64")}`

    function promptImageUrl(server: ViewServer, id: string, token: string | undefined): string {
      const path = `${viewOrigin(server)}${promptImagePath(id)}`
      return token === undefined ? path : `${path}?t=${token}`
    }

    function startWithShelf(requested: string[] = []): Promise<ViewServer> {
      return startView(noCharacterAsset, (id) => {
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

  describe("/report-image/<toolUseId>/<path>", () => {
    // 棚に置いた画像の代役。中身は手で書いた数バイト（実物の画像は使わない）。
    const SHELVED_TOOL_USE_ID = "toolu_fictional"
    const SHELVED_PATH = "架空/after.png"
    const SHELVED_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03])

    function reportImageUrl(server: ViewServer, path: string, token: string | undefined): string {
      const url = `${viewOrigin(server)}${reportImagePath(SHELVED_TOOL_USE_ID, path)}`
      return token === undefined ? url : `${url}?t=${token}`
    }

    function startWithShelf(requested: string[] = []): Promise<ViewServer> {
      return startView(noCharacterAsset, noPromptImage, {}, (toolUseId, path) => {
        requested.push(path)
        return toolUseId === SHELVED_TOOL_USE_ID && path === SHELVED_PATH
          ? { mediaType: "image/png", content: SHELVED_BYTES }
          : undefined
      })
    }

    it("正しいトークンなら、鍵の組が指す棚の画像をそのメディアタイプで配る", async () => {
      const server = await startWithShelf()

      const response = await fetch(reportImageUrl(server, SHELVED_PATH, TOKEN))

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("image/png")
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(SHELVED_BYTES)
    })

    it("トークンが無い・違うときは 403（棚を引きにも行かない）", async () => {
      const requested: string[] = []
      const server = await startWithShelf(requested)

      const missing = await fetch(reportImageUrl(server, SHELVED_PATH, undefined))
      const wrong = await fetch(reportImageUrl(server, SHELVED_PATH, createStartupToken()))

      expect(missing.status).toBe(403)
      expect(wrong.status).toBe(403)
      expect(requested).toEqual([])
    })

    it("棚に無いパスは 404、鍵の形が崩れているときは棚を引きにも行かず 404", async () => {
      const requested: string[] = []
      const server = await startWithShelf(requested)

      const absent = await fetch(reportImageUrl(server, "架空/before.png", TOKEN))
      const noPath = await fetch(`${viewOrigin(server)}/report-image/toolu_fictional?t=${TOKEN}`)
      const badId = await fetch(`${viewOrigin(server)}/report-image/a.b/x.png?t=${TOKEN}`)
      const badEscape = await fetch(
        `${viewOrigin(server)}/report-image/toolu_fictional/%E3?t=${TOKEN}`,
      )

      expect(absent.status).toBe(404)
      expect(noPath.status).toBe(404)
      expect(badId.status).toBe(404)
      expect(badEscape.status).toBe(404)
      expect(requested).toEqual(["架空/before.png"])
    })
  })

  it("listen 後に error が起きても閉じない。stderr に1行書き、onRuntimeError にもそのまま渡して配信を続ける", async () => {
    const runtimeErrors: unknown[] = []
    const server = await startView(noCharacterAsset, noPromptImage, {}, noReportImage, (error) =>
      runtimeErrors.push(error),
    )
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    const error = new Error("架空のエラー")

    try {
      server.httpServer.emit("error", error)

      expect(stderr).toHaveBeenCalledWith(expect.stringContaining("架空のエラー"))
      expect(runtimeErrors).toEqual([error])
      // プロセスは落ちず、配信も続く。
      expect((await fetch(server.layoutUrl)).status).toBe(200)
    } finally {
      stderr.mockRestore()
    }
  })
})

// 一覧に載せた URL をそのまま引いて、配信の全体（経路の読み分け → 一覧との突き合わせ →
// パックごとの allowlist）を確かめる（docs/architecture/character-pack.md「パックの一覧と素材の URL」）。素材は手で書いた
// 架空の SVG / PNG の中身で、置き場は一時ディレクトリ（本物の `~/.tsukumo` を読まない）。
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
   * `createCurrentCharacter` と同じ組み方でサーバを起こす。一覧（`packs`）も返す。
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

    const server = await startView((location, version) =>
      readCharacterAsset(current, packs, location, version),
    )
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
