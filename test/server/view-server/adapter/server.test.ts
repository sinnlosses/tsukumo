import { afterEach, describe, expect, it, vi } from "vitest"

import { createRpcRouter } from "../../../../src/router.ts"
import { startViewServer } from "../../../../src/server/view-server/adapter/server.ts"
import {
  closeRunningView,
  EMPTY_RPC_PORTS,
  noCharacterAsset,
  noItemAsset,
  noPromptImage,
  noReportImage,
  startView,
  TEST_CHUNK,
  TEST_CHUNK_NAME,
  TEST_ETAG,
  TEST_STYLE_SHEET,
  TEST_UI_SCRIPT,
  TOKEN,
  trackView,
  viewOrigin,
} from "../../../fixture/view-server.ts"

afterEach(closeRunningView)

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

  it("/ の head に markdown-renderer.js と lib.js の modulepreload がある", async () => {
    const server = await startView()

    const body = await (await fetch(server.layoutUrl)).text()

    expect(body).toContain('<link rel="modulepreload" href="/assets/markdown-renderer.js">')
    expect(body).toContain('<link rel="modulepreload" href="/assets/lib.js">')
  })

  it("成果物は no-cache と ETag で配り、同じ ETag の If-None-Match には 304、違えば 200 を返す", async () => {
    const server = await startView()
    const url = `${viewOrigin(server)}/assets/ui.js`

    const first = await fetch(url)
    const etag = first.headers.get("etag") ?? ""
    const same = await fetch(url, { headers: { "if-none-match": etag } })
    const other = await fetch(url, { headers: { "if-none-match": '"other"' } })

    expect(first.headers.get("cache-control")).toBe("no-cache")
    expect(etag).toBe(TEST_ETAG)
    expect(same.status).toBe(304)
    expect(await same.text()).toBe("")
    expect(other.status).toBe(200)
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
      serveItemAsset: noItemAsset,
      findPromptImage: noPromptImage,
      findReportImage: noReportImage,
      rpcRouter: createRpcRouter(EMPTY_RPC_PORTS),
      token: TOKEN,
      onRuntimeError: () => {},
    })
    trackView(server)
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
