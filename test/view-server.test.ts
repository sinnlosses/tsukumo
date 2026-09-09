import { afterEach, describe, expect, it } from "bun:test"
import { networkInterfaces } from "node:os"

import { startViewServer, type ViewServer } from "../src/view-server.ts"
import { VIEW_NAMES } from "../src/view.ts"

// ポート 0 で起動し、割り当てられたポートを urlOf から読む（開発機で常駐中のサイドカーと
// ぶつからないようにするため）。
let running: ViewServer | undefined

async function start(): Promise<ViewServer> {
  const server = await startViewServer(0)
  running = server
  return server
}

afterEach(async () => {
  await running?.close()
  running = undefined
})

function originOf(server: ViewServer): string {
  return new URL(server.urlOf("character")).origin
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

    const port = new URL(server.urlOf("character")).port
    const outside = fetch(`http://${external}:${port}/character`, {
      signal: AbortSignal.timeout(3000),
    })
    await expect(outside).rejects.toBeDefined()
  })

  it("publish した本文を、そのビューのページに埋め込んで返す", async () => {
    const server = await start()
    server.publish("character", "<p>いま作業中だよ</p>")

    const response = await fetch(server.urlOf("character"))

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

  it("3領域（main / character / sidebar）のどれでも、購読後の publish が push される", async () => {
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

  it("layoutUrl は同じサーバの /layout を指す", async () => {
    const server = await start()

    expect(server.layoutUrl).toBe(`${originOf(server)}/layout`)
  })

  it("/layout が3領域を1枚にまとめたページを返し、それぞれ publish した本文を持つ", async () => {
    const server = await start()
    server.publish("main", "<p>メインの本文</p>")
    server.publish("character", "<p>キャラの本文</p>")
    server.publish("sidebar", "<p>サイドバーの本文</p>")

    const response = await fetch(server.layoutUrl)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain("<p>メインの本文</p>")
    expect(body).toContain("<p>キャラの本文</p>")
    expect(body).toContain("<p>サイドバーの本文</p>")
  })

  it("/layout の3領域それぞれが、個別ビューと同じ /events/<view> を購読する更新経路を持つ", async () => {
    const server = await start()

    const response = await fetch(server.layoutUrl)
    const body = await response.text()

    expect(body).toContain('new EventSource("/events/main")')
    expect(body).toContain('new EventSource("/events/character")')
    expect(body).toContain('new EventSource("/events/sidebar")')
  })

  it("個別ビューの経路（/main /character /sidebar）は /layout を足したあとも残る", async () => {
    const server = await start()
    server.publish("sidebar", "<p>サイドバー単体</p>")

    const response = await fetch(server.urlOf("sidebar"))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain("<p>サイドバー単体</p>")
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
