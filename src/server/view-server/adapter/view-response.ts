// ビューサーバが静的に書き出す応答（ページ・同梱物・vendor・素材・画像・404）。

import type { IncomingMessage, ServerResponse } from "node:http"

import { readCharacterAssetPath } from "../../../shared/character-pack/character-asset.ts"
import { readItemAssetPath } from "../../../shared/item/item-asset.ts"
import { readReportImageRoute } from "../../../shared/report/report-image.ts"
import {
  parsePromptImage,
  promptImageIdSchema,
} from "../../../shared/session-driver/prompt-image.ts"
import { vendorAssetPath } from "../../../shared/view-server/vendor-asset.ts"
import type { UiBundle } from "./bundle.ts"
import type {
  FindPromptImage,
  FindReportImage,
  ServeCharacterAsset,
  ServeItemAsset,
  ViewUi,
} from "./server.ts"
import type { VendorAssetFile } from "./vendor-asset.ts"

/**
 * 自前のブラウザ側スクリプト（`src/browser/` を `vite build` でまとめたもの）と CSS を配る経路。
 * 成果物は `dist/browser/` にあり、起動のときに読んでメモリに持つ。
 * 入口から `import()` で分けたチャンクは、入口の隣（`/assets/<チャンクの名前>`）で配る。
 */
export const ASSET_PATH_PREFIX = "/assets/"
const UI_SCRIPT_NAME = "ui.js"
const STYLE_SHEET_NAME = "style.css"

/** 入口が後から `import()` で取りに行くチャンクのうち、ページを開いた直後に先読みするもの。 */
const PRELOADED_CHUNK_NAMES: readonly string[] = ["markdown-renderer.js", "lib.js"]

export function uiScriptPath(): string {
  return `${ASSET_PATH_PREFIX}${UI_SCRIPT_NAME}`
}
export function styleSheetPath(): string {
  return `${ASSET_PATH_PREFIX}${STYLE_SHEET_NAME}`
}

/**
 * ページを配る。`dev` のときは開発サーバが HMR の client を差し込んだものを配り、
 * 差し込めなかったら 500 にする。
 */
export function writeLayoutPage(url: string, response: ServerResponse, ui: ViewUi): void {
  if (ui.kind === "bundle") {
    writeHtml(
      response,
      buildLayoutPage([styleSheetPath()], uiScriptPath(), PRELOADED_CHUNK_NAMES),
      PAGE_CONTENT_SECURITY_POLICY.bundle,
    )
    return
  }

  ui.devServer.transformPage(url, buildLayoutPage([], ui.devServer.entryScriptPath)).then(
    (html) => writeHtml(response, html, PAGE_CONTENT_SECURITY_POLICY.dev),
    () => {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
      response.end("internal server error\n")
    },
  )
}

/**
 * 組み立て済みの束から1本を配る。ディスクには無いので、vendor と違ってファイルを読みに行かない。
 * `dev` のときは束を持っていないので 404。`pick` が `undefined` を返したとき（束に無い名前）も 404。
 */
export function writeBundledAsset(
  request: IncomingMessage,
  response: ServerResponse,
  ui: ViewUi,
  contentType: string,
  pick: (bundle: UiBundle) => string | undefined,
): void {
  const content = ui.kind === "bundle" ? pick(ui.bundle) : undefined
  if (ui.kind !== "bundle" || content === undefined) {
    writeNotFound(response)
    return
  }

  const { etag } = ui.bundle
  if (request.headers["if-none-match"] === etag) {
    response.writeHead(304, { etag, "cache-control": "no-cache" })
    response.end()
    return
  }

  response.writeHead(200, {
    "content-type": `${contentType}; charset=utf-8`,
    "cache-control": "no-cache",
    etag,
  })
  response.end(content)
}

export function writeNotFound(response: ServerResponse): void {
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
  response.end("not found\n")
}

/**
 * 外部ライブラリ（`createVendorAssetReader` の読み手が `node_modules` から読む）を配る。
 * 名前が指す中身の判断はそちらに任せ、ここは結果をそのまま配るか404にするだけ。
 * 依存が入っていなくても配信は続ける（表示物が1つ欠けても起動失敗にしない）。
 */
