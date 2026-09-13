// ビューをブラウザに配るローカルの HTTP サーバ。「描く」層であり、外の世界との境界。
//
// **本文はメモリにしか持たない。** 発話を含む HTML をファイルに書き出す経路をここに作らない
// （docs/coding-standards.md「会話内容の扱い」— 別の場所に複製しない）。
//
// **ループバック（127.0.0.1）にだけバインドする。** 会話の一部を平文で配るので、
// 同じマシンの外からは届かないことが前提になっている。
//
// **依頼・中断・答え待ちの回答・`/` 補完は段4で WebSocket（src/core/server.ts）へ移った。**
// 旧の入力欄向けの POST / GET の経路と、そのための専用 SSE はここから消えた
// （docs/design.md 12章 段4）。ここに残るのはページ・アセットの配信と、まだ移っていない
// メイン・キャラビューの SSE（`/events/<view>`）だけ。

import { readFileSync } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import process from "node:process"

import {
  buildLayoutPage,
  LAYOUT_PATH,
  type LayoutBodies,
  ASSET_PATH_PREFIX,
  BROWSER_SCRIPT_NAME,
  UI_SCRIPT_NAME,
  STYLE_SHEET_NAME,
  VENDOR_ASSET_CONTENT_TYPES,
  VENDOR_PATH_PREFIX,
  VIEW_NAMES,
  type ViewName,
  viewEventPath,
} from "../presentation/view.ts"
import { bundledFilePath } from "./bundled-path.ts"

// 外から届かないようにループバックにだけバインドする。ここを 0.0.0.0 に変えない。
const BIND_HOST = "127.0.0.1"

// 接続が黙ったまま切られるのを防ぐための空打ち。中身は持たない。
const HEARTBEAT_INTERVAL_MS = 15_000

export type ViewServer = {
  /**
   * 待ち受けている HTTP サーバそのもの。**WebSocket の受け口（src/core/server.ts の
   * `attachSessionSocket`）を足すためだけに外へ出している**（配線するのは src/index.ts）。
   * 段3以降で HTTP の経路ごと core へ移るまでの、併存期間の受け渡し口。
   */
  readonly httpServer: Server
  /**
   * 3領域をまとめたレイアウトページの URL。ホストのポート（src/infrastructure/host.ts）に渡すのはこの文字列だけで、
   * 利用者が実際に開くのもこれ1つでよい（個別ビューのページは 2026-09-12 に消した。
   * `docs/architecture.md`「ビューは1枚のページにまとめる」）。
   */
  readonly layoutUrl: string
  /** ビューの本文を差し替え、開いているブラウザへ push する。 */
  readonly publish: (view: ViewName, body: string) => void
  readonly close: () => Promise<void>
}

/**
 * ビューサーバを起動する。`port` に 0 を渡すと空きポートが割り当てられる。
 * ポートが塞がっているときは reject する（起動時の前提不足なので、呼び出し側は即時終了する）。
 *
 * **ホスト（src/infrastructure/host.ts）には依存しない。** 依頼・回答は WebSocket
 * （src/core/server.ts）が直接セッション駆動へ渡すので、ホストに頼るのはビューを開くこと
 * （`showView`。呼ぶのは src/index.ts）だけ。
 */
