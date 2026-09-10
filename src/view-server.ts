// ビューをブラウザに配るローカルの HTTP サーバ。「描く」層であり、外の世界との境界。
//
// **本文はメモリにしか持たない。** 発話を含む HTML をファイルに書き出す経路をここに作らない
// （docs/coding-standards.md「会話内容の扱い」— 別の場所に複製しない）。
//
// **ループバック（127.0.0.1）にだけバインドする。** 会話の一部を平文で配るので、
// 同じマシンの外からは届かないことが前提になっている。

import { readFileSync } from "node:fs"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { type Host, type Pane } from "./host.ts"
import {
  buildIndexPage,
  buildLayoutPage,
  buildViewPage,
  DISPATCH_PATH,
  LAYOUT_PATH,
  type LayoutBodies,
  TERMINALS_PATH,
  VENDOR_ASSET_CONTENT_TYPES,
  VENDOR_PATH_PREFIX,
  VIEW_NAMES,
  type ViewName,
  viewEventPath,
  viewPath,
} from "./view.ts"

// 依頼として送る文面の上限（送信のための素朴な上限であって、秘匿・検閲のためではない。
// src/view.ts の MAX_TOOL_TEXT_LENGTH と同じ考え方）。
const MAX_DISPATCH_TEXT_LENGTH = 20_000
// リクエスト本文の読み取り上限（バイト）。JSON の入れ物ぶんの余裕を持たせている。
const MAX_DISPATCH_BODY_BYTES = MAX_DISPATCH_TEXT_LENGTH * 4

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
 *
 * `host` は入力欄（右下）から届いた依頼を実際に送るために使う。ホスト依存の操作は
 * ここで直接組み立てず、必ずこのポート経由にする（docs/architecture.md「ホスト依存の操作は
 * 1つのポートにまとめる」）。
 */
