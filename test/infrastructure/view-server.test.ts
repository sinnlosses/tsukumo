import { afterEach, describe, expect, it } from "bun:test"
import { networkInterfaces } from "node:os"

import { startViewServer, type ViewServer } from "../../src/infrastructure/view-server.ts"
import { VIEW_NAMES } from "../../src/presentation/view.ts"

// ポート 0 で起動し、割り当てられたポートを layoutUrl から読む（開発機で常駐中のサイドカーと
// ぶつからないようにするため）。
let running: ViewServer | undefined

/**
 * ブラウザ側スクリプトの代役。**本物のビルドはしない**（テストから `bun build` を起こさない）。
 * 配信の経路（`/assets/browser.js`）が通っているかだけを見たいので、中身は目印の1行でよい。
 */
const TEST_BROWSER_SCRIPT = "/* テスト用のブラウザ側スクリプト */"

/**
 * CSS の代役。**本物のビルドはしない**（テストから `bun build` を起こさない）。
 * 配信の経路（`/assets/style.css`）が通っているかだけを見たいので、中身は目印の1行でよい。
 */
const TEST_STYLE_SHEET = "/* テスト用の CSS */"

/**
 * 新しいブラウザ側スクリプト（`src/ui/`）の代役。**本物のビルドはしない**。
 * 配信の経路（`/assets/ui.js`）が通っているかだけを見る。
 */
const TEST_UI_SCRIPT = "/* テスト用の ui スクリプト */"

async function start(): Promise<ViewServer> {
  const server = await startViewServer(0, TEST_BROWSER_SCRIPT, TEST_STYLE_SHEET, TEST_UI_SCRIPT)
  running = server
  return server
}

afterEach(async () => {
  await running?.close()
  running = undefined
})

function originOf(server: ViewServer): string {
  return new URL(server.layoutUrl).origin
}

/** 自分のマシンが持つループバック以外の IPv4 アドレス。無い環境では undefined。 */
function externalAddress(): string | undefined {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address
      }
    }
  }

  return undefined
}

