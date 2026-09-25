import { afterEach, describe, expect, it } from "bun:test"
import { createServer, request as httpRequest, type Server } from "node:http"

import { createORPCClient, ORPCError } from "@orpc/client"
import { RPCLink } from "@orpc/client/websocket"
import WebSocket from "ws"

import { createCommandRouter } from "../../../../src/router.ts"
import { createPromptImageShelf } from "../../../../src/server/session-driver/core/prompt-image-shelf.ts"
import { type CommandSession } from "../../../../src/server/session/core/command-session.ts"
import { createStartupToken } from "../../../../src/server/view-server/adapter/server.ts"
import {
  attachSessionSocket,
  type SessionSocket,
} from "../../../../src/server/view-server/adapter/session-socket.ts"
import {
  FRAME_ERROR_REASON,
  parseServerFrame,
  PROTOCOL_VERSION,
  type ServerFrame,
} from "../../../../src/shared/frame.ts"
import { type CommandClient } from "../../../../src/shared/rpc.ts"
import { SESSION_SOCKET_PATH } from "../../../../src/shared/session-socket.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session-state.ts"

// 会話は流さない（フレームの中身は初期状態と架空のセリフだけ）。
const TOKEN = createStartupToken()

let running: { readonly server: Server; readonly socket: SessionSocket } | undefined = undefined

type Started = {
  readonly origin: string
  /** 手続き `host.openFile` が受け取ったパス（ほかの手続きの受け手は呼ばれない前提の架空のもの）。 */
  readonly openedFiles: readonly string[]
  readonly pushed: (frame: ServerFrame) => void
}

/**
 * 呼ばれてはいけない口（このテストが送る手続きは `host.openFile` と、断られる `session.nudge` だけ）。
 */
function unexpected(): never {
  throw new Error("このテストでは呼ばれない口")
}

/** 仕事のとき・ターンの外にいるセッションの口（受け手へは渡らない前提の架空のもの）。 */
const IDLE_WORK_SESSION: CommandSession = {
  state: () => INITIAL_SESSION_STATE,
  driver: unexpected,
  restart: unexpected,
  generation: () => ({ emit: () => {}, diarySignal: new AbortController().signal }),
}

async function start(openFileResult = true): Promise<Started> {
  const server = createServer((_request, response) => {
    response.writeHead(404)
    response.end()
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  const port = address !== null && typeof address !== "string" ? address.port : 0
  const origin = `http://127.0.0.1:${String(port)}`

  const openedFiles: string[] = []
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
        state: INITIAL_SESSION_STATE,
      })
      return () => {
        subscribers.delete(send)
      }
    },
    commandRouter: createCommandRouter({
      session: {
        promptImageShelf: createPromptImageShelf(),
        rememberSessionDefault: unexpected,
        readAchievementDay: unexpected,
        diary: { kind: "dont-write" },
      },
      characterPack: {
        editCharacter: unexpected,
        createCharacter: unexpected,
        deleteCharacter: unexpected,
      },
      chat: { forgetRememberedLine: unexpected },
      visit: { rememberVisitEnabled: unexpected },
      usageReview: { dismissUsageProposal: unexpected },
      host: {
        openFile: (path) => {
          openedFiles.push(path)
          return Promise.resolve(openFileResult)
        },
      },
    }),
    commandSession: IDLE_WORK_SESSION,
  })

  running = { server, socket }
  return {
    origin,
    openedFiles,
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

/**
 * 接続の上にコマンドの client を作る。**届いたもののうち手続きの応答（`i` を持つもの）だけを
 * `RPCLink` へ渡す**（フレームは渡さない。ブラウザの `src/browser/lib/socket.ts` と同じ振り分け）。
 */
function commandClientOver(client: WebSocket): CommandClient {
  const channel = new EventTarget()
  client.on("message", (data) => {
    const text = data.toString()
    if ("i" in JSON.parse(text)) {
      channel.dispatchEvent(new MessageEvent("message", { data: text }))
    }
  })
  const link = new RPCLink({
    websocket: {
      addEventListener: channel.addEventListener.bind(channel),
      removeEventListener: channel.removeEventListener.bind(channel),
      send: (message) => client.send(message),
      readyState: 1,
    },
  })
  return createORPCClient(link)
}

/**
 * 手続きが断られたときのエラーの要点（断られなければ undefined）。**契約に書いたエラー
 * （`defined: true`・409）として届くこと**まで見る。
 */
async function refusalOf(call: Promise<unknown>): Promise<unknown> {
  try {
    await call
    return undefined
  } catch (error) {
    return error instanceof ORPCError
      ? { code: error.code, status: error.status, defined: error.defined, data: error.data }
      : error
  }
}

/** 契約の `REFUSED` として届いたときの要点。 */
function REFUSED(reason: string) {
  return { code: "REFUSED", status: 409, defined: true, data: { reason } }
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

  it("手続きを呼ぶと、ルータの受け手へ入力が渡る", async () => {
    const started = await start()
    const client = await connect(socketUrl(started.origin, TOKEN))
    await nextFrame(client)

    await commandClientOver(client).host.openFile({ path: "src/架空.ts" })

    expect(started.openedFiles).toEqual(["src/架空.ts"])
    client.close()
  })

  it("受け付けられなかった手続きには、定型文の理由を添えたエラーを返す", async () => {
    const started = await start(false)
    const client = await connect(socketUrl(started.origin, TOKEN))
    await nextFrame(client)

    expect(
      await refusalOf(commandClientOver(client).host.openFile({ path: "src/架空.ts" })),
    ).toEqual(REFUSED(FRAME_ERROR_REASON.openFileFailed))
    client.close()
  })

  it("契約の断る条件（雑談の外の nudge）は受け手を呼ばずに断る", async () => {
    const started = await start()
    const client = await connect(socketUrl(started.origin, TOKEN))
    await nextFrame(client)

    expect(await refusalOf(commandClientOver(client).session.nudge())).toEqual(
      REFUSED(FRAME_ERROR_REASON.nudgeOutsideChat),
    )
    client.close()
  })

  it("読めないメッセージは捨て、接続はそのまま使える", async () => {
    const started = await start()
    const client = await connect(socketUrl(started.origin, TOKEN))
    await nextFrame(client)

    client.send("これは JSON ではない")
    client.send(JSON.stringify({ type: "prompt", text: "古い形の依頼" }))
    await commandClientOver(client).host.openFile({ path: "src/架空.ts" })

    expect(started.openedFiles).toEqual(["src/架空.ts"])
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
