// ビューサーバ。**ページ・アセット（`/assets` `/vendor` `/character`）の静的配信**と、控えを押した
// ときに引く依頼の画像の原寸（`GET /prompt-image/<id>?t=<起動トークン>`。`<img src>` で読むので
// HTTP のまま）を持つ（docs/design.md 5章「server.ts」）。**読み取りの手続きは `/rpc` に載せるだけ**
// で、中身は配線の `src/router.ts` が束ねたルータ、照合は `rpc-guard.ts` のミドルウェア。
// **フレームとコマンドが通る WebSocket は別の境界**（`session-socket.ts`。listen 済みのこのサーバに
// 受け口を足す）。
//
// **`Bun.serve` は使わない**（`node:http`。docs/coding-standards.md「Bun固有APIに寄せない」）。
//
// 安全のための決まり（docs/design.md 9章）:
//   - バインド先は `127.0.0.1` だけ（listen するのはここ）
//   - **起動トークン**（起動ごとの乱数。ディスクに書かない）は `/prompt-image` と `/rpc` を守る
//     （ページ・同梱物・素材そのものは会話を含まないので、トークンは求めない。いまのまま）。
//     `/prompt-image` はここの経路の表（`requiresToken`）が、`/rpc` は `rpc-guard.ts` が見る。
//     **同じ1つを WebSocket の upgrade も見る**（`session-socket.ts`）

import { randomBytes } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import process from "node:process"

import { type Router } from "@orpc/server"
import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch"
import { isPlainObject } from "remeda"

import {
  CHARACTER_ASSET_PATH_PREFIX,
  type CharacterAssetLocation,
  readCharacterAssetPath,
} from "../../../shared/character-asset.ts"
import {
  parsePromptImage,
  PROMPT_IMAGE_PATH_PREFIX,
  promptImageIdSchema,
} from "../../../shared/prompt-image.ts"
import { RPC_PATH, type rpcContract } from "../../../shared/rpc.ts"
import { SESSION_TOKEN_QUERY_NAME } from "../../../shared/session-socket.ts"
import { VENDOR_PATH_PREFIX, vendorAssetPath } from "../../../shared/vendor-asset.ts"
import { type RpcContext, rpcContextOf } from "./rpc-guard.ts"
import { readVendorAsset } from "./vendor-asset.ts"

/**
 * 起動トークンを1つ作る。**起動ごとに変わり、メモリにしか置かない**（ディスクに書かない。
 * docs/design.md 9章）。同じマシンの別プロセスが `127.0.0.1` を読めるという割り切りを塞ぐ。
 * **配信（`/prompt-image`・`/rpc`）と WebSocket の upgrade（`session-socket.ts`）が同じ1つを見る。**
 */
export function createStartupToken(): string {
  return randomBytes(24).toString("hex")
}

/** レイアウトページの URL パス。利用者が開くのはこの1本だけ。 */
export const LAYOUT_PATH = "/"

/**
 * **自前のブラウザ側スクリプト**（`src/browser/` を `bun build` でまとめたもの）と CSS を配る経路。
 * 成果物は `dist/browser/` にあり、**起動のときに読んでメモリに持つ**
 * （`src/server/view-server/adapter/bundle.ts`）。
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
 * 差し替わるため（`src/server/view-server/adapter/ui-rebuild.ts`）。呼ぶたびに今の版を返す契約で、サーバはどちらが
 * 今の版かを自分では持たない。
 */
export type ViewAssets = {
  readonly uiScript: () => string
  readonly styleSheet: () => string
}

/** `/character/<pack>/<file>` を1件配るために要るもの。中身は `character-pack.ts` が決める。 */
export type CharacterAssetFile = {
  readonly contentType: string
  readonly content: Buffer
}

/**
 * `/character/<pack>/<file>` の1件を配ってよい形にする。**無いパック・allowlist に無い・
 * ディスクに無い**ときは undefined（呼び出し側が404にする）。`character-pack.ts` の
 * `readCharacterAsset` を束ねる。
 */
export type ServeCharacterAsset = (
  location: CharacterAssetLocation,
) => CharacterAssetFile | undefined

/**
 * 棚（`src/server/session-driver/core/prompt-image-shelf.ts`）から、id が指す原寸の data URL を引く。
 * **棚に無い（捨てた・知らない）ときは undefined**（配る側が 404 にする）。
 */
export type FindPromptImage = (id: string) => string | undefined

