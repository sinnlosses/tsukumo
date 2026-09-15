import { afterEach, describe, expect, it } from "bun:test"
import { createServer, request as httpRequest, type Server } from "node:http"

import WebSocket from "ws"

import {
  attachSessionSocket,
  createStartupToken,
  startViewServer,
  type SessionSocket,
  type ViewServer,
} from "../../src/core/server.ts"
import { type DispatchResult } from "../../src/core/session-manager.ts"
import { type ClientCommand } from "../../src/protocol/command.ts"
import {
  FRAME_ERROR_REASON,
  parseServerFrame,
  PROTOCOL_VERSION,
  type ServerFrame,
} from "../../src/protocol/frame.ts"
import { SESSION_SOCKET_PATH } from "../../src/protocol/session-socket.ts"
import { INITIAL_SESSION_STATE } from "../../src/protocol/session-state.ts"

// 会話は流さない（フレームの中身は初期状態と架空のセリフだけ）。
const TOKEN = createStartupToken()

let running: { readonly server: Server; readonly socket: SessionSocket } | undefined = undefined

type Started = {
  readonly origin: string
  readonly dispatched: ClientCommand[]
  readonly pushed: (frame: ServerFrame) => void
}

async function start(dispatchResult: DispatchResult = { ok: true }): Promise<Started> {
  const server = createServer((_request, response) => {
    response.writeHead(404)
    response.end()
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  const port = address !== null && typeof address !== "string" ? address.port : 0
  const origin = `http://127.0.0.1:${String(port)}`

  const dispatched: ClientCommand[] = []
  const subscribers = new Set<(frame: ServerFrame) => void>()
  const socket = attachSessionSocket({
    httpServer: server,
    token: TOKEN,
    origin,
    subscribe: (send) => {
      subscribers.add(send)
      send({
        type: "hello",
        protocolVersion: PROTOCOL_VERSION,
        sessionId: "s-1",
        state: INITIAL_SESSION_STATE,
      })
      return () => {
        subscribers.delete(send)
      }
    },
    dispatch: (command) => {
      dispatched.push(command)
      return Promise.resolve(dispatchResult)
    },
  })

  running = { server, socket }
  return {
    origin,
    dispatched,
    pushed: (frame) => {
      for (const send of subscribers) {
        send(frame)
      }
    },
  }
}

afterEach(async () => {
  const current = running
  running = undefined
  if (current === undefined) {
    return
  }
  current.socket.close()
  await new Promise<void>((resolve) => {
    current.server.closeAllConnections()
    current.server.close(() => resolve())
  })
})

function socketUrl(origin: string, token: string | undefined): string {
  const base = origin.replace("http://", "ws://")
  return token === undefined
    ? `${base}${SESSION_SOCKET_PATH}`
    : `${base}${SESSION_SOCKET_PATH}?t=${token}`
}

/** 接続する。拒否されたら reject する。 */
function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(url)
    client.on("open", () => resolve(client))
    client.on("error", (error) => reject(error))
  })
}

/**
 * upgrade の要求だけを生で投げ、返ってきた状態コードを読む（101 = 通した、403 = 弾いた）。
 * **WebSocket のクライアント実装に依らず**「弾いたこと」を確かめるためにここだけ生で書く
 * （Bun の `ws` は `origin` オプションを送らないことがある）。
 */
function upgradeStatus(origin: string, path: string, headers: Readonly<Record<string, string>>) {
  return new Promise<number>((resolve, reject) => {
    const target = new URL(path, origin)
    const client = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-version": "13",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        ...headers,
      },
    })
    client.on("response", (response) => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })
    client.on("upgrade", (_response, socket) => {
      socket.destroy()
      resolve(101)
    })
    client.on("error", reject)
    client.end()
  })
}

function nextFrame(client: WebSocket): Promise<ServerFrame | undefined> {
  return new Promise((resolve) => {
    client.once("message", (data) => resolve(parseServerFrame(JSON.parse(data.toString()))))
  })
}