describe("ビューサーバ", () => {
  it("ループバックにだけバインドし、外向きのアドレスでは受け付けない", async () => {
    const server = await start()
    expect(originOf(server)).toStartWith("http://127.0.0.1:")

    const external = externalAddress()
    if (external === undefined) {
      return
    }

    const port = new URL(server.layoutUrl).port
    const outside = fetch(`http://${external}:${port}/`, {
      signal: AbortSignal.timeout(3000),
    })
    await expect(outside).rejects.toBeDefined()
  })

  it("同梱した外部ライブラリを配る（allowlist に載っている名前だけ）", async () => {
    const server = await start()
    const origin = originOf(server)

    const script = await fetch(`${origin}/vendor/highlight.min.js`)
    expect(script.status).toBe(200)
    expect(script.headers.get("content-type")).toContain("text/javascript")
    expect((await script.text()).length).toBeGreaterThan(1000)

    const style = await fetch(`${origin}/vendor/highlight-theme.min.css`)
    expect(style.status).toBe(200)
    expect(style.headers.get("content-type")).toContain("text/css")

    const idiomorph = await fetch(`${origin}/vendor/idiomorph.min.js`)
    expect(idiomorph.status).toBe(200)
    expect(idiomorph.headers.get("content-type")).toContain("text/javascript")
    expect((await idiomorph.text()).length).toBeGreaterThan(1000)
  })

  it("同梱していない名前・上のディレクトリを指す名前は配らない", async () => {
    const server = await start()
    const origin = originOf(server)

    // allowlist に無い名前。
    expect((await fetch(`${origin}/vendor/other.js`)).status).toBe(404)
    // パスを組み立てないので、`..` を書いても外のファイルには届かない。
    expect((await fetch(`${origin}/vendor/../package.json`)).status).toBe(404)
    expect((await fetch(`${origin}/vendor/%2e%2e/package.json`)).status).toBe(404)
  })

  it("publish した本文を、レイアウトページに埋め込んで返す", async () => {
    const server = await start()
    server.publish("character", "<p>いま作業中だよ</p>")

    const response = await fetch(server.layoutUrl)

    expect(response.status).toBe(200)
    expect(await response.text()).toContain("<p>いま作業中だよ</p>")
  })

  it("知らない経路には404を返す", async () => {
    const server = await start()

    const response = await fetch(`${originOf(server)}/balloon`)

    expect(response.status).toBe(404)
  })

  it("購読を始めた時点の本文と、その後の publish の両方を push する", async () => {
    const server = await start()
    server.publish("main", "さいしょ")

    const response = await fetch(`${originOf(server)}/events/main`)
    const stream = response.body
    if (stream === null) {
      throw new Error("イベントストリームの本文が空だった")
    }
    const reader = stream.getReader()

    try {
      expect(await readEvent(reader)).toContain("さいしょ")
      server.publish("main", "つぎ")
      expect(await readEvent(reader)).toContain("つぎ")
    } finally {
      await reader.cancel()
    }
  })

  it("2領域（main / character）のどれでも、購読後の publish が push される", async () => {
    const server = await start()

    for (const view of VIEW_NAMES) {
      server.publish(view, `さいしょ:${view}`)

      const response = await fetch(`${originOf(server)}/events/${view}`)
      const stream = response.body
      if (stream === null) {
        throw new Error("イベントストリームの本文が空だった")
      }
      const reader = stream.getReader()

      try {
        expect(await readEvent(reader)).toContain(`さいしょ:${view}`)
        server.publish(view, `つぎ:${view}`)
        expect(await readEvent(reader)).toContain(`つぎ:${view}`)
      } finally {
        await reader.cancel()
      }
    }
  })

  it("layoutUrl は同じサーバの / を指す", async () => {
    const server = await start()

    expect(server.layoutUrl).toBe(`${originOf(server)}/`)
  })

  it("/ がメイン・キャラ・サイドバーを1枚にまとめたページを返し、publish した本文を持つ（サイドバーは React の root。段3）", async () => {
    const server = await start()
    server.publish("main", "<p>メインの本文</p>")
    server.publish("character", "<p>キャラの本文</p>")

    const response = await fetch(server.layoutUrl)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain("<p>メインの本文</p>")
    expect(body).toContain("<p>キャラの本文</p>")
    expect(body).toContain(
      '<section class="layout-region layout-sidebar" id="tsukumo-view-sidebar"></section>',
    )
  })

  it("/ のメイン・キャラの領域が、/events/<view> を購読先として示す（サイドバーは持たない）", async () => {
    const server = await start()

    const response = await fetch(server.layoutUrl)
    const body = await response.text()

    // 購読そのものは外に出したスクリプト（/assets/browser.js）が data-event-path を見て回る
    // （2026-09-12 T-083）。ページが持つのは経路の宣言だけ。
    expect(body).toContain('data-event-path="/events/main"')
    expect(body).toContain('data-event-path="/events/character"')
    expect(body).toContain('<script src="/assets/browser.js"></script>')
    expect(body).toContain('<link rel="stylesheet" href="/assets/style.css">')
  })

  it("/assets/browser.js が、起動時に組み立てたブラウザ側スクリプトを返す", async () => {
    const server = await start()

    const response = await fetch(`${originOf(server)}/assets/browser.js`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/javascript")
    expect(await response.text()).toBe(TEST_BROWSER_SCRIPT)
  })

  it("/assets/style.css が、起動時に組み立てた CSS を返す", async () => {
    const server = await start()

    const response = await fetch(`${originOf(server)}/assets/style.css`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/css")
    expect(await response.text()).toBe(TEST_STYLE_SHEET)
  })

  it("個別ビューのページ（/main /character）は無い（2026-09-12 に消した。404）", async () => {
    const server = await start()

    for (const view of VIEW_NAMES) {
      const response = await fetch(`${originOf(server)}/${view}`)
      expect(response.status).toBe(404)
    }
  })
})

/** 次の update イベントが届くまでチャンクを読み進め、その data 行を返す。 */
async function readEvent(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder()
  let buffered = ""

  while (!buffered.includes("event: update\n")) {
    const chunk = await reader.read()
    if (chunk.done) {
      throw new Error("update イベントが届かないまま切れた")
    }
    buffered += decoder.decode(chunk.value, { stream: true })
  }

  return buffered
}
