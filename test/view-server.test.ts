import { afterEach, describe, expect, it, mock } from "bun:test"
import { networkInterfaces } from "node:os"

import { type Host, type HostResult } from "../src/host.ts"
import { type Answer } from "../src/pending-answer.ts"
import { type PermissionMode } from "../src/session-driver.ts"
import {
  type SendAnswer,
  type SendInterrupt,
  type SendPermissionMode,
  type SendPrompt,
  startViewServer,
  type ViewServer,
} from "../src/view-server.ts"
import {
  DISPATCH_PATH,
  INTERRUPT_PATH,
  PERMISSION_MODE_PATH,
  PROMPT_PATH,
  TERMINALS_PATH,
  TURN_STATUS_EVENT_PATH,
  TURN_STATUS_IDLE,
  TURN_STATUS_IN_PROGRESS,
  VIEW_NAMES,
} from "../src/view.ts"

// ポート 0 で起動し、割り当てられたポートを urlOf から読む（開発機で常駐中のサイドカーと
// ぶつからないようにするため）。
let running: ViewServer | undefined

/**
 * `orca` を一切呼ばないテスト用のホスト。既定はすべて成功・一覧は空にしてあり、
 * 個々のテストは必要な操作だけ `overrides` で差し替える
 * （`docs/coding-standards.md`「モックするのはシステム境界だけ」— Host はまさにその境界）。
 */
function fakeHost(overrides: Partial<Host> = {}): Host {
  return {
    openPane: () => Promise.resolve({ ok: true }),
    showView: () => Promise.resolve({ ok: true }),
    listPanes: () => Promise.resolve({ ok: true, panes: [] }),
    sendText: () => Promise.resolve({ ok: true }),
    pressKey: () => Promise.resolve({ ok: true }),
    ...overrides,
  }
}

async function start(
  host: Host = fakeHost(),
  sendPrompt: SendPrompt = () => true,
  sendInterrupt: SendInterrupt = () => Promise.resolve(),
  sendAnswer: SendAnswer = () => true,
  sendPermissionMode: SendPermissionMode = () => Promise.resolve(true),
): Promise<ViewServer> {
  const server = await startViewServer(
    0,
    host,
    sendPrompt,
    sendInterrupt,
    sendAnswer,
    sendPermissionMode,
  )
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

describe("セッションへの依頼", () => {
  it("依頼のテキストをセッション駆動へ渡す", async () => {
    const sendPrompt = mock((_text: string) => true)
    const server = await start(fakeHost(), sendPrompt)

    const response = await fetch(`${originOf(server)}${PROMPT_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "テストの依頼" }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(sendPrompt).toHaveBeenCalledWith("テストの依頼")
  })

  it("テキストが欠けている・空のときは、駆動を呼ばずに400を返す", async () => {
    const sendPrompt = mock((_text: string) => true)
    const server = await start(fakeHost(), sendPrompt)

    const response = await fetch(`${originOf(server)}${PROMPT_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "   " }),
    })

    expect(response.status).toBe(400)
    expect(sendPrompt).not.toHaveBeenCalled()
  })

  it("セッションがまだ起きていないときは503を返す", async () => {
    const server = await start(fakeHost(), () => false)

    const response = await fetch(`${originOf(server)}${PROMPT_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "テストの依頼" }),
    })

    expect(response.status).toBe(503)
  })

  it("別のオリジンからの依頼は、駆動を呼ばずに403で弾く", async () => {
    const sendPrompt = mock((_text: string) => true)
    const server = await start(fakeHost(), sendPrompt)

    const response = await fetch(`${originOf(server)}${PROMPT_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://example.invalid" },
      body: JSON.stringify({ text: "テストの依頼" }),
    })

    expect(response.status).toBe(403)
    expect(sendPrompt).not.toHaveBeenCalled()
  })
})

describe("実行中の中断", () => {
  it("駆動の interrupt を呼び、ok を返す", async () => {
    const sendInterrupt = mock((): Promise<void> => Promise.resolve())
    const server = await start(fakeHost(), () => true, sendInterrupt)

    const response = await fetch(`${originOf(server)}${INTERRUPT_PATH}`, { method: "POST" })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(sendInterrupt).toHaveBeenCalledTimes(1)
  })

  it("別のオリジンからは、駆動を呼ばずに403で弾く", async () => {
    const sendInterrupt = mock((): Promise<void> => Promise.resolve())
    const server = await start(fakeHost(), () => true, sendInterrupt)

    const response = await fetch(`${originOf(server)}${INTERRUPT_PATH}`, {
      method: "POST",
      headers: { origin: "http://example.invalid" },
    })

    expect(response.status).toBe(403)
    expect(sendInterrupt).not.toHaveBeenCalled()
  })

  it("駆動が失敗したときは理由付きで失敗を返す", async () => {
    const server = await start(
      fakeHost(),
      () => true,
      () => Promise.reject(new Error("中断に失敗")),
    )

    const response = await fetch(`${originOf(server)}${INTERRUPT_PATH}`, { method: "POST" })

    expect(response.status).toBe(502)
    expect((await response.json()).ok).toBe(false)
  })
})