export function writeVendorAsset(
  response: ServerResponse,
  name: string,
  readVendorAsset: (name: string) => VendorAssetFile | undefined,
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
 * `/character/<pack>/<file>` を配る。`version` は要求の `?v=`（無ければ undefined）。
 * 経路をパック名とファイル名に読み分けるのは `readCharacterAssetPath`（形が崩れていれば404）、名前が指す中身の判断（一覧・allowlist・ファイルの読み取り）は `serveCharacterAsset` に任せる。
 * ここは結果をそのまま配るか404にするだけ。
 */
export function writeCharacterAsset(
  response: ServerResponse,
  rest: string,
  version: string | undefined,
  serveCharacterAsset: ServeCharacterAsset,
): void {
  const location = readCharacterAssetPath(rest)
  const asset = location === undefined ? undefined : serveCharacterAsset(location, version)
  if (asset === undefined) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    response.end("not found\n")
    return
  }

  response.writeHead(200, {
    "content-type": asset.contentType,
    "cache-control": asset.versioned ? "max-age=31536000, immutable" : "no-store",
    "content-security-policy": CHARACTER_ASSET_CONTENT_SECURITY_POLICY,
  })
  response.end(asset.content)
}

/**
 * `/item/<file>` を配る。`version` は要求の `?v=`（無ければ undefined）。
 * 経路をファイル名に読むのは `readItemAssetPath`（形が崩れていれば404）、載っているかの判断は `serveItemAsset` に任せる。
 * キャッシュと CSP は {@link writeCharacterAsset} と同じ。
 */
export function writeItemAsset(
  response: ServerResponse,
  rest: string,
  version: string | undefined,
  serveItemAsset: ServeItemAsset,
): void {
  const fileName = readItemAssetPath(rest)
  const asset = fileName === undefined ? undefined : serveItemAsset(fileName, version)
  if (asset === undefined) {
    writeNotFound(response)
    return
  }

  response.writeHead(200, {
    "content-type": asset.contentType,
    "cache-control": asset.versioned ? "max-age=31536000, immutable" : "no-store",
    "content-security-policy": CHARACTER_ASSET_CONTENT_SECURITY_POLICY,
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
export function writePromptImage(
  response: ServerResponse,
  rawId: string,
  findPromptImage: FindPromptImage,
): void {
  const id = promptImageIdSchema.safeParse(rawId)
  const dataUrl = id.success ? findPromptImage(id.data) : undefined
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
 * 同じ経路の中身は変わらない前提で、ブラウザに1時間持たせる。
 */
export function writeReportImage(
  response: ServerResponse,
  rest: string,
  findReportImage: FindReportImage,
): void {
  const route = readReportImageRoute(rest)
  const image = route === undefined ? undefined : findReportImage(route.toolUseId, route.path)
  if (image === undefined) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    response.end("not found\n")
    return
  }

  response.writeHead(200, {
    "content-type": image.mediaType,
    "cache-control": "private, max-age=3600",
  })
  response.end(image.content)
}

/**
 * ページの `script-src` 以外の CSP。
 * `style-src` の `'unsafe-inline'` は、mermaid が `innerHTML` で差す図の `<style>` 要素が要る。
 * `connect-src 'self'` は `/rpc` と、同じホスト・ポートの `ws:`（`/ws` と開発時の `/vite-hmr`）を覆う。
 */
const PAGE_POLICY_DIRECTIVES: readonly string[] = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
]

/** 開発サーバは Vite が HMR の前置きを `<script>` の中身で差し込むので、そのときだけ `'unsafe-inline'` を許す。 */
const PAGE_CONTENT_SECURITY_POLICY = {
  bundle: [...PAGE_POLICY_DIRECTIVES, "script-src 'self'"].join("; "),
  dev: [...PAGE_POLICY_DIRECTIVES, "script-src 'self' 'unsafe-inline'"].join("; "),
} satisfies Record<ViewUi["kind"], string>

/** `/character/` の SVG がページの外で直接開かれたときに、スクリプトを動かさず同じオリジンにも置かない。 */
const CHARACTER_ASSET_CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox"

/**
 * ページ本体。中身は `<div id="app">` だけ。
 * メインビュー・キャラビュー・サイドバー・入力欄のすべてが React の部品で、ブラウザ側の入口が1つの root として mount する。
 */
function buildLayoutPage(
  ownStyleSheets: readonly string[],
  script: string,
  preloadedChunkNames: readonly string[] = [],
): string {
  const styleSheetLinks = [
    ...[vendorAssetPath("highlight-theme.min.css"), ...ownStyleSheets].map(
      (href) => `<link rel="stylesheet" href="${href}">`,
    ),
    ...preloadedChunkNames.map(
      (name) => `<link rel="modulepreload" href="${ASSET_PATH_PREFIX}${name}">`,
    ),
  ].join("\n")

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">
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

function writeHtml(response: ServerResponse, html: string, contentSecurityPolicy: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": contentSecurityPolicy,
  })
  response.end(html)
}
