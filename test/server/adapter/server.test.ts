import { afterEach, describe, expect, it, spyOn } from "bun:test"

import {
  createStartupToken,
  startViewServer,
  type ViewServer,
} from "../../../src/server/adapter/server.ts"
import { REPOSITORY_FILE_PATH } from "../../../src/shared/repository-file.ts"
import {
  EMPTY_TOKEN_USAGE_SUMMARY,
  TOKEN_USAGE_SUMMARY_PATH,
  type TokenUsageDays,
  type TokenUsageSummary,
} from "../../../src/shared/token-usage-summary.ts"

// 会話は流さない（配るのはページ・同梱物・立ち絵と、架空のファイル一覧だけ）。
const TOKEN = createStartupToken()

let runningView: ViewServer | undefined

/** ブラウザ側スクリプトの代役。**本物のビルドはしない**（テストから `bun build` を起こさない）。 */
const TEST_UI_SCRIPT = "/* テスト用の ui スクリプト */"

/** CSS の代役。**本物のビルドはしない**。 */
const TEST_STYLE_SHEET = "/* テスト用の CSS */"

/**
 * `/character/<file>` を配る係の代役。既定では何も配らない（404）。個々のテストが必要な分だけ
 * 上書きする（`src/server/adapter/character-pack.ts` の `readCharacterPackFile` の代役）。
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

async function startView(
  serveCharacterAsset: (
    fileName: string,
  ) => { contentType: string; content: Buffer } | undefined = noCharacterAsset,
  listRepositoryFiles: () => Promise<readonly string[]> = noRepositoryFile,
  readTokenUsageSummary: (days: TokenUsageDays) => TokenUsageSummary = noTokenUsage,
): Promise<ViewServer> {
  const server = await startViewServer(0, {
    assets: { uiScript: () => TEST_UI_SCRIPT, styleSheet: () => TEST_STYLE_SHEET },
    serveCharacterAsset,
    listRepositoryFiles,
    readTokenUsageSummary,
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

  it("/character/<file> は serveCharacterAsset が返した中身をそのまま配る", async () => {
    const server = await startView((fileName) =>
      fileName === "default.svg"
        ? { contentType: "image/svg+xml; charset=utf-8", content: Buffer.from("<svg></svg>") }
        : undefined,
    )
    const origin = viewOrigin(server)

    const response = await fetch(`${origin}/character/default.svg`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("image/svg+xml")
    expect(await response.text()).toBe("<svg></svg>")
  })

  it("/character/<file> は、定義に無いファイル名（serveCharacterAsset が undefined を返す）なら404", async () => {
    const server = await startView()

    const response = await fetch(`${viewOrigin(server)}/character/not-defined.svg`)

    expect(response.status).toBe(404)
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
      byDay: [
        {
          date: "2026-09-21",
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

  it("/character/<file> は、`..` を含む要求も404（パスから組み立てないので、そのまま allowlist に無い名前として扱われる）", async () => {
    const server = await startView((fileName) =>
      fileName === "default.svg"
        ? { contentType: "image/svg+xml; charset=utf-8", content: Buffer.from("<svg></svg>") }
        : undefined,
    )
    const origin = viewOrigin(server)

    expect((await fetch(`${origin}/character/%2e%2e/package.json`)).status).toBe(404)
    expect((await fetch(`${origin}/character/..%2Fdefault.svg`)).status).toBe(404)
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
