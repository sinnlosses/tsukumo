// ビューサーバ。
// ページ・アセット（`/assets` `/vendor` `/character`）の静的配信と、控えを押したときに引く依頼の画像の原寸（`GET /prompt-image/<id>?t=<起動トークン>`）と、
// レポートの `image` の塊の画像（`GET /report-image/<toolUseId>/<path>?t=<起動トークン>`）を持つ。画像はどちらも `<img src>` で読むので HTTP のまま。
// 読み取りの手続きは `/rpc` に載せるだけで、照合は `rpcGuard` のミドルウェアが見る。
// フレームとコマンドが通る WebSocket は別の境界で、listen 済みのこのサーバに受け口を足す。
// Vite の開発サーバを差し込んだ起動では、経路の表に無い要求をそちらへ回す（`ViewUi` の `dev`）。
//
// 安全のための決まり:
//   - バインド先は `127.0.0.1` だけ（listen するのはここ）
//   - 起動トークン（起動ごとの乱数。ディスクに書かない）は `/prompt-image`・`/report-image` と `/rpc` を守る。
//     ページ・同梱物・素材そのものは会話を含まないので、トークンは求めない。
//     `/prompt-image`・`/report-image` はここの経路の表（`requiresToken`）が、`/rpc` は `rpcGuard` が見る。
//     同じ1つを WebSocket の upgrade も見る

import { randomBytes } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import process from "node:process"

import type { Router } from "@orpc/server"
import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch"
import { isPlainObject } from "remeda"

import {
  CHARACTER_ASSET_PATH_PREFIX,
  type CharacterAssetLocation,
  readCharacterAssetPath,
} from "../../../shared/character-pack/character-asset.ts"
import {
  readReportImageRoute,
  REPORT_IMAGE_PATH_PREFIX,
} from "../../../shared/report/report-image.ts"
import { RPC_PATH, type rpcContract } from "../../../shared/rpc.ts"
import {
  parsePromptImage,
  PROMPT_IMAGE_PATH_PREFIX,
  promptImageIdSchema,
} from "../../../shared/session-driver/prompt-image.ts"
import { SESSION_TOKEN_QUERY_NAME } from "../../../shared/view-server/session-socket.ts"
import { VENDOR_PATH_PREFIX, vendorAssetPath } from "../../../shared/view-server/vendor-asset.ts"
import type { UiBundle } from "./bundle.ts"
import { type RpcContext, rpcContextOf } from "./rpc-guard.ts"
import type { UiDevServer } from "./ui-dev-server.ts"
import { createVendorAssetReader, type VendorAssetFile } from "./vendor-asset.ts"

/**
 * 起動トークンを1つ作る。起動ごとに変わり、メモリにしか置かない（ディスクに書かない）。
 * 同じマシンの別プロセスが `127.0.0.1` を読めるという割り切りを塞ぐ。
 * 配信（`/prompt-image`・`/rpc`）と WebSocket の upgrade が同じ1つを見る。
 */
export function createStartupToken(): string {
  return randomBytes(24).toString("hex")
}

/** レイアウトページの URL パス。利用者が開くのはこの1本だけ。 */
export const LAYOUT_PATH = "/"

/**
 * 自前のブラウザ側スクリプト（`src/browser/` を `vite build` でまとめたもの）と CSS を配る経路。
 * 成果物は `dist/browser/` にあり、起動のときに読んでメモリに持つ。
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
 * ブラウザ側をどこから配るか。`bundle` は組み立て済みのスクリプトと CSS の対を `/assets/` から、
 * `dev` は Vite の開発サーバが入口から辿るモジュールを、ここの経路に無い要求として配る。
 */
export type ViewUi =
  | { readonly kind: "bundle"; readonly bundle: UiBundle }
  | { readonly kind: "dev"; readonly devServer: UiDevServer }

/** `/character/<pack>/<file>` を1件配るために要るもの。中身はキャラクターパックを読むアダプタが決める。 */
export type CharacterAssetFile = {
  readonly contentType: string
  readonly content: Buffer
  /** 要求の `?v=` が素材の今の版と一致した（ブラウザに長期に持たせてよい）。 */
  readonly versioned: boolean
}

/**
 * `/character/<pack>/<file>` の1件を配ってよい形にする（`readCharacterAsset` を束ねる）。
 * `version` は要求の `?v=`（無ければ undefined）。
 * 無いパック・allowlist に無い・ディスクに無いときは undefined（呼び出し側が404にする）。
 */
export type ServeCharacterAsset = (
  location: CharacterAssetLocation,
  version: string | undefined,
) => CharacterAssetFile | undefined