describe("答え待ちへの回答（/api/answer）", () => {
  it("id と answer を駆動へそのまま渡す", async () => {
    const sendAnswer = mock((_id: string, _answer: Answer): boolean => true)
    const server = await start(
      fakeHost(),
      () => true,
      () => Promise.resolve(),
      sendAnswer,
    )

    const response = await fetch(`${originOf(server)}/api/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "toolu_1", answer: { kind: "allow" } }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(sendAnswer).toHaveBeenCalledWith("toolu_1", { kind: "allow" })
  })

  it("拒否と、質問の answers も同じ経路で渡す", async () => {
    const sendAnswer = mock((_id: string, _answer: Answer): boolean => true)
    const server = await start(
      fakeHost(),
      () => true,
      () => Promise.resolve(),
      sendAnswer,
    )

    await fetch(`${originOf(server)}/api/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "toolu_1", answer: { kind: "deny" } }),
    })
    await fetch(`${originOf(server)}/api/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "toolu_q",
        answer: { kind: "answers", labels: ["自由入力の答え"] },
      }),
    })

    expect(sendAnswer).toHaveBeenNthCalledWith(1, "toolu_1", { kind: "deny" })
    expect(sendAnswer).toHaveBeenNthCalledWith(2, "toolu_q", {
      kind: "answers",
      labels: ["自由入力の答え"],
    })
  })

  it("壊れた JSON は駆動を呼ばずに400を返す", async () => {
    const sendAnswer = mock((_id: string, _answer: Answer): boolean => true)
    const server = await start(
      fakeHost(),
      () => true,
      () => Promise.resolve(),
      sendAnswer,
    )

    const response = await fetch(`${originOf(server)}/api/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ 壊れた json",
    })

    expect(response.status).toBe(400)
    expect(sendAnswer).not.toHaveBeenCalled()
  })

  it("id が無い・answer の形が合わないときも400を返す", async () => {
    const server = await start(fakeHost())

    for (const body of [
      JSON.stringify({ answer: { kind: "allow" } }),
      JSON.stringify({ id: "toolu_1", answer: { kind: "maybe" } }),
      JSON.stringify({ id: "toolu_1", answer: { kind: "answers", labels: [1, 2] } }),
    ]) {
      const response = await fetch(`${originOf(server)}/api/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      })
      expect(response.status).toBe(400)
    }
  })

  it("解決済み・知らない id は409を返す（駆動が false を返したとき）", async () => {
    const server = await start(
      fakeHost(),
      () => true,
      () => Promise.resolve(),
      () => false,
    )

    const response = await fetch(`${originOf(server)}/api/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "toolu_unknown", answer: { kind: "allow" } }),
    })

    expect(response.status).toBe(409)
  })

  it("別のオリジンからは、駆動を呼ばずに403で弾く", async () => {
    const sendAnswer = mock((_id: string, _answer: Answer): boolean => true)
    const server = await start(
      fakeHost(),
      () => true,
      () => Promise.resolve(),
      sendAnswer,
    )

    const response = await fetch(`${originOf(server)}/api/answer`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://example.invalid" },
      body: JSON.stringify({ id: "toolu_1", answer: { kind: "allow" } }),
    })

    expect(response.status).toBe(403)
    expect(sendAnswer).not.toHaveBeenCalled()
  })
})

