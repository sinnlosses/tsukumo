import { afterEach, describe, expect, it } from "bun:test"
import { createServer, request as httpRequest, type Server } from "node:http"

import WebSocket from "ws"

import { createStartupToken } from "../../../src/server/adapter/server.ts"
import {
  attachSessionSocket,
  type SessionSocket,
} from "../../../src/server/adapter/session-socket.ts"
import { type DispatchResult } from "../../../src/server/core/session-manager.ts"
import { type ClientCommand } from "../../../src/shared/command.ts"
import {
  FRAME_ERROR_REASON,
  parseServerFrame,
  PROTOCOL_VERSION,
  type ServerFrame,
} from "../../../src/shared/frame.ts"
import { SESSION_SOCKET_PATH } from "../../../src/shared/session-socket.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session-state.ts"

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

    client.send(
      JSON.stringify({ type: "prompt", commandId: "c-1", text: "架空の依頼", images: [] }),
    )
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(started.dispatched).toEqual([
      { type: "prompt", commandId: "c-1", text: "架空の依頼", images: [] },
    ])
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

  // **必須の1つ（`default`）の立ち絵を消す操作は、駆動まで届かせない。**
  it("default の立ち絵を消す要求は受け口で弾き、dispatch まで届かない", async () => {
    const started = await start()
    const client = await connect(socketUrl(started.origin, TOKEN))
    await nextFrame(client)

    client.send(JSON.stringify({ type: "clear-portrait", commandId: "c-1", expression: "default" }))
    const frame = await nextFrame(client)

    expect(frame).toEqual({
      type: "error",
      commandId: undefined,
      reason: FRAME_ERROR_REASON.invalidCommand,
    })
    expect(started.dispatched).toEqual([])
    client.close()
  })

  it("必須でない表情（proud）の立ち絵を消す要求は dispatch へ渡る", async () => {
    const started = await start()
    const client = await connect(socketUrl(started.origin, TOKEN))
    await nextFrame(client)

    client.send(JSON.stringify({ type: "clear-portrait", commandId: "c-2", expression: "proud" }))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(started.dispatched).toEqual([
      { type: "clear-portrait", commandId: "c-2", expression: "proud" },
    ])
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
