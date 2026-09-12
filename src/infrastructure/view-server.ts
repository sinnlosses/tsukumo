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

import { type Answer, parseAnswer } from "../domain/pending-answer.ts"
import { type CommandDescription } from "../domain/session-event.ts"
import {
  buildLayoutPage,
  ANSWER_PATH,
  COMMANDS_PATH,
  encodeTurnStatus,
  INTERRUPT_PATH,
  LAYOUT_PATH,
  type LayoutBodies,
  MODEL_PATH,
  PENDING_ANSWER_EVENT_PATH,
  PERMISSION_MODE_PATH,
  PROMPT_PATH,
  TURN_STATUS_EVENT_PATH,
  type TurnStatus,
  ASSET_PATH_PREFIX,
  BROWSER_SCRIPT_NAME,
  STYLE_SHEET_NAME,
  VENDOR_ASSET_CONTENT_TYPES,
  VENDOR_PATH_PREFIX,
  VIEW_NAMES,
  type ViewName,
  viewEventPath,
} from "../presentation/view.ts"
import { bundledFilePath } from "./bundled-path.ts"
import {
  isModelAlias,
  isPermissionMode,
  type ModelAlias,
  type PermissionMode,
} from "./session-driver.ts"

// 依頼として送る文面の上限（送信のための素朴な上限であって、秘匿・検閲のためではない。
// src/presentation/view.ts の MAX_TOOL_TEXT_LENGTH と同じ考え方）。
const MAX_DISPATCH_TEXT_LENGTH = 20_000
// リクエスト本文の読み取り上限（バイト）。JSON の入れ物ぶんの余裕を持たせている。
const MAX_DISPATCH_BODY_BYTES = MAX_DISPATCH_TEXT_LENGTH * 4

// 外から届かないようにループバックにだけバインドする。ここを 0.0.0.0 に変えない。
const BIND_HOST = "127.0.0.1"

// 接続が黙ったまま切られるのを防ぐための空打ち。中身は持たない。
const HEARTBEAT_INTERVAL_MS = 15_000

/**
 * 入力欄から届いた依頼をセッション駆動へ渡す関数。**受け取れたかどうかだけを返す**
 * （セッションがまだ起きていないときは `false`）。ここで待たないのは、応答が返るのは
 * ビューの SSE 側だから。
 */
export type SendPrompt = (text: string) => boolean

/**
 * 入力欄から届いた中断の要求をセッション駆動へ渡す関数。**駆動側の `interrupt()` は
 * `Promise<void>` を返す**（失敗しても例外にはしない契約。src/infrastructure/session-driver.ts）ので、
 * ここでは待つだけでよく、受け取れたかどうかの真偽値は要らない。
 */
export type SendInterrupt = () => Promise<void>

/**
 * 答え待ちの箱から届いた回答をセッション駆動へ渡す関数。**駆動側の `answer` は同期的に
 * 真偽値を返す契約**（解決済み・知らない id なら `false`。src/domain/pending-answer.ts）。
 */
export type SendAnswer = (id: string, answer: Answer) => boolean

/**
 * 許可モードの `<select>` から届いた切り替えをセッション駆動へ渡す関数。**セッションが
 * まだ起きていないときは `false` を返す**（`SendPrompt` と同じ契約。駆動側の
 * `setPermissionMode` 自体は失敗を例外にしない）。
 */
export type SendPermissionMode = (mode: PermissionMode) => Promise<boolean>

/**
 * サイドバーのモデル `<select>` から届いた切り替えをセッション駆動へ渡す関数。**`SendPermissionMode`
 * と同じ契約**（セッションがまだ起きていないときは `false`）。`/model` を送るのではなく、
 * 駆動側の `setModel`（Agent SDK）を呼ぶ。
 */
export type SendModel = (model: ModelAlias) => Promise<boolean>

/**
 * 入力欄の `/` 補完に出せるコマンドの一覧（名前と、あれば説明）を読む関数。**呼ばれた時点の
 * 最新の値**を返す契約（`init` 前は空配列。`GET /api/commands` が毎リクエストごとに呼ぶ。
 * src/usecase/session-view.ts の `commandSuggestions` が端末専用を除いた名前に説明を添える計算を
 * すでに済ませている）。
 */
export type GetCommands = () => readonly CommandDescription[]