describe("許可モードの切り替え（/api/permission-mode）", () => {
  it("mode を駆動へ渡す", async () => {
    const sendPermissionMode = mock(
      (_mode: PermissionMode): Promise<boolean> => Promise.resolve(true),
    )
    const server = await start(
      fakeHost(),
      () => true,
      () => Promise.resolve(),
      () => true,
      sendPermissionMode,
    )

    const response = await fetch(`${originOf(server)}${PERMISSION_MODE_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "plan" }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(sendPermissionMode).toHaveBeenCalledWith("plan")
  })

  it("PermissionMode の値以外は駆動を呼ばずに400を返す", async () => {
    const sendPermissionMode = mock(
      (_mode: PermissionMode): Promise<boolean> => Promise.resolve(true),
    )
    const server = await start(
      fakeHost(),
      () => true,
      () => Promise.resolve(),
      () => true,
      sendPermissionMode,
    )

    const response = await fetch(`${originOf(server)}${PERMISSION_MODE_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "yolo" }),
    })

    expect(response.status).toBe(400)
    expect(sendPermissionMode).not.toHaveBeenCalled()
  })

  it("セッションがまだ起きていないときは503を返す", async () => {
    const server = await start(
      fakeHost(),
      () => true,
      () => Promise.resolve(),
      () => true,
      () => Promise.resolve(false),
    )

    const response = await fetch(`${originOf(server)}${PERMISSION_MODE_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "plan" }),
    })

    expect(response.status).toBe(503)
  })

  it("別のオリジンからは403で弾く", async () => {
    const sendPermissionMode = mock(
      (_mode: PermissionMode): Promise<boolean> => Promise.resolve(true),
    )
    const server = await start(
      fakeHost(),
      () => true,
      () => Promise.resolve(),
      () => true,
      sendPermissionMode,
    )

    const response = await fetch(`${originOf(server)}${PERMISSION_MODE_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://example.invalid" },
      body: JSON.stringify({ mode: "plan" }),
    })

    expect(response.status).toBe(403)
    expect(sendPermissionMode).not.toHaveBeenCalled()
  })
})

describe("入力欄の進行状態（SSE）", () => {
  it("購読直後は「進行中でない」を push し、publishTurnStatus で切り替わる", async () => {
    const server = await start()

    const response = await fetch(`${originOf(server)}${TURN_STATUS_EVENT_PATH}`)
    const stream = response.body
    if (stream === null) {
      throw new Error("イベントストリームの本文が空だった")
    }
    const reader = stream.getReader()

    try {
      expect(await readEvent(reader)).toContain(TURN_STATUS_IDLE)
      server.publishTurnStatus(true)
      expect(await readEvent(reader)).toContain(TURN_STATUS_IN_PROGRESS)
      server.publishTurnStatus(false)
      expect(await readEvent(reader)).toContain(TURN_STATUS_IDLE)
    } finally {
      await reader.cancel()
    }
  })
})