/**
 * `/rpc` に載せるルータ（配線の `src/router.ts` が全機能の手続きを束ね、照合のミドルウェアを
 * 掛けたもの）。ここはどの手続きがあるかを知らない。
 */
export type RpcRouter = Router<typeof rpcContract, RpcContext>

/**
 * `/rpc` の要求の本文の上限。手続きの入力は小さい JSON だけ（画像は `/ws` で運ぶ）なので、
 * 照合の前に大きな本文を読み込まされないように低く抑える。
 */
const RPC_MAX_BODY_BYTES = 64 * 1024

// 外から届かないようにループバックにだけバインドする。ここを 0.0.0.0 に変えない。
const BIND_HOST = "127.0.0.1"

/** {@link startViewServer} が配るために要るもの一式（渡すのは `src/view-delivery.ts`）。 */
export type ViewServerOptions = {
  /**
   * ブラウザ側スクリプトと CSS の取り出し口（`src/server/view-server/adapter/bundle.ts` が読んだもの）。
   * 見張りが組み立て直すと差し替わるので、**持ち主は呼び出し側 = `src/view-delivery.ts`** で、
   * ここは要求のたびに引きに行く。
   */
  readonly assets: ViewAssets
  /**
   * `/character/<pack>/<file>` の1件を配ってよい形にする（`src/server/character-pack/adapter/character-pack.ts` の
   * `readCharacterAsset` を束ねたもの）。
   */
  readonly serveCharacterAsset: ServeCharacterAsset
  /** `/prompt-image/<id>` に配る原寸の引き口（棚の `find`）。 */
  readonly findPromptImage: FindPromptImage
  /** `/rpc` に載せるルータ（{@link RpcRouter}）。 */
  readonly rpcRouter: RpcRouter
  /**
   * 起動トークン（{@link createStartupToken}）。**`/prompt-image` と `/rpc` はこれが合わないと
   * 配らない**（`/ws` と同じ守り方。冒頭の「安全のための決まり」）。
   */
  readonly token: string
}

export type ViewServer = {
  /**
   * 待ち受けている HTTP サーバそのもの。**{@link attachSessionSocket} を足すためだけに
   * 外へ出している**（配線するのは `src/view-delivery.ts`）。
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
export function startViewServer(port: number, options: ViewServerOptions): Promise<ViewServer> {
  const rpcHandler = new RPCHandler(options.rpcRouter, {
    plugins: [new BodyLimitPlugin({ maxBodySize: RPC_MAX_BODY_BYTES })],
  })
  const server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0] ?? "/"
    // 要求が届くのは listen のあとなので、割り当てられたポートはもう決まっている。
    const serverOrigin = originOf(boundPort(server.address(), port))
    respond(request, path, response, { options, rpcHandler, serverOrigin })
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
}

/** 1経路ぶんの受け手。接頭辞を剥がす・クエリを読むといった経路固有の下ごしらえもここで行う。 */
type ViewRouteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  runtime: ViewServerRuntime,
) => void

/**
 * 経路の表の1行。`respond` はこの表を上から探すだけで、経路名・メソッド・トークン照合の要否は
 * ここに集める（docs/design.md「コマンドの受け手と手続きの置き方」と同じ狙いを HTTP 側に適用した
 * もの。`docs/research/hono-server.md`「入れずに済ませる中間案」）。
 */
type ViewRoute = {
  readonly match: RouteMatch
  /** `"ANY"` は、いまの実装でメソッドを見ていない経路（`LAYOUT_PATH` だけ）のためだけにある。 */
  readonly method: "GET" | "POST" | "ANY"
  /** `/rpc` は `false`（照合は手続きの前のミドルウェア `rpc-guard.ts` が1つで見る）。 */
  readonly requiresToken: boolean
  readonly handle: ViewRouteHandler
}