/**
 * 棚から、id が指す原寸の data URL を引く。
 * 棚に無い（捨てた・知らない）ときは undefined（配る側が 404 にする）。
 */
export type FindPromptImage = (id: string) => string | undefined

/**
 * 棚から、レポートの呼び出しの id と塊のパスの組が指す画像を引く。
 * 棚に無い（捨てた・読めなかった・知らない）ときは undefined（配る側が 404 にする）。
 */
export type FindReportImage = (
  toolUseId: string,
  path: string,
) => { readonly mediaType: string; readonly content: Uint8Array } | undefined

/** `/rpc` に載せるルータ（全機能の手続きを束ね、照合のミドルウェアを掛けたもの）。ここはどの手続きがあるかを知らない。 */
export type RpcRouter = Router<typeof rpcContract, RpcContext>

/**
 * `/rpc` の要求の本文の上限。手続きの入力は小さい JSON だけ（画像は `/ws` で運ぶ）なので、
 * 照合の前に大きな本文を読み込まされないように低く抑える。
 */
const RPC_MAX_BODY_BYTES = 64 * 1024

// 外から届かないようにループバックにだけバインドする。ここを 0.0.0.0 に変えない。
const BIND_HOST = "127.0.0.1"

/** {@link startViewServer} が配るために要るもの一式。 */
export type ViewServerOptions = {
  /** いまのブラウザ側の配り方。動作中に `dev` から `bundle` へ替わりうるので、要求のたびに引く。 */
  readonly ui: () => ViewUi
  /** `/character/<pack>/<file>` の1件を配ってよい形にする。 */
  readonly serveCharacterAsset: ServeCharacterAsset
  /** `/prompt-image/<id>` に配る原寸の引き口（棚の `find`）。 */
  readonly findPromptImage: FindPromptImage
  /** `/report-image/<toolUseId>/<path>` に配る画像の引き口（棚の `find`）。 */
  readonly findReportImage: FindReportImage
  /** `/rpc` に載せるルータ（{@link RpcRouter}）。 */
  readonly rpcRouter: RpcRouter
  /** 起動トークン（{@link createStartupToken}）。`/prompt-image`・`/report-image` と `/rpc` はこれが合わないと配らない（`/ws` と同じ守り方）。 */
  readonly token: string
}

export type ViewServer = {
  /** 待ち受けている HTTP サーバそのもの。{@link attachSessionSocket} を足すためだけに外へ出している。 */
  readonly httpServer: Server
  /** ページの URL。利用者が実際に開くのもこれ1つでよい。 */
  readonly layoutUrl: string
  readonly close: () => Promise<void>
}

/**
 * ビューサーバを起動する。`port` に 0 を渡すと空きポートが割り当てられる。
 * ポートが塞がっているときは reject する（起動時の前提不足なので、呼び出し側は即時終了する）。
 */