export type ViewServer = {
  /**
   * 3領域をまとめたレイアウトページの URL。ホストのポート（src/infrastructure/host.ts）に渡すのはこの文字列だけで、
   * 利用者が実際に開くのもこれ1つでよい（個別ビューのページは 2026-09-12 に消した。
   * `docs/architecture.md`「ビューは1枚のページにまとめる」）。
   */
  readonly layoutUrl: string
  /** ビューの本文を差し替え、開いているブラウザへ push する。 */
  readonly publish: (view: ViewName, body: string) => void
  /**
   * 入力欄の「ターンが進行中か」（送信ボタン／中断ボタンの出し分け）と、経過時間の起点・終点を、
   * 開いているブラウザへ push する。**サーバがこの状態を持つ**（ブラウザ側が送信ボタンを
   * 押した瞬間に勝手に決めない。docs/requirements.md 4.7）。経過時間の表示は送信ボタンと
   * 同じ行に出る（2026-09-12 T-075 決定。`src/presentation/view.ts` の `TurnStatus` / `encodeTurnStatus`）。
   */
  readonly publishTurnStatus: (status: TurnStatus) => void
  /**
   * 答え待ちの箱（許可要求・質問）の本文を、開いているブラウザへ push する。**`publish` /
   * `publishTurnStatus` と同型**（対応する `ViewName` の領域を持たない専用の経路）。
   * 答え待ちが無いときは空文字を渡す（`docs/requirements.md` 4.7）。
   */
  readonly publishPendingAnswer: (html: string) => void
  readonly close: () => Promise<void>
}

/**
 * ビューサーバを起動する。`port` に 0 を渡すと空きポートが割り当てられる。
 * ポートが塞がっているときは reject する（起動時の前提不足なので、呼び出し側は即時終了する）。
 *
 * **ホスト（src/infrastructure/host.ts）には依存しない。** 依頼も回答もこのサーバがセッション駆動へ直接渡す
 * ので、ホストに頼るのはビューを開くこと（`showView`。呼ぶのは src/index.ts）だけ。
 */
