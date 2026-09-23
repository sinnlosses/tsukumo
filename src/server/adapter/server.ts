// ビューサーバ。**ページ・アセット（`/assets` `/vendor` `/character`）の静的配信**を持つ
// （docs/design.md 5章「server.ts」）。入力欄の `@` 補完が引くファイル一覧
// （`GET /repository-file?t=<起動トークン>`）と、分析の画面が引くトークン消費の集計
// （`GET /token-usage?t=<起動トークン>&days=<日数>`）、控えを押したときに引く依頼の画像の原寸
// （`GET /prompt-image/<id>?t=<起動トークン>`）もここから配る。**フレームとコマンドが通る
// WebSocket は別の境界**（`session-socket.ts`。listen 済みのこのサーバに受け口を足す）。
//
// **`Bun.serve` は使わない**（`node:http`。docs/coding-standards.md「Bun固有APIに寄せない」）。
//
// 安全のための決まり（docs/design.md 9章）:
//   - バインド先は `127.0.0.1` だけ（listen するのはここ）
//   - **起動トークン**（起動ごとの乱数。ディスクに書かない）は `/repository-file` と
//     `/token-usage` と `/prompt-image` を守る（ページ・同梱物・素材そのものは会話を含まないので、
//     トークンは求めない。いまのまま）。配るのは利用者の作業ディレクトリの中身・使った量・
//     依頼に添えた画像（会話の内容）で、誰にでも配ってよい静的な物ではない。
//     **同じ1つを WebSocket の upgrade も見る**（`session-socket.ts`）

import { randomBytes } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import process from "node:process"

import { isPlainObject } from "remeda"

import { CHARACTER_ASSET_PATH_PREFIX } from "../../shared/character-asset.ts"
import {
  parsePromptImage,
  PROMPT_IMAGE_PATH_PREFIX,
  promptImageIdSchema,
} from "../../shared/prompt-image.ts"
import { REPOSITORY_FILE_PATH } from "../../shared/repository-file.ts"
import { SESSION_TOKEN_QUERY_NAME } from "../../shared/session-socket.ts"
import {
  readTokenUsageDays,
  TOKEN_USAGE_DAYS_QUERY_NAME,
  TOKEN_USAGE_SUMMARY_PATH,
  type TokenUsageDays,
  type TokenUsageSummary,
} from "../../shared/token-usage-summary.ts"
import { VENDOR_PATH_PREFIX, vendorAssetPath } from "../../shared/vendor-asset.ts"
import { readVendorAsset } from "./vendor-asset.ts"

/**
 * 起動トークンを1つ作る。**起動ごとに変わり、メモリにしか置かない**（ディスクに書かない。
 * docs/design.md 9章）。同じマシンの別プロセスが `127.0.0.1` を読めるという割り切りを塞ぐ。
 * **配信（`/repository-file`）と WebSocket の upgrade（`session-socket.ts`）が同じ1つを見る。**
 */
export function createStartupToken(): string {
  return randomBytes(24).toString("hex")
}

/** レイアウトページの URL パス。利用者が開くのはこの1本だけ。 */
export const LAYOUT_PATH = "/"

/**
 * **自前のブラウザ側スクリプト**（`src/browser/` を `bun build` でまとめたもの）と CSS を配る経路。
 * 成果物は `dist/browser/` にあり、**起動のときに読んでメモリに持つ**
 * （`src/server/adapter/bundle.ts`）。
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
 * 差し替わるため（`src/server/adapter/ui-rebuild.ts`）。呼ぶたびに今の版を返す契約で、サーバはどちらが
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

/**
 * 入力欄の `@` 補完に配るファイルのパス（`src/server/adapter/repository-file.ts` の
 * `listRepositoryFiles` を束ねたもの）。**git 管理下でない・`git` が無いときは空**を返す契約で、
 * サーバは失敗を区別しない。
 */
export type ListRepositoryFiles = () => Promise<readonly string[]>

/**
 * 分析の画面に配るトークン消費の集計（`src/server/core/token-usage.ts` の
 * `summarizeRecentTokenUsage` を束ねたもの）。**読めない・記録が無いときは空の集計**を返す契約で、
 * サーバは失敗を区別しない（`ListRepositoryFiles` と同じ割り切り）。
 */
export type ReadTokenUsageSummary = (days: TokenUsageDays) => TokenUsageSummary

/**
 * 棚（`src/server/core/prompt-image-shelf.ts`）から、id が指す原寸の data URL を引く。
 * **棚に無い（捨てた・知らない）ときは undefined**（配る側が 404 にする）。
 */
export type FindPromptImage = (id: string) => string | undefined

// 外から届かないようにループバックにだけバインドする。ここを 0.0.0.0 に変えない。
const BIND_HOST = "127.0.0.1"

