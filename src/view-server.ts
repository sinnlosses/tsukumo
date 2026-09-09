// ビューをブラウザに配るローカルの HTTP サーバ。「描く」層であり、外の世界との境界。
//
// **本文はメモリにしか持たない。** 発話を含む HTML をファイルに書き出す経路をここに作らない
// （docs/coding-standards.md「会話内容の扱い」— 別の場所に複製しない）。
//
// **ループバック（127.0.0.1）にだけバインドする。** 会話の一部を平文で配るので、
// 同じマシンの外からは届かないことが前提になっている。

import { createServer, type ServerResponse } from "node:http"
import process from "node:process"

import {
  buildIndexPage,
  buildLayoutPage,
  buildViewPage,
  LAYOUT_PATH,
  type LayoutBodies,
  VIEW_NAMES,
  type ViewName,
  viewEventPath,
  viewPath,
} from "./view.ts"

// 外から届かないようにループバックにだけバインドする。ここを 0.0.0.0 に変えない。
const BIND_HOST = "127.0.0.1"

// 接続が黙ったまま切られるのを防ぐための空打ち。中身は持たない。
const HEARTBEAT_INTERVAL_MS = 15_000

export type ViewServer = {
  /** ブラウザで開く URL。ホストのポート（src/host.ts）に渡すのはこの文字列だけ。 */
  readonly urlOf: (view: ViewName) => string
  /**
   * 3領域をまとめたレイアウトページの URL。利用者が実際に開くのはこちら1つだけでよい
   * （個別の `urlOf` はデバッグ用に残してある。`docs/architecture.md`「3つのビューは
   * 1枚のページにまとめる」）。
   */
  readonly layoutUrl: string
  /** ビューの本文を差し替え、開いているブラウザへ push する。 */
  readonly publish: (view: ViewName, body: string) => void
  readonly close: () => Promise<void>
}

/**
 * ビューサーバを起動する。`port` に 0 を渡すと空きポートが割り当てられる。
 * ポートが塞がっているときは reject する（起動時の前提不足なので、呼び出し側は即時終了する）。
 */
export function startViewServer(port: number): Promise<ViewServer> {
  const bodies = new Map<ViewName, string>()
  const clients = new Map<ViewName, Set<ServerResponse>>()

  const server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0] ?? "/"
    respond(path, response, bodies, clients)
  })

  const heartbeat = setInterval(() => {
    for (const responses of clients.values()) {
      for (const response of responses) {
        response.write(": ping\n\n")
      }
    }
  }, HEARTBEAT_INTERVAL_MS)
  heartbeat.unref()

  return new Promise((resolve, reject) => {
    let listening = false

    server.on("error", (error) => {
      if (!listening) {
        clearInterval(heartbeat)
        reject(error)
        return
      }
      // 動作中の失敗で常駐プロセスを落とさない（docs/coding-standards.md「エラーハンドリング」）。
      process.stderr.write(`tsukumo: ビューサーバでエラーが起きた: ${error.message}\n`)
    })

    server.listen(port, BIND_HOST, () => {
      listening = true
      const origin = `http://${BIND_HOST}:${boundPort(server.address(), port)}`

      resolve({
        urlOf: (view) => `${origin}${viewPath(view)}`,
        layoutUrl: `${origin}${LAYOUT_PATH}`,
        publish: (view, body) => {
          bodies.set(view, body)
          for (const response of clientsFor(clients, view)) {
            writeUpdate(response, body)
          }
        },
        close: () => {
          clearInterval(heartbeat)
          for (const responses of clients.values()) {
            for (const response of responses) {
              response.end()
            }
            responses.clear()
          }
          return new Promise((closed) => {
            server.closeAllConnections()
            server.close(() => closed())
          })
        },
      })
    })
  })
}

function respond(
  path: string,
  response: ServerResponse,
  bodies: ReadonlyMap<ViewName, string>,
  clients: Map<ViewName, Set<ServerResponse>>,
): void {
  if (path === "/") {
    writeHtml(response, buildIndexPage())
    return
  }

  if (path === LAYOUT_PATH) {
    writeHtml(response, buildLayoutPage(currentBodies(bodies)))
    return
  }

  const page = VIEW_NAMES.find((view) => viewPath(view) === path)
  if (page !== undefined) {
    writeHtml(response, buildViewPage(page, bodies.get(page) ?? ""))
    return
  }

  const stream = VIEW_NAMES.find((view) => viewEventPath(view) === path)
  if (stream !== undefined) {
    openStream(response, stream, bodies.get(stream) ?? "", clients)
    return
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
  response.end("not found\n")
}

/** レイアウトページに埋め込む、3領域それぞれの最新の本文。まだ publish されていない領域は空。 */
function currentBodies(bodies: ReadonlyMap<ViewName, string>): LayoutBodies {
  return {
    main: bodies.get("main") ?? "",
    character: bodies.get("character") ?? "",
    sidebar: bodies.get("sidebar") ?? "",
  }
}

function writeHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  })
  response.end(html)
}

function openStream(
  response: ServerResponse,
  view: ViewName,
  body: string,
  clients: Map<ViewName, Set<ServerResponse>>,
): void {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
  })

  const responses = clientsFor(clients, view)
  responses.add(response)
  response.on("close", () => {
    responses.delete(response)
  })

  writeUpdate(response, body)
}

// Server-Sent Events の1メッセージ。本文の改行はそのままでは送れないので、行ごとに data: を付ける
// （ブラウザ側の EventSource が改行で繋ぎ直す）。
function writeUpdate(response: ServerResponse, body: string): void {
  const data = body
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => `data: ${line}`)
    .join("\n")

  response.write(`event: update\n${data}\n\n`)
}

function clientsFor(
  clients: Map<ViewName, Set<ServerResponse>>,
  view: ViewName,
): Set<ServerResponse> {
  const existing = clients.get(view)
  if (existing !== undefined) {
    return existing
  }

  const created = new Set<ServerResponse>()
  clients.set(view, created)
  return created
}

// listen 後のアドレスは、ポート 0 を渡したときに実際に割り当てられた番号を持つ。
function boundPort(address: unknown, fallback: number): number {
  const record = typeof address === "object" && address !== null ? address : undefined
  if (record === undefined || !("port" in record) || typeof record.port !== "number") {
    return fallback
  }

  return record.port
}