export function startViewServer(port: number, options: ViewServerOptions): Promise<ViewServer> {
  const rpcHandler = new RPCHandler(options.rpcRouter, {
    plugins: [new BodyLimitPlugin({ maxBodySize: RPC_MAX_BODY_BYTES })],
  })
  const readVendorAsset = createVendorAssetReader()
  const server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0] ?? "/"
    // 要求が届くのは listen のあとなので、割り当てられたポートはもう決まっている。
    const serverOrigin = originOf(boundPort(server.address(), port))
    respond(request, path, response, { options, rpcHandler, serverOrigin, readVendorAsset })
  })

  return new Promise((resolve, reject) => {
    let listening = false

    server.on("error", (error) => {
      if (!listening) {
        reject(error)
        return
      }
      // 動作中の失敗で常駐プロセスを落とさない。
      process.stderr.write(`tsukumo: ビューサーバでエラーが起きた: ${error.message}\n`)
    })

    server.listen(port, BIND_HOST, () => {
      listening = true
      const origin = originOf(boundPort(server.address(), port))

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

/** 経路の一致のさせ方。完全一致（`exact`）か、接頭辞での一致（`prefix`）。 */
type RouteMatch =
  | { readonly kind: "exact"; readonly path: string }
  | { readonly kind: "prefix"; readonly prefix: string }

/** 受け手が使うもの一式（渡された口と、起動のときに1つだけ作る `/rpc` の受け口）。 */
type ViewServerRuntime = {
  readonly options: ViewServerOptions
  readonly rpcHandler: RPCHandler<RpcContext>
  /** 自分のオリジン（`http://127.0.0.1:<port>`）。`/rpc` の `Origin` の照合に使う。 */
  readonly serverOrigin: string
  /** 同じプロセスのあいだ、読んだ vendor の素材を覚えている読み手。 */
  readonly readVendorAsset: (name: string) => VendorAssetFile | undefined
}

/** 1経路ぶんの受け手。接頭辞を剥がす・クエリを読むといった経路固有の下ごしらえもここで行う。 */
type ViewRouteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  runtime: ViewServerRuntime,
) => void

/** 経路の表の1行。`respond` はこの表を上から探すだけで、経路名・メソッド・トークン照合の要否はここに集める。 */
type ViewRoute = {
  readonly match: RouteMatch
  /** `"ANY"` は、いまの実装でメソッドを見ていない経路（`LAYOUT_PATH` だけ）のためだけにある。 */
  readonly method: "GET" | "POST" | "ANY"
  /** `/rpc` は `false`（照合は手続きの前のミドルウェア `rpcGuard` が1つで見る）。 */
  readonly requiresToken: boolean
  readonly handle: ViewRouteHandler
}

const ROUTES = [
  {
    match: { kind: "exact", path: LAYOUT_PATH },
    method: "ANY",
    requiresToken: false,
    handle: (request, response, _path, { options }) =>
      writeLayoutPage(request, response, options.ui()),
  },
  {
    match: { kind: "exact", path: uiScriptPath() },
    method: "GET",
    requiresToken: false,
    handle: (_request, response, _path, { options }) =>
      writeBundledAsset(response, options.ui(), "text/javascript", (bundle) => bundle.uiScript),
  },
  {
    match: { kind: "exact", path: styleSheetPath() },
    method: "GET",
    requiresToken: false,
    handle: (_request, response, _path, { options }) =>
      writeBundledAsset(response, options.ui(), "text/css", (bundle) => bundle.styleSheet),
  },
  {
    match: { kind: "prefix", prefix: VENDOR_PATH_PREFIX },
    method: "GET",
    requiresToken: false,
    handle: (_request, response, path, { readVendorAsset }) =>
      writeVendorAsset(response, path.slice(VENDOR_PATH_PREFIX.length), readVendorAsset),
  },
  {
    match: { kind: "prefix", prefix: CHARACTER_ASSET_PATH_PREFIX },
    method: "GET",
    requiresToken: false,
    handle: (request, response, path, { options }) =>
      writeCharacterAsset(
        request,
        response,
        path.slice(CHARACTER_ASSET_PATH_PREFIX.length),
        options.serveCharacterAsset,
      ),
  },
  {
    match: { kind: "prefix", prefix: PROMPT_IMAGE_PATH_PREFIX },
    method: "GET",
    requiresToken: true,
    handle: (_request, response, path, { options }) =>
      writePromptImage(response, path.slice(PROMPT_IMAGE_PATH_PREFIX.length), options),
  },
  {
    match: { kind: "prefix", prefix: REPORT_IMAGE_PATH_PREFIX },
    method: "GET",
    requiresToken: true,
    handle: (_request, response, path, { options }) =>
      writeReportImage(response, path.slice(REPORT_IMAGE_PATH_PREFIX.length), options),
  },
  {
    match: { kind: "prefix", prefix: `${RPC_PATH}/` },
    method: "POST",
    requiresToken: false,
    handle: (request, response, _path, runtime) => serveRpc(request, response, runtime),
  },
] as const satisfies readonly ViewRoute[]

function matchesRoute(match: RouteMatch, path: string): boolean {
  return match.kind === "exact" ? path === match.path : path.startsWith(match.prefix)
}

function findRoute(path: string, method: string | undefined): ViewRoute | undefined {
  return ROUTES.find(
    (route) =>
      matchesRoute(route.match, path) && (route.method === "ANY" || route.method === method),
  )
}

function respond(
  request: IncomingMessage,
  path: string,
  response: ServerResponse,
  runtime: ViewServerRuntime,
): void {
  const route = findRoute(path, request.method)
  if (route === undefined) {
    const ui = runtime.options.ui()
    if (ui.kind === "dev") {
      ui.devServer.handle(request, response, () => writeNotFound(response))
      return
    }
    writeNotFound(response)
    return
  }

  if (route.requiresToken && !hasStartupToken(request, runtime.options.token)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" })
    response.end("forbidden\n")
    return
  }

  route.handle(request, response, path, runtime)
}

/**
 * ページを配る。`dev` のときは開発サーバが HMR の client を差し込んだものを配り、
 * 差し込めなかったら 500 にする。
 */
function writeLayoutPage(request: IncomingMessage, response: ServerResponse, ui: ViewUi): void {
  if (ui.kind === "bundle") {
    writeHtml(response, buildLayoutPage([styleSheetPath()], uiScriptPath()))
    return
  }

  ui.devServer
    .transformPage(request.url ?? LAYOUT_PATH, buildLayoutPage([], ui.devServer.entryScriptPath))
    .then(
      (html) => writeHtml(response, html),
      () => {
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
        response.end("internal server error\n")
      },
    )
}

/**
 * 組み立て済みの対の片方を配る。ディスクには無いので、vendor と違ってファイルを読みに行かない。
 * `dev` のときは対を持っていないので 404。
 */
function writeBundledAsset(
  response: ServerResponse,
  ui: ViewUi,
  contentType: string,
  pick: (bundle: UiBundle) => string,
): void {
  if (ui.kind !== "bundle") {
    writeNotFound(response)
    return
  }

  response.writeHead(200, {
    "content-type": `${contentType}; charset=utf-8`,
    "cache-control": "no-store",
  })
  response.end(pick(ui.bundle))
}

function writeNotFound(response: ServerResponse): void {
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
  response.end("not found\n")
}

/**
 * ページ本体。中身は `<div id="app">` だけ。
 * メインビュー・キャラビュー・サイドバー・入力欄のすべてが React の部品で、ブラウザ側の入口が1つの root として mount する。
 */
function buildLayoutPage(ownStyleSheets: readonly string[], script: string): string {
  const styleSheetLinks = [vendorAssetPath("highlight-theme.min.css"), ...ownStyleSheets]
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("\n")

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tsukumo</title>
${styleSheetLinks}
</head>
<body>
<div id="app"></div>
<script type="module" src="${script}"></script>
</body>
</html>
`
}

/**
 * 外部ライブラリ（`createVendorAssetReader` の読み手が `node_modules` から読む）を配る。
 * 名前が指す中身の判断はそちらに任せ、ここは結果をそのまま配るか404にするだけ。
 * 依存が入っていなくても配信は続ける（表示物が1つ欠けても起動失敗にしない）。
 */
function writeVendorAsset(
  response: ServerResponse,
  name: string,
  readVendorAsset: ViewServerRuntime["readVendorAsset"],
): void {
  const asset = readVendorAsset(name)
  if (asset === undefined) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    response.end("not found\n")
    return
  }

  response.writeHead(200, { "content-type": asset.contentType, "cache-control": "max-age=3600" })
  response.end(asset.content)
}

/**
 * `/character/<pack>/<file>` を配る。
 * 経路をパック名とファイル名に読み分けるのは `readCharacterAssetPath`（形が崩れていれば404）、名前が指す中身の判断（一覧・allowlist・ファイルの読み取り）は `serveCharacterAsset` に任せる。
 * ここは結果をそのまま配るか404にするだけ。
 */
function writeCharacterAsset(
  request: IncomingMessage,
  response: ServerResponse,
  rest: string,
  serveCharacterAsset: ServeCharacterAsset,
): void {
  const location = readCharacterAssetPath(rest)
  const asset =
    location === undefined ? undefined : serveCharacterAsset(location, queryValue(request, "v"))
  if (asset === undefined) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    response.end("not found\n")
    return
  }

  response.writeHead(200, {
    "content-type": asset.contentType,
    "cache-control": asset.versioned ? "max-age=31536000, immutable" : "no-store",
  })
  response.end(asset.content)
}

/**
 * 依頼に添えた画像の原寸を1枚配る。起動トークンの照合は `respond` が済ませている（配るのは会話の内容）。
 * id の形が違う・棚に無い（記録の窓から落ちた・棚の上限で押し出された）ときは 404 で、どちらかは区別しない（ブラウザは 404 を受けてから控えに倒す）。
 *
 * data URL はここでデコードする（棚は受け取った data URL のまま持つ）。
 * `Content-Type` は受け取ったときのメディアタイプ（`PROMPT_IMAGE_MEDIA_TYPES` の4つ）。
 * ブラウザのディスクのキャッシュにも残さない（`no-store`）。
 */
function writePromptImage(
  response: ServerResponse,
  rawId: string,
  options: ViewServerOptions,
): void {
  const id = promptImageIdSchema.safeParse(rawId)
  const dataUrl = id.success ? options.findPromptImage(id.data) : undefined
  const image = dataUrl === undefined ? undefined : parsePromptImage(dataUrl)
  if (image === undefined) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    response.end("not found\n")
    return
  }

  response.writeHead(200, { "content-type": image.mediaType, "cache-control": "no-store" })
  response.end(Buffer.from(image.base64, "base64"))
}

/**
 * レポートの `image` の塊の画像を1枚配る。起動トークンの照合は `respond` が済ませている（画面に会話の中身が写る）。
 * 経路は棚を引く鍵で、ここではファイルに触らない。形が崩れている・棚に無いときは 404。
 */
function writeReportImage(
  response: ServerResponse,
  rest: string,
  options: ViewServerOptions,
): void {
  const route = readReportImageRoute(rest)
  const image =
    route === undefined ? undefined : options.findReportImage(route.toolUseId, route.path)
  if (image === undefined) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    response.end("not found\n")
    return
  }

  response.writeHead(200, { "content-type": image.mediaType, "cache-control": "no-store" })
  response.end(image.content)
}

/**
 * `/rpc` の要求を手続きへ渡す。
 * 照合（起動トークン・`Origin`）は手続きの前のミドルウェア（`rpcGuard`）が見るので、ここは要求を写して渡し、応答を書き戻すだけ。
 * どの手続きにも当たらなければ 404。
 *
 * `@orpc/server/node` ではなく `@orpc/server/fetch` の受け口を使い、`node:http` との橋渡しをここで書く。
 * node の受け口の型宣言が壊れた型宣言（`@orpc/interop` の compression が公開物の中から CI の絶対パスを指す）を辿り、`tsc` が型宣言の中で落ちるため（`docs/research/external-dependency.md` の表1の oRPC の行）。
 */
function serveRpc(
  request: IncomingMessage,
  response: ServerResponse,
  runtime: ViewServerRuntime,
): void {
  const context = rpcContextOf(request, {
    startupToken: runtime.options.token,
    serverOrigin: runtime.serverOrigin,
  })
  runtime.rpcHandler
    .handle(toFetchRequest(request, runtime.serverOrigin), { prefix: RPC_PATH, context })
    .then(async (result) => {
      if (!result.matched) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
        response.end("not found\n")
        return
      }
      const body = Buffer.from(await result.response.arrayBuffer())
      response.writeHead(result.response.status, {
        ...Object.fromEntries(result.response.headers),
        "cache-control": "no-store",
      })
      response.end(body)
    })
    .catch(() => {
      // 動作中の失敗で常駐プロセスを落とさない（その回だけ 500 で諦める）。
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
      }
      response.end()
    })
}

/** `node:http` の要求を fetch の `Request` に写す（本文は読み込まずに流れのまま渡す）。 */
function toFetchRequest(request: IncomingMessage, serverOrigin: string): Request {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    for (const each of typeof value === "string" ? [value] : (value ?? [])) {
      headers.append(name, each)
    }
  }
  const hasBody = request.method !== "GET" && request.method !== "HEAD"
  // 流れの本文には `duplex: "half"` が要る（Node の fetch）が、DOM の `RequestInit` の型には無いので、
  // 型を広げた入れ物に入れてから渡す。
  const init: RequestInit & { readonly duplex: "half" } = {
    method: request.method,
    headers,
    body: hasBody ? bodyStreamOf(request) : undefined,
    duplex: "half",
  }
  return new Request(new URL(request.url ?? "/", serverOrigin), init)
}

/**
 * 要求の本文を fetch の流れにする。
 * 溜めずに流すので、上限（{@link RPC_MAX_BODY_BYTES}）を超えた本文は `BodyLimitPlugin` が読みながら断る。
 * `Readable.toWeb` を使わないのは、戻り値の型が `node:stream/web` の `ReadableStream` で、fetch の `BodyInit` に型の上で渡せないため。
 */
function bodyStreamOf(request: IncomingMessage): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start: (controller) => {
      request.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
      request.on("end", () => controller.close())
      request.on("error", (error) => controller.error(error))
    },
  })
}

/** 起動トークン（`?t=<token>`）が合うか。経路の照合は呼び出し側が済ませている。 */
function hasStartupToken(request: IncomingMessage, token: string): boolean {
  return queryValue(request, SESSION_TOKEN_QUERY_NAME) === token
}

/** クエリ1つの値（無ければ undefined）。外来の `null` はここで畳む。 */
function queryValue(request: IncomingMessage, name: string): string | undefined {
  const url = new URL(request.url ?? "/", `http://${BIND_HOST}`)
  return url.searchParams.get(name) ?? undefined
}

function writeHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  })
  response.end(html)
}

function originOf(port: number): string {
  return `http://${BIND_HOST}:${String(port)}`
}

// listen 後のアドレスは、ポート 0 を渡したときに実際に割り当てられた番号を持つ。
function boundPort(address: unknown, fallback: number): number {
  return isPlainObject(address) && typeof address.port === "number" ? address.port : fallback
}