/** {@link startViewServer} が配るために要るもの一式（渡すのは `src/view-delivery.ts`）。 */
export type ViewServerOptions = {
  /**
   * ブラウザ側スクリプトと CSS の取り出し口（`src/server/adapter/bundle.ts` が読んだもの）。
   * 見張りが組み立て直すと差し替わるので、**持ち主は呼び出し側 = `src/view-delivery.ts`** で、
   * ここは要求のたびに引きに行く。
   */
  readonly assets: ViewAssets
  /**
   * `/character/<file>` の1件を配ってよい形にする（`src/server/adapter/character-pack.ts` の
   * `readCharacterPackFile` を束ねたもの）。
   */
  readonly serveCharacterAsset: ServeCharacterAsset
  /** `/repository-file` に配るファイルのパス。 */
  readonly listRepositoryFiles: ListRepositoryFiles
  /** `/token-usage` に配るトークン消費の集計。 */
  readonly readTokenUsageSummary: ReadTokenUsageSummary
  /** `/prompt-image/<id>` に配る原寸の引き口（棚の `find`）。 */
  readonly findPromptImage: FindPromptImage
  /**
   * 起動トークン（{@link createStartupToken}）。**`/repository-file`・`/token-usage`・
   * `/prompt-image` はこれが合わないと配らない**
   * （`/ws` と同じ守り方。冒頭の「安全のための決まり」）。
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
  const server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0] ?? "/"
    respond(request, path, response, options)
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
  options: ViewServerOptions,
): void {
  if (path === LAYOUT_PATH) {
    writeHtml(response, buildLayoutPage())
    return
  }

  if (path === uiScriptPath() && request.method === "GET") {
    // 組み立てたブラウザ側スクリプト（`src/browser/`）。**ディスクには無い**ので、vendor と違って
    // ファイルを読みに行かない。
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    })
    response.end(options.assets.uiScript())
    return
  }

  if (path === styleSheetPath() && request.method === "GET") {
    response.writeHead(200, {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "no-store",
    })
    response.end(options.assets.styleSheet())
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
      options.serveCharacterAsset,
    )
    return
  }

  if (path === REPOSITORY_FILE_PATH && request.method === "GET") {
    writeRepositoryFileList(request, response, options)
    return
  }

  if (path === TOKEN_USAGE_SUMMARY_PATH && request.method === "GET") {
    writeTokenUsageSummary(request, response, options)
    return
  }

  if (path.startsWith(PROMPT_IMAGE_PATH_PREFIX) && request.method === "GET") {
    writePromptImage(request, response, path.slice(PROMPT_IMAGE_PATH_PREFIX.length), options)
    return
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
  response.end("not found\n")
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
 * 外部ライブラリ（`src/server/adapter/vendor-asset.ts` が `node_modules` から読む）を配る。名前が指す
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

/**
 * 入力欄の `@` 補完が引くファイルのパスを JSON の並びで配る。**起動トークンが合わなければ
 * 403**（理由は返さない。`/ws` と同じ）。一覧を作れなかった回は空の並びを配る
 * （候補が出ないだけで、配信は続く）。
 */
function writeRepositoryFileList(
  request: IncomingMessage,
  response: ServerResponse,
  options: ViewServerOptions,
): void {
  if (!hasStartupToken(request, options.token)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" })
    response.end("forbidden\n")
    return
  }

  options.listRepositoryFiles().then(
    (files) => writeJson(response, files),
    () => writeJson(response, []),
  )
}

/**
 * トークン消費の集計を JSON で配る。**起動トークンが合わなければ 403**（`/repository-file` と
 * 同じ。配るのは利用者が何にいくら使ったかで、誰にでも配ってよい静的な物ではない）。
 * 期間は `?days=` で、**選べない値のときは既定に落とす**（読み取りは shared の
 * `readTokenUsageDays`）。**配る中身に文面は入らない**（記録の1行にそもそも口が無い）。
 */
function writeTokenUsageSummary(
  request: IncomingMessage,
  response: ServerResponse,
  options: ViewServerOptions,
): void {
  if (!hasStartupToken(request, options.token)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" })
    response.end("forbidden\n")
    return
  }

  const days = readTokenUsageDays(queryValue(request, TOKEN_USAGE_DAYS_QUERY_NAME))
  writeJson(response, options.readTokenUsageSummary(days))
}

/**
 * 依頼に添えた画像の原寸を1枚配る。**起動トークンが合わなければ 403**（配るのは会話の内容）。
 * id の形が違う・棚に無い（記録の窓から落ちた・枚数の上限で押し出された）ときは 404 で、
 * どちらかは区別しない（ブラウザは 404 を受けてから控えに倒す。
 * `src/browser/components/prompt-image.tsx`）。
 *
 * **data URL はここでデコードする**（棚は受け取った data URL のまま持つ）。`Content-Type` は
 * 受け取ったときのメディアタイプ（`PROMPT_IMAGE_MEDIA_TYPES` の4つ）。ブラウザのディスクの
 * キャッシュにも残さない（`no-store`）。
 */
function writePromptImage(
  request: IncomingMessage,
  response: ServerResponse,
  rawId: string,
  options: ViewServerOptions,
): void {
  if (!hasStartupToken(request, options.token)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" })
    response.end("forbidden\n")
    return
  }

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

/** 起動トークン（`?t=<token>`）が合うか。経路の照合は呼び出し側が済ませている。 */
function hasStartupToken(request: IncomingMessage, token: string): boolean {
  return queryValue(request, SESSION_TOKEN_QUERY_NAME) === token
}

/**
 * クエリ1つの値（無ければ undefined）。**外来の `null` はここで畳む**
 * （`docs/coding-standards.md`「`null` を自前の型・関数の戻り値に出さない」）。
 */
function queryValue(request: IncomingMessage, name: string): string | undefined {
  const url = new URL(request.url ?? "/", `http://${BIND_HOST}`)
  return url.searchParams.get(name) ?? undefined
}

function writeJson(response: ServerResponse, value: unknown): void {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  })
  response.end(JSON.stringify(value))
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
  return isPlainObject(address) && typeof address.port === "number" ? address.port : fallback
}
