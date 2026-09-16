// tsukumo が配る唯一のサーバ。**ページ・アセット（`/assets` `/vendor` `/character`）の静的配信
// と、フレーム・コマンドが通る WebSocket（`GET /ws?t=<起動トークン>`）の両方をここが持つ**
// （docs/design.md 5章「server.ts」）。
//
// **`Bun.serve` は使わない**（`node:http` + `ws` パッケージ。docs/coding-standards.md
// 「Bun固有APIに寄せない」）。
//
// 安全のための決まり（docs/design.md 9章）:
//   - バインド先は `127.0.0.1` だけ（listen するのはここ）
//   - **起動トークン**（起動ごとの乱数。ディスクに書かない）が合わないと ws の upgrade をしない
//     （静的配信・ページそのものは会話を含まないので、トークンは求めない。いまのまま）
//   - `Origin` があれば ws は自分のオリジンと一致すること（無ければ通す）
//   - 送り返す `error` の理由は定型文だけ（会話の内容を混ぜない）

import { randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import process from "node:process"
import { type Duplex } from "node:stream"

import { type RawData, WebSocketServer } from "ws"

import { type DispatchResult } from "../core/session-manager.ts"
import { CHARACTER_ASSET_PATH_PREFIX } from "../protocol/character.ts"
import { type ClientCommand, parseClientCommand } from "../protocol/command.ts"
import { FRAME_ERROR_REASON, type ServerFrame } from "../protocol/frame.ts"
import { SESSION_SOCKET_PATH, SESSION_TOKEN_QUERY_NAME } from "../protocol/session-socket.ts"
import {
  VENDOR_ASSET_CONTENT_TYPES,
  VENDOR_PATH_PREFIX,
  vendorAssetPath,
} from "../protocol/vendor-asset.ts"
import { bundledFilePath } from "./bundled-path.ts"

/**
 * 受け取るメッセージ1件の上限（バイト）。**立ち絵1枚（デコード後 2 MiB）を data URL で運べる
 * 大きさ**にしてある（base64 の33%増と JSON のぶんを足して 4 MiB。`docs/design.md` 7.1 の表）。
 *
 * **依頼の文面の上限はこれとは別に効いている**（zod の `MAX_PROMPT_TEXT_LENGTH`。
 * `src/protocol/command.ts`）ので、ここを上げても送れる文面は長くならない。
 */
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024

/**
 * 起動トークンを1つ作る。**起動ごとに変わり、メモリにしか置かない**（ディスクに書かない。
 * docs/design.md 9章）。同じマシンの別プロセスが `127.0.0.1` を読めるという割り切りを塞ぐ。
 */
export function createStartupToken(): string {
  return randomBytes(24).toString("hex")
}

export type SessionSocketOptions = {
  /** listen 済みの HTTP サーバ（{@link startViewServer} が立てたもの）。 */
  readonly httpServer: Server
  readonly token: string
  /** 自分のオリジン（`http://127.0.0.1:<port>`）。`Origin` ヘッダの照合に使う。 */
  readonly origin: string
  /** 接続を購読に加える（`session-manager` の `subscribe`）。外すための関数を返す契約。 */
  readonly subscribe: (send: (frame: ServerFrame) => void) => () => void
  /** コマンドを渡す（`session-manager` の `dispatch`）。 */
  readonly dispatch: (command: ClientCommand) => Promise<DispatchResult>
}

export type SessionSocket = {
  /** upgrade の受け口を外し、開いている接続を閉じる。 */
  readonly close: () => void
}

/**
 * HTTP サーバに WebSocket の受け口を足す。**listen はしない**（呼び出し側が済ませている）。
 *
 * 接続が確立したら `subscribe` に加わり、`hello` が1つ届いてから `events` が流れ始める
 * （順序を決めているのは `session-manager` 側）。
 */
export function attachSessionSocket(options: SessionSocketOptions): SessionSocket {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })

  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (!isAllowedUpgrade(request, options)) {
      // 理由は返さない（トークンの有無を探る手掛かりを増やさない）。
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
      socket.end()
      return
    }

    sockets.handleUpgrade(request, socket, head, (connection) => {
      sockets.emit("connection", connection, request)
    })
  }

  options.httpServer.on("upgrade", onUpgrade)

  sockets.on("connection", (connection) => {
    const send = (frame: ServerFrame): void => {
      if (connection.readyState === connection.OPEN) {
        connection.send(JSON.stringify(frame))
      }
    }

    const unsubscribe = options.subscribe(send)
    connection.on("message", (data: RawData) => {
      receive(data, send, options.dispatch)
    })
    connection.on("close", unsubscribe)
  })

  return {
    close: () => {
      options.httpServer.off("upgrade", onUpgrade)
      for (const connection of sockets.clients) {
        connection.terminate()
      }
      sockets.close()
    },
  }
}