const ROUTES = [
  {
    match: { kind: "exact", path: LAYOUT_PATH },
    method: "ANY",
    requiresToken: false,
    handle: (_request, response) => writeHtml(response, buildLayoutPage()),
  },
  {
    match: { kind: "exact", path: uiScriptPath() },
    method: "GET",
    requiresToken: false,
    handle: (_request, response, _path, { options }) => {
      // 組み立てたブラウザ側スクリプト（`src/browser/`）。**ディスクには無い**ので、vendor と違って
      // ファイルを読みに行かない。
      response.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
      })
      response.end(options.assets.uiScript())
    },
  },
  {
    match: { kind: "exact", path: styleSheetPath() },
    method: "GET",
    requiresToken: false,
    handle: (_request, response, _path, { options }) => {
      response.writeHead(200, {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "no-store",
      })
      response.end(options.assets.styleSheet())
    },
  },
  {
    match: { kind: "prefix", prefix: VENDOR_PATH_PREFIX },
    method: "GET",
    requiresToken: false,
    handle: (_request, response, path) =>
      writeVendorAsset(response, path.slice(VENDOR_PATH_PREFIX.length)),
  },
  {
    match: { kind: "prefix", prefix: CHARACTER_ASSET_PATH_PREFIX },
    method: "GET",
    requiresToken: false,
    handle: (_request, response, path, { options }) =>
      writeCharacterAsset(
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
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    response.end("not found\n")
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
 * ページ本体。**中身は `<div id="app">` だけ**（メインビュー・キャラビュー・サイドバー・
 * 入力欄のすべてが React の部品になり、`src/browser/main.tsx` が1つの root として mount する。
 * 移行の段6。段の記録は `docs/history/decision.md`「design.md 12. 移行の段階」）。ページを丸ごと再読み込みしない理由は
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
 * 外部ライブラリ（`src/server/view-server/adapter/vendor-asset.ts` が `node_modules` から読む）を配る。名前が指す
 * 中身の判断はそちらに任せ、ここは結果をそのまま配るか404にするだけ。**依存が入っていなくても
 * 配信は続ける**（表示物が1つ欠けても起動失敗にしない）。
 */
function writeVendorAsset(response: ServerResponse, name: string): void {
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
 * `/character/<pack>/<file>` を配る。経路をパック名とファイル名に読み分けるのは
 * `readCharacterAssetPath`（形が崩れていれば404）、名前が指す中身の判断（一覧・allowlist・
 * ファイルの読み取り）は `serveCharacterAsset` に任せ、ここは結果をそのまま配るか404にするだけ。
 */
function writeCharacterAsset(
  response: ServerResponse,
  rest: string,
  serveCharacterAsset: ServeCharacterAsset,
): void {
  const location = readCharacterAssetPath(rest)
  const asset = location === undefined ? undefined : serveCharacterAsset(location)
  if (asset === undefined) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    response.end("not found\n")
    return
  }

  response.writeHead(200, { "content-type": asset.contentType, "cache-control": "no-store" })
  response.end(asset.content)
}

/**
 * 依頼に添えた画像の原寸を1枚配る。**起動トークンの照合は `respond` が済ませている**
 * （配るのは会話の内容）。id の形が違う・棚に無い（記録の窓から落ちた・枚数の上限で押し出された）
 * ときは 404 で、どちらかは区別しない（ブラウザは 404 を受けてから控えに倒す。
 * `src/browser/components/domain/prompt-image.tsx`）。
 *
 * **data URL はここでデコードする**（棚は受け取った data URL のまま持つ）。`Content-Type` は
 * 受け取ったときのメディアタイプ（`PROMPT_IMAGE_MEDIA_TYPES` の4つ）。ブラウザのディスクの
 * キャッシュにも残さない（`no-store`）。
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
 * `/rpc` の要求を手続きへ渡す。**照合（起動トークン・`Origin`）は手続きの前のミドルウェア
 * （`rpc-guard.ts`）が見る**ので、ここは要求を写して渡し、応答を書き戻すだけ。どの手続きにも
 * 当たらなければ 404。
 *
 * **`@orpc/server/node` ではなく `@orpc/server/fetch` の受け口を使い、`node:http` との橋渡しを
 * ここで書く。** node の受け口の型宣言が壊れた型宣言（`@orpc/interop` の compression が公開物の
 * 中から CI の絶対パスを指す）を辿り、`tsc` が型宣言の中で落ちるため
 * （`docs/research/external-dependency.md` の表1の oRPC の行）。
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
  // 流れの本文には `duplex: "half"` が要る（Node の fetch）が、Bun の `RequestInit` の型には無いので、
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
 * 要求の本文を fetch の流れにする。**溜めずに流す**ので、上限（{@link RPC_MAX_BODY_BYTES}）を
 * 超えた本文は `BodyLimitPlugin` が読みながら断る。`Readable.toWeb` を使わないのは、戻り値の型が
 * `node:stream/web` の `ReadableStream` で、fetch の `BodyInit` に型の上で渡せないため。
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

/**
 * クエリ1つの値（無ければ undefined）。**外来の `null` はここで畳む**
 * （`docs/coding-standards.md`「null は自前の型に出さない」）。
 */
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
