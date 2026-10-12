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
import type { RPCHandler } from "@orpc/server/fetch"
import { isPlainObject } from "remeda"

import {
  CHARACTER_ASSET_PATH_PREFIX,
  type CharacterAssetLocation,
} from "../../../shared/character-pack/character-asset.ts"
import { REPORT_IMAGE_PATH_PREFIX } from "../../../shared/report/report-image.ts"
import { RPC_PATH, type rpcContract } from "../../../shared/rpc.ts"
import { PROMPT_IMAGE_PATH_PREFIX } from "../../../shared/session-driver/prompt-image.ts"
import { SESSION_TOKEN_QUERY_NAME } from "../../../shared/view-server/session-socket.ts"
import { VENDOR_PATH_PREFIX } from "../../../shared/view-server/vendor-asset.ts"
import type { UiBundle } from "./bundle.ts"
import { createRpcHandler, serveRpc } from "./rpc-bridge.ts"
import type { RpcContext } from "./rpc-guard.ts"
import type { UiDevServer } from "./ui-dev-server.ts"
import { createVendorAssetReader, type VendorAssetFile } from "./vendor-asset.ts"
import {
  ASSET_PATH_PREFIX,
  styleSheetPath,
  uiScriptPath,
  writeBundledAsset,
  writeCharacterAsset,
  writeLayoutPage,
  writeNotFound,
  writePromptImage,
  writeReportImage,
  writeVendorAsset,
} from "./view-response.ts"

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
  /** 動作中（listen のあと）にサーバそのものが失敗したときに呼ぶ。stderr への1行は変えない。 */
  readonly onRuntimeError: (error: unknown) => void
}

export type ViewServer = {
  /** 待ち受けている HTTP サーバそのもの。`attachSessionSocket` を足すためだけに外へ出している。 */
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
  const rpcHandler = createRpcHandler(options.rpcRouter)
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
      options.onRuntimeError(error)
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
      writeLayoutPage(request.url ?? LAYOUT_PATH, response, options.ui()),
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
    match: { kind: "prefix", prefix: ASSET_PATH_PREFIX },
    method: "GET",
    requiresToken: false,
    handle: (_request, response, path, { options }) =>
      writeBundledAsset(response, options.ui(), "text/javascript", (bundle) =>
        bundle.chunks.get(path.slice(ASSET_PATH_PREFIX.length)),
      ),
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
        response,
        path.slice(CHARACTER_ASSET_PATH_PREFIX.length),
        queryValue(request, "v"),
        options.serveCharacterAsset,
      ),
  },
  {
    match: { kind: "prefix", prefix: PROMPT_IMAGE_PATH_PREFIX },
    method: "GET",
    requiresToken: true,
    handle: (_request, response, path, { options }) =>
      writePromptImage(
        response,
        path.slice(PROMPT_IMAGE_PATH_PREFIX.length),
        options.findPromptImage,
      ),
  },
  {
    match: { kind: "prefix", prefix: REPORT_IMAGE_PATH_PREFIX },
    method: "GET",
    requiresToken: true,
    handle: (_request, response, path, { options }) =>
      writeReportImage(
        response,
        path.slice(REPORT_IMAGE_PATH_PREFIX.length),
        options.findReportImage,
      ),
  },
  {
    match: { kind: "prefix", prefix: `${RPC_PATH}/` },
    method: "POST",
    requiresToken: false,
    handle: (request, response, _path, { options, rpcHandler, serverOrigin }) =>
      serveRpc(request, response, { rpcHandler, startupToken: options.token, serverOrigin }),
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

/** 起動トークン（`?t=<token>`）が合うか。経路の照合は呼び出し側が済ませている。 */
function hasStartupToken(request: IncomingMessage, token: string): boolean {
  return queryValue(request, SESSION_TOKEN_QUERY_NAME) === token
}

/** クエリ1つの値（無ければ undefined）。外来の `null` はここで畳む。 */
function queryValue(request: IncomingMessage, name: string): string | undefined {
  const url = new URL(request.url ?? "/", `http://${BIND_HOST}`)
  return url.searchParams.get(name) ?? undefined
}

function originOf(port: number): string {
  return `http://${BIND_HOST}:${String(port)}`
}

// listen 後のアドレスは、ポート 0 を渡したときに実際に割り当てられた番号を持つ。
function boundPort(address: unknown, fallback: number): number {
  return isPlainObject(address) && typeof address.port === "number" ? address.port : fallback
}