/**
 * upgrade を通してよいか。**経路・起動トークン・`Origin` の3つ**を見る（docs/design.md 9章）。
 * `Origin` が無いとき（ブラウザ経由でない呼び出し）を通すのは、旧の POST と同じ規則。
 */
function isAllowedUpgrade(request: IncomingMessage, options: SessionSocketOptions): boolean {
  const url = new URL(request.url ?? "/", options.origin)
  if (url.pathname !== SESSION_SOCKET_PATH) {
    return false
  }
  if (url.searchParams.get(SESSION_TOKEN_QUERY_NAME) !== options.token) {
    return false
  }

  const origin = request.headers.origin
  return origin === undefined || origin === options.origin
}

/**
 * 届いたメッセージ1件をコマンドとして受け取る。**読めない・受け付けられないときは定型文の
 * `error` を返す**（届いた値を理由に混ぜない。docs/coding-standards.md「会話内容の扱い」）。
 */
function receive(
  data: RawData,
  send: (frame: ServerFrame) => void,
  dispatch: (command: ClientCommand) => Promise<DispatchResult>,
): void {
  const command = parseClientCommand(decodeJson(data))
  if (command === undefined) {
    send({ type: "error", commandId: undefined, reason: FRAME_ERROR_REASON.invalidCommand })
    return
  }

  dispatch(command)
    .then((result) => {
      if (!result.ok) {
        send({ type: "error", commandId: command.commandId, reason: result.reason })
      }
    })
    .catch(() => {
      send({ type: "error", commandId: command.commandId, reason: FRAME_ERROR_REASON.driverFailed })
    })
}

/** WebSocket の1メッセージを JSON として読む。読めなければ undefined（呼び出し側が弾く）。 */
function decodeJson(data: RawData): unknown {
  try {
    return JSON.parse(messageText(data))
  } catch {
    return undefined
  }
}

/** `ws` が渡してくる3つの形（Buffer / Buffer の並び / ArrayBuffer）を文字列にする。 */
function messageText(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8")
  }
  return Buffer.isBuffer(data)
    ? data.toString("utf8")
    : Buffer.from(new Uint8Array(data)).toString("utf8")
}

// ここから静的配信（ページ・`/assets`・`/vendor`・`/character`）。

/** レイアウトページの URL パス。利用者が開くのはこの1本だけ。 */
export const LAYOUT_PATH = "/"

/**
 * **自前のブラウザ側スクリプト**（`src/ui/` を `bun build` でまとめたもの）と CSS を配る経路。
 * ディスクには置かずメモリに持つ（`src/adapter/bundle.ts`）。
 */
const ASSET_PATH_PREFIX = "/assets/"
const UI_SCRIPT_NAME = "ui.js"
const STYLE_SHEET_NAME = "style.css"

function uiScriptPath(): string {
  return `${ASSET_PATH_PREFIX}${UI_SCRIPT_NAME}`
}
function styleSheetPath(): string {
  return `${ASSET_PATH_PREFIX}${STYLE_SHEET_NAME}`
}

/**
 * ブラウザに配る2つの成果物の取り出し口。**値ではなく関数**なのは、開発中に組み立て直したものへ
 * 差し替わるため（`src/adapter/ui-rebuild.ts`）。呼ぶたびに今の版を返す契約で、サーバはどちらが
 * 今の版かを自分では持たない。
 */
export type ViewAssets = {
  readonly uiScript: () => string
  readonly styleSheet: () => string
}

/** `/character/<file>` を1件配るために要るもの。中身は core（`character-pack.ts`）が決める。 */
export type CharacterAssetFile = {
  readonly contentType: string
  readonly content: Buffer
}

/**
 * `/character/<file>` の名前1つを配ってよい形にする。**allowlist に無い・ディスクに無い**ときは
 * undefined（呼び出し側が404にする）。core の `readCharacterPackFile` を束ねる。
 */
export type ServeCharacterAsset = (fileName: string) => CharacterAssetFile | undefined

// 外から届かないようにループバックにだけバインドする。ここを 0.0.0.0 に変えない。
const BIND_HOST = "127.0.0.1"

export type ViewServer = {
  /**
   * 待ち受けている HTTP サーバそのもの。**{@link attachSessionSocket} を足すためだけに
   * 外へ出している**（配線するのは `src/cli.ts`）。
   */
  readonly httpServer: Server
  /** ページの URL。利用者が実際に開くのもこれ1つでよい。 */
  readonly layoutUrl: string
  readonly close: () => Promise<void>
}