export function startViewServer(port: number, host: Host): Promise<ViewServer> {
  const bodies = new Map<ViewName, string>()
  const clients = new Map<ViewName, Set<ServerResponse>>()
  // listen が終わるまでは空文字列。状態を変える経路（POST）が実際に受け付けられるのは
  // listen 後だけなので、リクエストが来る時点では必ず埋まっている。
  let boundOrigin = ""

  const server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0] ?? "/"
    respond(request, path, response, bodies, clients, host, boundOrigin)
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
      boundOrigin = origin

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
  request: IncomingMessage,
  path: string,
  response: ServerResponse,
  bodies: ReadonlyMap<ViewName, string>,
  clients: Map<ViewName, Set<ServerResponse>>,
  host: Host,
  serverOrigin: string,
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

  if (path === TERMINALS_PATH && request.method === "GET") {
    handleListTerminals(response, host)
    return
  }

  if (path === DISPATCH_PATH && request.method === "POST") {
    if (!isAllowedOrigin(request, serverOrigin)) {
      writeJson(response, 403, { ok: false, reason: "許可されていない送信元" })
      return
    }
    handleDispatch(request, response, host)
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

  const content = readOptionalFile(fileURLToPath(new URL(`../vendor/${name}`, import.meta.url)))
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

/**
 * 状態を変える経路（`POST /api/dispatch`）を、ブラウザ以外・自分自身のページからの
 * リクエストにだけ許す。**`Origin` ヘッダが無いとき（curl などブラウザ経由でない呼び出し）は
 * 通す**。ブラウザは fetch のときに `Origin` を自動で付け、こちらから偽装できない値なので、
 * 「無い＝ブラウザ経由でない」「ある＝自分のオリジンと一致するはず」で弾き分けられる。
 * サーバのオリジンは起動時に決まるポートを含むので、固定値と比較しない（`serverOrigin` は
 * `startViewServer` が実際に bind したオリジン）。
 */
function isAllowedOrigin(request: IncomingMessage, serverOrigin: string): boolean {
  const origin = request.headers.origin
  if (origin === undefined) {
    return true
  }

  return origin === serverOrigin
}

/** 送信先として選べるターミナルの一覧を JSON で返す（`src/view.ts` の入力欄が使う）。 */
function handleListTerminals(response: ServerResponse, host: Host): void {
  host
    .listPanes()
    .then((result) => {
      if (!result.ok) {
        writeJson(response, 502, { ok: false, reason: result.reason })
        return
      }

      const terminals = sortPanesByLikelyClaude(result.panes).map((pane) => ({
        id: pane.id,
        label: pane.label,
        likelyClaude: pane.likelyClaude,
      }))
      writeJson(response, 200, { ok: true, terminals })
    })
    .catch(() => {
      // Host は失敗を例外にしない契約（src/host.ts）だが、リクエストを処理するここまでは
      // 落ちないようにしておく（docs/coding-standards.md「エラーハンドリング」）。
      writeJson(response, 502, { ok: false, reason: "送信先の一覧を取得できない" })
    })
}

/**
 * 「claude が動いていそう」（`pane.likelyClaude`）なものを上に寄せる。**絞り込みはしない**。
 * 判定は Orca 側の分類（src/orca-host.ts）で確実ではないため、外れたときに一覧から消えて
 * 選べなくなることが無いよう、全件を残したまま並び順だけを変える（各グループ内の相対順は
 * 変えない。`Array#filter` は元の順を保つので、2グループに分けて連結するだけでよい）。
 */
function sortPanesByLikelyClaude(panes: readonly Pane[]): readonly Pane[] {
  const likely = panes.filter((pane) => pane.likelyClaude)
  const others = panes.filter((pane) => !pane.likelyClaude)
  return [...likely, ...others]
}

/**
 * 入力欄から届いた依頼を、選ばれたターミナルへポート経由で送る。
 *
 * **本文（依頼の文面）はここでもディスクに書かず、ログにも出さない**
 * （docs/coding-standards.md「会話内容の扱い」）。エラー時に返すのも定型の理由文だけで、
 * 受け取った文面をそのまま含めない。
 */
function handleDispatch(request: IncomingMessage, response: ServerResponse, host: Host): void {
  readRequestBody(request, MAX_DISPATCH_BODY_BYTES)
    .then(async (body) => {
      if (body === undefined) {
        writeJson(response, 413, { ok: false, reason: "本文が大きすぎる" })
        return
      }

      const dispatchRequest = parseDispatchRequest(body)
      if (dispatchRequest === undefined) {
        writeJson(response, 400, { ok: false, reason: "送信先とテキストの形式が正しくない" })
        return
      }

      const result = await host.sendText(dispatchRequest.terminalId, dispatchRequest.text)
      if (!result.ok) {
        writeJson(response, 502, { ok: false, reason: result.reason })
        return
      }

      writeJson(response, 200, { ok: true })
    })
    .catch(() => {
      writeJson(response, 400, { ok: false, reason: "本文を読み取れない" })
    })
}

type DispatchRequest = { readonly terminalId: string; readonly text: string }

function parseDispatchRequest(body: string): DispatchRequest | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return undefined
  }

  if (!isRecord(parsed)) {
    return undefined
  }

  const { terminalId, text } = parsed
  if (typeof terminalId !== "string" || terminalId.trim() === "") {
    return undefined
  }
  if (typeof text !== "string" || text.trim() === "" || text.length > MAX_DISPATCH_TEXT_LENGTH) {
    return undefined
  }

  return { terminalId, text }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * リクエスト本文を読み切る。`maxBytes` を超えたら読み取りを打ち切って undefined を返す
 * （リクエストを溜め込み続けない。素朴なサイズの上限であって秘匿のためではない）。
 */
function readRequestBody(request: IncomingMessage, maxBytes: number): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let settled = false

    request.on("data", (chunk: Buffer) => {
      if (settled) {
        return
      }
      total += chunk.length
      if (total > maxBytes) {
        settled = true
        resolve(undefined)
        // 溜め込み続けない。'end' を待たずにここで確定させる（'destroy' の後は 'end' が
        // 発火するとは限らないため）。
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on("end", () => {
      if (settled) {
        return
      }
      settled = true
      resolve(Buffer.concat(chunks).toString("utf8"))
    })
    request.on("error", (error) => {
      if (settled) {
        return
      }
      settled = true
      reject(error)
    })
  })
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  })
  response.end(JSON.stringify(body))
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