describe("入力欄からの送信", () => {
  it("送信先の一覧を、id と label と likelyClaude だけに絞って返す", async () => {
    const server = await start(
      fakeHost({
        listPanes: () =>
          Promise.resolve({
            ok: true,
            panes: [{ id: "term-1", label: "claude", likelyClaude: true }],
          }),
      }),
    )

    const response = await fetch(`${originOf(server)}${TERMINALS_PATH}`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      terminals: [{ id: "term-1", label: "claude", likelyClaude: true }],
    })
  })

  it("likelyClaude で絞り込まず、外れている（false の）ものも一覧に残す", async () => {
    const server = await start(
      fakeHost({
        listPanes: () =>
          Promise.resolve({
            ok: true,
            panes: [{ id: "term-unsure", label: "たぶん違う", likelyClaude: false }],
          }),
      }),
    )

    const response = await fetch(`${originOf(server)}${TERMINALS_PATH}`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      terminals: [{ id: "term-unsure", label: "たぶん違う", likelyClaude: false }],
    })
  })

  it("likelyClaude が true のものを、元の順を保ったまま上に寄せる（絞り込まない）", async () => {
    const server = await start(
      fakeHost({
        listPanes: () =>
          Promise.resolve({
            ok: true,
            panes: [
              { id: "a-unsure", label: "A", likelyClaude: false },
              { id: "b-likely", label: "B", likelyClaude: true },
              { id: "c-unsure", label: "C", likelyClaude: false },
              { id: "d-likely", label: "D", likelyClaude: true },
            ],
          }),
      }),
    )

    const response = await fetch(`${originOf(server)}${TERMINALS_PATH}`)
    const body = await response.json()

    expect(body).toEqual({
      ok: true,
      terminals: [
        { id: "b-likely", label: "B", likelyClaude: true },
        { id: "d-likely", label: "D", likelyClaude: true },
        { id: "a-unsure", label: "A", likelyClaude: false },
        { id: "c-unsure", label: "C", likelyClaude: false },
      ],
    })
  })

  it("送信先が1つも無いときも壊れず、空の一覧を返す", async () => {
    const server = await start()

    const response = await fetch(`${originOf(server)}${TERMINALS_PATH}`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, terminals: [] })
  })

  it("一覧の取得にホストが失敗したとき、理由付きで失敗を返す", async () => {
    const server = await start(
      fakeHost({
        listPanes: () => Promise.resolve({ ok: false, reason: "orca コマンドが見つからない" }),
      }),
    )

    const response = await fetch(`${originOf(server)}${TERMINALS_PATH}`)
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body).toEqual({ ok: false, reason: "orca コマンドが見つからない" })
  })

  it("依頼を POST すると、選ばれた送信先とテキストでホストに送信を頼む", async () => {
    const sendText = mock(
      (_paneId: string, _text: string): Promise<HostResult> => Promise.resolve({ ok: true }),
    )
    const server = await start(fakeHost({ sendText }))

    const response = await fetch(`${originOf(server)}${DISPATCH_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ terminalId: "term-1", text: "テストの依頼" }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(sendText).toHaveBeenCalledWith("term-1", "テストの依頼")
  })

  it("送信にホストが失敗したとき、理由付きで失敗を返す", async () => {
    const server = await start(
      fakeHost({
        sendText: () => Promise.resolve({ ok: false, reason: "ターミナルが見つからない" }),
      }),
    )

    const response = await fetch(`${originOf(server)}${DISPATCH_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ terminalId: "term-1", text: "テストの依頼" }),
    })
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body).toEqual({ ok: false, reason: "ターミナルが見つからない" })
  })

  it("送信先やテキストが欠けている・空のときは、ホストを呼ばずに400を返す", async () => {
    const sendText = mock(
      (_paneId: string, _text: string): Promise<HostResult> => Promise.resolve({ ok: true }),
    )
    const server = await start(fakeHost({ sendText }))

    const response = await fetch(`${originOf(server)}${DISPATCH_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ terminalId: "term-1", text: "" }),
    })

    expect(response.status).toBe(400)
    expect(sendText).not.toHaveBeenCalled()
  })

  it("本文がJSONとして壊れているときも壊れず、理由付きで失敗を返す", async () => {
    const server = await start()

    const response = await fetch(`${originOf(server)}${DISPATCH_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ このJSONは壊れている",
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
  })

  it("GET で /api/dispatch を叩いても送信は起きない（POSTだけを受け付ける）", async () => {
    const sendText = mock(
      (_paneId: string, _text: string): Promise<HostResult> => Promise.resolve({ ok: true }),
    )
    const server = await start(fakeHost({ sendText }))

    const response = await fetch(`${originOf(server)}${DISPATCH_PATH}`)

    expect(response.status).toBe(404)
    expect(sendText).not.toHaveBeenCalled()
  })

  it("Origin ヘッダーが無い POST（curl相当）は通す", async () => {
    const sendText = mock(
      (_paneId: string, _text: string): Promise<HostResult> => Promise.resolve({ ok: true }),
    )
    const server = await start(fakeHost({ sendText }))

    const response = await fetch(`${originOf(server)}${DISPATCH_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ terminalId: "term-1", text: "テストの依頼" }),
    })

    expect(response.status).toBe(200)
    expect(sendText).toHaveBeenCalledWith("term-1", "テストの依頼")
  })

  it("サーバ自身のオリジンと一致する Origin ヘッダーの POST は通す", async () => {
    const sendText = mock(
      (_paneId: string, _text: string): Promise<HostResult> => Promise.resolve({ ok: true }),
    )
    const server = await start(fakeHost({ sendText }))

    const response = await fetch(`${originOf(server)}${DISPATCH_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: originOf(server) },
      body: JSON.stringify({ terminalId: "term-1", text: "テストの依頼" }),
    })

    expect(response.status).toBe(200)
    expect(sendText).toHaveBeenCalledWith("term-1", "テストの依頼")
  })

  it("別オリジンの Origin ヘッダーが付いた POST は403で弾き、ホストを呼ばない", async () => {
    const sendText = mock(
      (_paneId: string, _text: string): Promise<HostResult> => Promise.resolve({ ok: true }),
    )
    const server = await start(fakeHost({ sendText }))

    const response = await fetch(`${originOf(server)}${DISPATCH_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example.com",
      },
      body: JSON.stringify({ terminalId: "term-1", text: "外部からの注入テスト" }),
    })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.ok).toBe(false)
    expect(sendText).not.toHaveBeenCalled()
  })

  it("依頼の文面を、応答のどこにも含めない（成功時も失敗時も）", async () => {
    const secretText = "サーバの外に出てはいけない秘密の依頼文"

    const failing = await start(
      fakeHost({
        sendText: () => Promise.resolve({ ok: false, reason: "ターミナルへの送信に失敗した" }),
      }),
    )
    const failingResponse = await fetch(`${originOf(failing)}${DISPATCH_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ terminalId: "term-1", text: secretText }),
    })
    expect(await failingResponse.text()).not.toContain(secretText)
    await failing.close()

    const succeeding = await start()
    const succeedingResponse = await fetch(`${originOf(succeeding)}${DISPATCH_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ terminalId: "term-1", text: secretText }),
    })
    expect(await succeedingResponse.text()).not.toContain(secretText)
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