export function startViewServer(
  port: number,
  /**
   * ブラウザ側スクリプトの中身（`src/presentation/browser/` を `bun build` でまとめたもの）。**起動時に
   * 1回組み立てて渡す**（`src/infrastructure/browser-bundle.ts` の `buildBrowserScript`）。ディスクには置かないので、
   * ここが唯一の持ち主になる。
   */
  browserScript: string,
  /**
   * CSS の中身（`src/presentation/style/main.css` を `bun build` でまとめたもの）。**起動時に
   * 1回組み立てて渡す**（`src/infrastructure/browser-bundle.ts` の `buildStyleSheet`）。ディスクには置かないので、
   * ここが唯一の持ち主になる。
   */
  styleSheet: string,
  /**
   * 新しいブラウザ側スクリプト（`src/ui/main.tsx` を `bun build` でまとめたもの）の中身。
   * 段2以降、React の root を配る経路を通してある（docs/design.md 12章）。
   */
  uiScript: string,
): Promise<ViewServer> {
  const bodies = new Map<ViewName, string>()
  const clients = new Map<ViewName, Set<ServerResponse>>()

  const server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0] ?? "/"
    respond(request, path, response, bodies, clients, browserScript, styleSheet, uiScript)
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
        httpServer: server,
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
  request: IncomingMessage,
  path: string,
  response: ServerResponse,
  bodies: ReadonlyMap<ViewName, string>,
  clients: Map<ViewName, Set<ServerResponse>>,
  browserScript: string,
  styleSheet: string,
  uiScript: string,
): void {
  if (path === LAYOUT_PATH) {
    writeHtml(response, buildLayoutPage(currentBodies(bodies)))
    return
  }

  const stream = VIEW_NAMES.find((view) => viewEventPath(view) === path)
  if (stream !== undefined) {
    openStream(response, stream, bodies.get(stream) ?? "", clients)
    return
  }

  if (path === `${ASSET_PATH_PREFIX}${BROWSER_SCRIPT_NAME}` && request.method === "GET") {
    // 起動時に組み立てたブラウザ側スクリプト（`src/presentation/browser/` を bun build でまとめたもの）。
    // **ディスクには無い**ので、vendor と違ってファイルを読みに行かない。
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    })
    response.end(browserScript)
    return
  }

  if (path === `${ASSET_PATH_PREFIX}${UI_SCRIPT_NAME}` && request.method === "GET") {
    // 起動時に組み立てた新しいブラウザ側スクリプト（`src/ui/`）。browser.js と同じ扱いで、
    // ディスクには無い。
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    })
    response.end(uiScript)
    return
  }

  if (path === `${ASSET_PATH_PREFIX}${STYLE_SHEET_NAME}` && request.method === "GET") {
    // 起動時に組み立てた CSS（`src/presentation/style/main.css` を bun build でまとめたもの）。
    // **ディスクには無い**ので、vendor と違ってファイルを読みに行かない。
    response.writeHead(200, {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "no-store",
    })
    response.end(styleSheet)
    return
  }

  if (path.startsWith(VENDOR_PATH_PREFIX) && request.method === "GET") {
    writeVendorAsset(response, path.slice(VENDOR_PATH_PREFIX.length))
    return
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
  response.end("not found\n")
}

/**
 * 同梱した外部ライブラリ（`vendor/`）を配る。**名前は allowlist の対応表に載っているものだけ**で、
 * リクエストのパスからファイル名を組み立てないので、`..` で外のファイルを読み出す経路が無い。
 * 置き場所はモジュールからの相対で解決する（cwd に依存させない）。
 */
function writeVendorAsset(response: ServerResponse, name: string): void {
  const contentType = VENDOR_ASSET_CONTENT_TYPES[name]
  if (contentType === undefined) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    response.end("not found\n")
    return
  }

  const content = readOptionalFile(bundledFilePath("vendor", name))
  if (content === undefined) {
    // 同梱ファイルが無くても配信は続ける（表示物が1つ欠けても起動失敗にしない）。
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    response.end("not found\n")
    return
  }

  response.writeHead(200, { "content-type": contentType, "cache-control": "max-age=3600" })
  response.end(content)
}

function readOptionalFile(path: string): Buffer | undefined {
  try {
    return readFileSync(path)
  } catch {
    return undefined
  }
}

/** レイアウトページに埋め込む、領域ごとの最新の本文。まだ publish されていない領域は空。 */
function currentBodies(bodies: ReadonlyMap<ViewName, string>): LayoutBodies {
  return {
    main: bodies.get("main") ?? "",
    character: bodies.get("character") ?? "",
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
