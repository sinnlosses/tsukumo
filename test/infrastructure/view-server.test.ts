import { afterEach, describe, expect, it, mock } from "bun:test"
import { networkInterfaces } from "node:os"

import {
  type GetCommands,
  type SendAnswer,
  type SendInterrupt,
  type SendPrompt,
  startViewServer,
  type ViewServer,
} from "../../src/infrastructure/view-server.ts"
import {
  COMMANDS_PATH,
  encodeTurnStatus,
  INTERRUPT_PATH,
  PENDING_ANSWER_EVENT_PATH,
  PROMPT_PATH,
  TURN_STATUS_EVENT_PATH,
  VIEW_NAMES,
} from "../../src/presentation/view.ts"
import { type Answer } from "../../src/protocol/pending-ask.ts"

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

async function start(
  sendPrompt: SendPrompt = () => true,
  sendInterrupt: SendInterrupt = () => Promise.resolve(),
  sendAnswer: SendAnswer = () => true,
  getCommands: GetCommands = () => [],
): Promise<ViewServer> {
  const server = await startViewServer(
    0,
    sendPrompt,
    sendInterrupt,
    sendAnswer,
    getCommands,
    TEST_BROWSER_SCRIPT,
    TEST_STYLE_SHEET,
    TEST_UI_SCRIPT,
  )
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

describe("セッションへの依頼", () => {
  it("依頼のテキストをセッション駆動へ渡す", async () => {
    const sendPrompt = mock((_text: string) => true)
    const server = await start(sendPrompt)

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
    const server = await start(sendPrompt)

    const response = await fetch(`${originOf(server)}${PROMPT_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "   " }),
    })

    expect(response.status).toBe(400)
    expect(sendPrompt).not.toHaveBeenCalled()
  })

  it("セッションがまだ起きていないときは503を返す", async () => {
    const server = await start(() => false)

    const response = await fetch(`${originOf(server)}${PROMPT_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "テストの依頼" }),
    })

    expect(response.status).toBe(503)
  })

  it("別のオリジンからの依頼は、駆動を呼ばずに403で弾く", async () => {
    const sendPrompt = mock((_text: string) => true)
    const server = await start(sendPrompt)

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
    const server = await start(() => true, sendInterrupt)

    const response = await fetch(`${originOf(server)}${INTERRUPT_PATH}`, { method: "POST" })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(sendInterrupt).toHaveBeenCalledTimes(1)
  })

  it("別のオリジンからは、駆動を呼ばずに403で弾く", async () => {
    const sendInterrupt = mock((): Promise<void> => Promise.resolve())
    const server = await start(() => true, sendInterrupt)

    const response = await fetch(`${originOf(server)}${INTERRUPT_PATH}`, {
      method: "POST",
      headers: { origin: "http://example.invalid" },
    })

    expect(response.status).toBe(403)
    expect(sendInterrupt).not.toHaveBeenCalled()
  })

  it("駆動が失敗したときは理由付きで失敗を返す", async () => {
    const server = await start(
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
    const server = await start()

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

describe("入力欄の進行状態・経過時間（SSE）", () => {
  it("購読直後は開始・終了時刻とも無しを push し、publishTurnStatus で切り替わる", async () => {
    const server = await start()

    const response = await fetch(`${originOf(server)}${TURN_STATUS_EVENT_PATH}`)
    const stream = response.body
    if (stream === null) {
      throw new Error("イベントストリームの本文が空だった")
    }
    const reader = stream.getReader()

    try {
      expect(await readEvent(reader)).toContain(
        encodeTurnStatus({ turnStartedAt: undefined, turnFinishedAt: undefined }),
      )
      server.publishTurnStatus({ turnStartedAt: 1_700_000_000_000, turnFinishedAt: undefined })
      expect(await readEvent(reader)).toContain(
        encodeTurnStatus({ turnStartedAt: 1_700_000_000_000, turnFinishedAt: undefined }),
      )
      server.publishTurnStatus({
        turnStartedAt: 1_700_000_000_000,
        turnFinishedAt: 1_700_000_005_000,
      })
      expect(await readEvent(reader)).toContain(
        encodeTurnStatus({
          turnStartedAt: 1_700_000_000_000,
          turnFinishedAt: 1_700_000_005_000,
        }),
      )
    } finally {
      await reader.cancel()
    }
  })
})

describe("答え待ちの箱（SSE）", () => {
  it("購読直後は空を push し、publishPendingAnswer で箱の HTML に切り替わり、空文字も押せる", async () => {
    const server = await start()

    const response = await fetch(`${originOf(server)}${PENDING_ANSWER_EVENT_PATH}`)
    const stream = response.body
    if (stream === null) {
      throw new Error("イベントストリームの本文が空だった")
    }
    const reader = stream.getReader()

    try {
      expect(await readEvent(reader)).toContain("data: \n\n")
      server.publishPendingAnswer('<div class="pending-answer pending-permission"></div>')
      expect(await readEvent(reader)).toContain('<div class="pending-answer pending-permission">')
      server.publishPendingAnswer("")
      expect(await readEvent(reader)).toContain("data: \n\n")
    } finally {
      await reader.cancel()
    }
  })
})

describe("入力欄の / 補完の候補（GET /api/commands）", () => {
  it("init 前（getCommands が空配列を返す）は空配列を返す", async () => {
    const server = await start(undefined, undefined, undefined, () => [])

    const response = await fetch(`${originOf(server)}${COMMANDS_PATH}`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ commands: [] })
  })

  it("init 後は名前と説明の組をそのまま返す（説明が無いものは name だけ）", async () => {
    const server = await start(undefined, undefined, undefined, () => [
      { name: "clear", description: "会話をリセットする" },
      { name: "model", description: undefined },
      { name: "next-task", description: "次のタスクを1件進める" },
    ])

    const response = await fetch(`${originOf(server)}${COMMANDS_PATH}`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      commands: [
        { name: "clear", description: "会話をリセットする" },
        { name: "model" },
        { name: "next-task", description: "次のタスクを1件進める" },
      ],
    })
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