/**
 * ビューサーバを起動する。`port` に 0 を渡すと空きポートが割り当てられる。
 * ポートが塞がっているときは reject する（起動時の前提不足なので、呼び出し側は即時終了する）。
 */
export function startViewServer(
  port: number,
  /**
   * ブラウザ側スクリプトと CSS の取り出し口（`src/adapter/bundle.ts` が組み立てたもの）。
   * ディスクには置かないので、**持ち主は呼び出し側 = `src/cli.ts`** で、ここは要求のたびに
   * 引きに行く。
   */
  assets: ViewAssets,
  /**
   * `/character/<file>` の1件を配ってよい形にする（`src/adapter/character-pack.ts` の
   * `readCharacterPackFile` を束ねたもの。呼び出し側 = `src/cli.ts` が渡す）。
   */
  serveCharacterAsset: ServeCharacterAsset,
): Promise<ViewServer> {
  const server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0] ?? "/"
    respond(request, path, response, assets, serveCharacterAsset)
  })

  return new Promise((resolve, reject) => {
    let listening = false

    server.on("error", (error) => {
      if (!listening) {
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
        close: () =>
          new Promise((closed) => {
            server.closeAllConnections()
            server.close(() => closed())
          }),
      })
    })
  })
}

function respond(
  request: IncomingMessage,
  path: string,
  response: ServerResponse,
  assets: ViewAssets,
  serveCharacterAsset: ServeCharacterAsset,
): void {
  if (path === LAYOUT_PATH) {
    writeHtml(response, buildLayoutPage())
    return
  }

  if (path === uiScriptPath() && request.method === "GET") {
    // 組み立てたブラウザ側スクリプト（`src/ui/`）。**ディスクには無い**ので、vendor と違って
    // ファイルを読みに行かない。
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    })
    response.end(assets.uiScript())
    return
  }

  if (path === styleSheetPath() && request.method === "GET") {
    response.writeHead(200, {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "no-store",
    })
    response.end(assets.styleSheet())
    return
  }

  if (path.startsWith(VENDOR_PATH_PREFIX) && request.method === "GET") {
    writeVendorAsset(response, path.slice(VENDOR_PATH_PREFIX.length))
    return
  }

  if (path.startsWith(CHARACTER_ASSET_PATH_PREFIX) && request.method === "GET") {
    writeCharacterAsset(
      response,
      path.slice(CHARACTER_ASSET_PATH_PREFIX.length),
      serveCharacterAsset,
    )
    return
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
  response.end("not found\n")
}

/**
 * ページ本体。**中身は `<div id="app">` だけ**（メインビュー・キャラビュー・サイドバー・
 * 入力欄のすべてが React の部品になり、`src/ui/main.tsx` が1つの root として mount する。
 * 移行の段6。docs/design.md 12章）。ページを丸ごと再読み込みしない理由は
 * `docs/architecture.md`「ビューの更新は Server-Sent Events で押す」（更新は今は WebSocket）
 * を参照。
 */
function buildLayoutPage(): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tsukumo</title>
<link rel="stylesheet" href="${vendorAssetPath("highlight-theme.min.css")}">
<link rel="stylesheet" href="${styleSheetPath()}">
</head>
<body>
<div id="app"></div>
<script type="module" src="${uiScriptPath()}"></script>
</body>
</html>
`
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

/**
 * `/character/<file>` を配る。名前が指す中身の判断（allowlist・ファイルの読み取り）は
 * `serveCharacterAsset`（core 側）に任せ、ここは結果をそのまま配るか404にするだけ。
 */
function writeCharacterAsset(
  response: ServerResponse,
  fileName: string,
  serveCharacterAsset: ServeCharacterAsset,
): void {
  const asset = serveCharacterAsset(fileName)
  if (asset === undefined) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    response.end("not found\n")
    return
  }

  response.writeHead(200, { "content-type": asset.contentType, "cache-control": "no-store" })
  response.end(asset.content)
}

function readOptionalFile(path: string): Buffer | undefined {
  try {
    return readFileSync(path)
  } catch {
    return undefined
  }
}

function writeHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  })
  response.end(html)
}

// listen 後のアドレスは、ポート 0 を渡したときに実際に割り当てられた番号を持つ。
function boundPort(address: unknown, fallback: number): number {
  const record = typeof address === "object" && address !== null ? address : undefined
  if (record === undefined || !("port" in record) || typeof record.port !== "number") {
    return fallback
  }

  return record.port
}