export function startViewServer(
  port: number,
  sendPrompt: SendPrompt,
  sendInterrupt: SendInterrupt,
  sendAnswer: SendAnswer,
  sendPermissionMode: SendPermissionMode,
  sendModel: SendModel,
  getCommands: GetCommands,
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
): Promise<ViewServer> {
  const bodies = new Map<ViewName, string>()
  const clients = new Map<ViewName, Set<ServerResponse>>()
  const turnStatusClients = new Set<ServerResponse>()
  const pendingAnswerClients = new Set<ServerResponse>()
  // ターンの進行状態（開始・終了時刻）。セッションが起きる前はどちらも無いのが正しい既定値。
  let turnStatusBody = encodeTurnStatus({ turnStartedAt: undefined, turnFinishedAt: undefined })
  // 答え待ちの箱の本文。セッションが起きる前・答え待ちが無いときは空文字（=箱なし）。
  let pendingAnswerBody = ""
  // listen が終わるまでは空文字列。状態を変える経路（POST）が実際に受け付けられるのは
  // listen 後だけなので、リクエストが来る時点では必ず埋まっている。
  let boundOrigin = ""

  const server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0] ?? "/"
    respond(
      request,
      path,
      response,
      bodies,
      clients,
      boundOrigin,
      sendPrompt,
      sendInterrupt,
      sendAnswer,
      sendPermissionMode,
      sendModel,
      getCommands,
      turnStatusClients,
      () => turnStatusBody,
      pendingAnswerClients,
      () => pendingAnswerBody,
      browserScript,
      styleSheet,
    )
  })

  const heartbeat = setInterval(() => {
    for (const responses of clients.values()) {
      for (const response of responses) {
        response.write(": ping\n\n")
      }
    }
    for (const response of turnStatusClients) {
      response.write(": ping\n\n")
    }
    for (const response of pendingAnswerClients) {
      response.write(": ping\n\n")
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
        layoutUrl: `${origin}${LAYOUT_PATH}`,
        publish: (view, body) => {
          bodies.set(view, body)
          for (const response of clientsFor(clients, view)) {
            writeUpdate(response, body)
          }
        },
        publishTurnStatus: (status) => {
          turnStatusBody = encodeTurnStatus(status)
          for (const response of turnStatusClients) {
            writeUpdate(response, turnStatusBody)
          }
        },
        publishPendingAnswer: (html) => {
          pendingAnswerBody = html
          for (const response of pendingAnswerClients) {
            writeUpdate(response, pendingAnswerBody)
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
          for (const response of turnStatusClients) {
            response.end()
          }
          turnStatusClients.clear()
          for (const response of pendingAnswerClients) {
            response.end()
          }
          pendingAnswerClients.clear()
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
  serverOrigin: string,
  sendPrompt: SendPrompt,
  sendInterrupt: SendInterrupt,
  sendAnswer: SendAnswer,
  sendPermissionMode: SendPermissionMode,
  sendModel: SendModel,
  getCommands: GetCommands,
  turnStatusClients: Set<ServerResponse>,
  getTurnStatusBody: () => string,
  pendingAnswerClients: Set<ServerResponse>,
  getPendingAnswerBody: () => string,
  browserScript: string,
  styleSheet: string,
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

  if (path === TURN_STATUS_EVENT_PATH) {
    openSingleStream(response, getTurnStatusBody(), turnStatusClients)
    return
  }

  if (path === PENDING_ANSWER_EVENT_PATH) {
    openSingleStream(response, getPendingAnswerBody(), pendingAnswerClients)
    return
  }

  if (path === COMMANDS_PATH && request.method === "GET") {
    writeJson(response, 200, { commands: getCommands() })
    return
  }

  if (path === PROMPT_PATH && request.method === "POST") {
    if (!isAllowedOrigin(request, serverOrigin)) {
      writeJson(response, 403, { ok: false, reason: "許可されていない送信元" })
      return
    }
    handlePrompt(request, response, sendPrompt)
    return
  }

  if (path === INTERRUPT_PATH && request.method === "POST") {
    if (!isAllowedOrigin(request, serverOrigin)) {
      writeJson(response, 403, { ok: false, reason: "許可されていない送信元" })
      return
    }
    handleInterrupt(response, sendInterrupt)
    return
  }

  if (path === ANSWER_PATH && request.method === "POST") {
    if (!isAllowedOrigin(request, serverOrigin)) {
      writeJson(response, 403, { ok: false, reason: "許可されていない送信元" })
      return
    }
    handleAnswer(request, response, sendAnswer)
    return
  }

  if (path === PERMISSION_MODE_PATH && request.method === "POST") {
    if (!isAllowedOrigin(request, serverOrigin)) {
      writeJson(response, 403, { ok: false, reason: "許可されていない送信元" })
      return
    }
    handlePermissionMode(request, response, sendPermissionMode)
    return
  }

  if (path === MODEL_PATH && request.method === "POST") {
    if (!isAllowedOrigin(request, serverOrigin)) {
      writeJson(response, 403, { ok: false, reason: "許可されていない送信元" })
      return
    }
    handleModel(request, response, sendModel)
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

/**
 * 入力欄から届いた依頼をセッション駆動へ渡す。**文面はここでもディスクに書かず、ログにも
 * 出さない**（docs/coding-standards.md「会話内容の扱い」）。エラー時に返すのも定型の理由文だけ。
 */
function handlePrompt(
  request: IncomingMessage,
  response: ServerResponse,
  sendPrompt: SendPrompt,
): void {
  readRequestBody(request, MAX_DISPATCH_BODY_BYTES)
    .then((body) => {
      const text = body === undefined ? undefined : parsePromptRequest(body)
      if (text === undefined) {
        writeJson(response, 400, { ok: false, reason: "依頼の形式が正しくない" })
        return
      }

      if (!sendPrompt(text)) {
        writeJson(response, 503, { ok: false, reason: "セッションがまだ起きていない" })
        return
      }

      writeJson(response, 200, { ok: true })
    })
    .catch(() => {
      writeJson(response, 400, { ok: false, reason: "本文を読み取れない" })
    })
}

function parsePromptRequest(body: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return undefined
  }

  if (!isRecord(parsed)) {
    return undefined
  }

  const { text } = parsed
  return typeof text === "string" && text.trim() !== "" && text.length <= MAX_DISPATCH_TEXT_LENGTH
    ? text
    : undefined
}

/**
 * 実行中のターンを中断する。本文は無い。**駆動の `interrupt()` は失敗を例外にしない契約**
 * （src/infrastructure/session-driver.ts）だが、呼び出しそのもの（`Promise` の生成）が失敗する余地は残るので、
 * ここでも捕まえて理由付きの失敗を返す。
 */
function handleInterrupt(response: ServerResponse, sendInterrupt: SendInterrupt): void {
  sendInterrupt()
    .then(() => {
      writeJson(response, 200, { ok: true })
    })
    .catch(() => {
      writeJson(response, 502, { ok: false, reason: "中断できなかった" })
    })
}

/**
 * 答え待ちの箱から届いた回答を、答え待ちの列（`src/domain/pending-answer.ts`）へ渡す。
 * **解決済み・知らない id は 409**（同じボタンを二度押しても2回目はここで弾かれる）。
 * 壊れた JSON・形が合わない本文は 400。
 */
function handleAnswer(
  request: IncomingMessage,
  response: ServerResponse,
  sendAnswer: SendAnswer,
): void {
  readRequestBody(request, MAX_DISPATCH_BODY_BYTES)
    .then((body) => {
      const parsed = body === undefined ? undefined : parseAnswerRequest(body)
      if (parsed === undefined) {
        writeJson(response, 400, { ok: false, reason: "回答の形式が正しくない" })
        return
      }

      if (!sendAnswer(parsed.id, parsed.answer)) {
        writeJson(response, 409, { ok: false, reason: "解決済み、または知らない答え待ち" })
        return
      }

      writeJson(response, 200, { ok: true })
    })
    .catch(() => {
      writeJson(response, 400, { ok: false, reason: "本文を読み取れない" })
    })
}

function parseAnswerRequest(
  body: string,
): { readonly id: string; readonly answer: Answer } | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return undefined
  }

  if (!isRecord(parsed) || typeof parsed.id !== "string" || parsed.id === "") {
    return undefined
  }

  const answer = parseAnswer(parsed.answer)
  return answer === undefined ? undefined : { id: parsed.id, answer }
}

/**
 * 許可モードの `<select>` から届いた切り替えを、セッション駆動へ渡す。
 * **セッションがまだ起きていないときは 503**（`handlePrompt` と同じ扱い）。
 * `PermissionMode` の値以外・壊れた JSON は 400。
 */
function handlePermissionMode(
  request: IncomingMessage,
  response: ServerResponse,
  sendPermissionMode: SendPermissionMode,
): void {
  readRequestBody(request, MAX_DISPATCH_BODY_BYTES)
    .then((body) => {
      const mode = body === undefined ? undefined : parsePermissionModeRequest(body)
      if (mode === undefined) {
        writeJson(response, 400, { ok: false, reason: "許可モードの指定が正しくない" })
        return
      }

      sendPermissionMode(mode)
        .then((accepted) => {
          if (!accepted) {
            writeJson(response, 503, { ok: false, reason: "セッションがまだ起きていない" })
            return
          }
          writeJson(response, 200, { ok: true })
        })
        .catch(() => {
          writeJson(response, 502, { ok: false, reason: "許可モードを切り替えられなかった" })
        })
    })
    .catch(() => {
      writeJson(response, 400, { ok: false, reason: "本文を読み取れない" })
    })
}

function parsePermissionModeRequest(body: string): PermissionMode | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return undefined
  }

  if (!isRecord(parsed) || typeof parsed.mode !== "string") {
    return undefined
  }

  return isPermissionMode(parsed.mode) ? parsed.mode : undefined
}

/**
 * サイドバーのモデル `<select>` から届いた切り替えを、セッション駆動へ渡す。
 * **セッションがまだ起きていないときは 503**（`handlePermissionMode` と同じ扱い）。
 * エイリアス（`MODEL_ALIASES`）以外・壊れた JSON は 400。
 */
function handleModel(
  request: IncomingMessage,
  response: ServerResponse,
  sendModel: SendModel,
): void {
  readRequestBody(request, MAX_DISPATCH_BODY_BYTES)
    .then((body) => {
      const model = body === undefined ? undefined : parseModelRequest(body)
      if (model === undefined) {
        writeJson(response, 400, { ok: false, reason: "モデルの指定が正しくない" })
        return
      }

      sendModel(model)
        .then((accepted) => {
          if (!accepted) {
            writeJson(response, 503, { ok: false, reason: "セッションがまだ起きていない" })
            return
          }
          writeJson(response, 200, { ok: true })
        })
        .catch(() => {
          writeJson(response, 502, { ok: false, reason: "モデルを切り替えられなかった" })
        })
    })
    .catch(() => {
      writeJson(response, 400, { ok: false, reason: "本文を読み取れない" })
    })
}

function parseModelRequest(body: string): ModelAlias | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return undefined
  }

  if (!isRecord(parsed) || typeof parsed.model !== "string") {
    return undefined
  }

  return isModelAlias(parsed.model) ? parsed.model : undefined
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

/** レイアウトページに埋め込む、領域ごとの最新の本文。まだ publish されていない領域は空。 */
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

/**
 * 対応する `ViewName` の領域を持たない専用の Server-Sent Events（入力欄の「ターンが進行中か」・
 * 答え待ちの箱）。`openStream` と同じ形だが、`clients`（`Map<ViewName, Set>`）とは別に
 * `Set<ServerResponse>` 1つで足りる。
 */
function openSingleStream(
  response: ServerResponse,
  body: string,
  streamClients: Set<ServerResponse>,
): void {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
  })

  streamClients.add(response)
  response.on("close", () => {
    streamClients.delete(response)
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