describe("attachSessionSocket", () => {
  it("トークンが無い・違う接続は 403 で弾く", async () => {
    const started = await start()

    expect(await upgradeStatus(started.origin, SESSION_SOCKET_PATH, {})).toBe(403)
    expect(await upgradeStatus(started.origin, `${SESSION_SOCKET_PATH}?t=ちがう`, {})).toBe(403)
  })

  it("Origin が自分と違う接続は 403 で弾く（Origin が無ければ通す）", async () => {
    const started = await start()
    const path = `${SESSION_SOCKET_PATH}?t=${TOKEN}`

    expect(await upgradeStatus(started.origin, path, { origin: "http://example.invalid" })).toBe(
      403,
    )
    expect(await upgradeStatus(started.origin, path, { origin: started.origin })).toBe(101)
    expect(await upgradeStatus(started.origin, path, {})).toBe(101)
  })

  it("正しいトークンで繋ぐと hello が読める", async () => {
    const started = await start()
    const client = await connect(socketUrl(started.origin, TOKEN))

    const frame = await nextFrame(client)

    expect(frame?.type).toBe("hello")
    if (frame?.type === "hello") {
      expect(frame.protocolVersion).toBe(PROTOCOL_VERSION)
      expect(frame.state).toEqual(INITIAL_SESSION_STATE)
    }
    client.close()
  })

  it("コマンドを送ると dispatch へ渡る", async () => {
    const started = await start()
    const client = await connect(socketUrl(started.origin, TOKEN))
    await nextFrame(client)

    client.send(JSON.stringify({ type: "prompt", commandId: "c-1", text: "架空の依頼" }))
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(started.dispatched).toEqual([{ type: "prompt", commandId: "c-1", text: "架空の依頼" }])
    client.close()
  })

  it("形の読めないコマンドには定型文の error を返す", async () => {
    const started = await start()
    const client = await connect(socketUrl(started.origin, TOKEN))
    await nextFrame(client)

    client.send("これは JSON ではない")
    const frame = await nextFrame(client)

    expect(frame).toEqual({
      type: "error",
      commandId: undefined,
      reason: FRAME_ERROR_REASON.invalidCommand,
    })
    expect(started.dispatched).toEqual([])
    client.close()
  })

  it("受け付けられなかったコマンドには、理由を添えた error を返す", async () => {
    const started = await start({ ok: false, reason: FRAME_ERROR_REASON.noSession })
    const client = await connect(socketUrl(started.origin, TOKEN))
    await nextFrame(client)

    client.send(JSON.stringify({ type: "interrupt", commandId: "c-9" }))
    const frame = await nextFrame(client)

    expect(frame).toEqual({
      type: "error",
      commandId: "c-9",
      reason: FRAME_ERROR_REASON.noSession,
    })
    client.close()
  })

  it("購読に押されたフレームが接続へ流れる", async () => {
    const started = await start()
    const client = await connect(socketUrl(started.origin, TOKEN))
    await nextFrame(client)

    const received = nextFrame(client)
    started.pushed({
      type: "events",
      events: [{ at: 1, event: { kind: "speech", text: "架空のセリフ", expression: "default" } }],
    })

    expect(await received).toEqual({
      type: "events",
      events: [{ at: 1, event: { kind: "speech", text: "架空のセリフ", expression: "default" } }],
    })
    client.close()
  })
})

// ここから静的配信（ページ・`/assets`・`/vendor`・`/character`）。移行の段6で
// 旧のビューサーバから合流した（メインビュー専用の SSE 経路は無くなった。
// docs/design.md 12章）。

let runningView: ViewServer | undefined

/** ブラウザ側スクリプトの代役。**本物のビルドはしない**（テストから `bun build` を起こさない）。 */
const TEST_UI_SCRIPT = "/* テスト用の ui スクリプト */"

/** CSS の代役。**本物のビルドはしない**。 */
const TEST_STYLE_SHEET = "/* テスト用の CSS */"

/**
 * `/character/<file>` を配る係の代役。既定では何も配らない（404）。個々のテストが必要な分だけ
 * 上書きする（`src/core/character-pack.ts` の `readCharacterPackFile` の代役）。
 */
function noCharacterAsset(): undefined {
  return undefined
}

async function startView(
  serveCharacterAsset: (
    fileName: string,
  ) => { contentType: string; content: Buffer } | undefined = noCharacterAsset,
): Promise<ViewServer> {
  const server = await startViewServer(
    0,
    { uiScript: () => TEST_UI_SCRIPT, styleSheet: () => TEST_STYLE_SHEET },
    serveCharacterAsset,
  )
  runningView = server
  return server
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

  it("同梱した外部ライブラリを配る（allowlist に載っている名前だけ）", async () => {
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

  it("消えた同梱ファイル（highlight.min.js / idiomorph.min.js）はもう配らない（移行の段6）", async () => {
    const server = await startView()
    const origin = viewOrigin(server)

    expect((await fetch(`${origin}/vendor/highlight.min.js`)).status).toBe(404)
    expect((await fetch(`${origin}/vendor/idiomorph.min.js`)).status).toBe(404)
  })

  it("同梱していない名前・上のディレクトリを指す名前は配らない", async () => {
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
})
