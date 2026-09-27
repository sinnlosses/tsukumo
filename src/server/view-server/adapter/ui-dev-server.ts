// Vite の開発サーバを middleware mode で起こし、ビューサーバの経路に無い要求と HMR の WebSocket を
// 引き受けさせる。`src/browser/` の保存は、ページを読み込み直さずに差分で当たる（React Fast Refresh）。
//
// `vite` はここで動的に読み込む。このファイルを import しただけでは Vite は読まれず、
// 開発サーバを起こさない起動（`tsukumo`）には Vite が入らない。
//
// Vite の JS API は同じプロセスの `process.env.NODE_ENV` を `development` に書き換える。
// 起こしたあとに `process.env` から子プロセスの環境を作ると、それも `development` になる。
//
// 差分を当てるのはブラウザ側だけ。サーバ側のソース（`src/` の `browser/` 以外）が起動時から
// 変わっていたら、差分を当てるのをやめて `onServerSourceChanged` で知らせる。
// `src/shared/` はサーバ側でも畳み込みに使われていて、ブラウザ側だけ新しくすると両側が
// 食い違ったまま動く。

import { type IncomingMessage, type Server, type ServerResponse } from "node:http"

import { bundledFilePath } from "../../adapter/bundled-path.ts"
import { UI_SOURCE_DIR_RELATIVE_PATH, VITE_CONFIG_RELATIVE_PATH } from "./bundle.ts"
import { sourceFingerprint } from "./source-fingerprint.ts"

/**
 * HMR の WebSocket の経路。`/ws` と分けておき、upgrade をどちらが受けるかを経路で決める。
 * Vite の HMR の client はこの経路へ、ページと同じオリジンで繋ぐ。
 */
const HOT_UPDATE_SOCKET_PATH = "/vite-hmr"

/** Vite の HMR の client が名乗る WebSocket のサブプロトコル（`vite-ping` は繋がるかの確かめ）。 */
const HOT_UPDATE_SOCKET_PROTOCOLS: readonly string[] = ["vite-hmr", "vite-ping"]

/** 開発サーバが読む入口。Vite の root（`src/browser/`）からの経路で、ページの `<script>` に書く。 */
const ENTRY_SCRIPT_PATH = "/main.tsx"

export type UiDevServerOptions = {
  /** Vite の HMR の WebSocket を載せる、listen 済みのビューサーバ。 */
  readonly httpServer: Server
  /** サーバ側のソースが起動時から変わったと分かった1回だけ呼ばれる。以後は差分を当てない。 */
  readonly onServerSourceChanged: () => void
}

export type UiDevServer = {
  /** ページの `<script type="module">` に書く入口。 */
  readonly entryScriptPath: string
  /** ページの HTML に、HMR の client と React Fast Refresh の前置きを差し込む。 */
  readonly transformPage: (url: string, html: string) => Promise<string>
  /** 入口から辿るモジュールと `/@vite/client` などを配る。引き受けない要求は `next` へ回す。 */
  readonly handle: (request: IncomingMessage, response: ServerResponse, next: () => void) => void
  /** Vite の HMR の WebSocket の upgrade か。そうなら Vite が受ける。 */
  readonly ownsUpgrade: (request: IncomingMessage) => boolean
}

/** Vite の開発サーバを起こす。設定はブラウザ側の組み立てと同じ Vite の設定ファイル。 */
export async function startUiDevServer(options: UiDevServerOptions): Promise<UiDevServer> {
  const { createServer } = await import("vite")
  const startupServerSource = serverSourceFingerprint()
  let serverSourceChanged = false

  const vite = await createServer({
    configFile: bundledFilePath(...VITE_CONFIG_RELATIVE_PATH),
    root: bundledFilePath(...UI_SOURCE_DIR_RELATIVE_PATH),
    appType: "custom",
    server: {
      middlewareMode: true,
      ws: { server: options.httpServer, path: HOT_UPDATE_SOCKET_PATH },
    },
    plugins: [
      {
        name: "tsukumo:server-source-guard",
        // `[]` を返すと、その保存では何も当てない。
        hotUpdate: async () => {
          if (serverSourceChanged) {
            return []
          }
          const [atStartup, now] = await Promise.all([
            startupServerSource,
            serverSourceFingerprint(),
          ])
          // 指紋が取れなかったときは、止める根拠が無いので当てる。
          if (atStartup === undefined || now === undefined || atStartup === now) {
            return undefined
          }
          serverSourceChanged = true
          options.onServerSourceChanged()
          return []
        },
      },
    ],
  })

  return {
    entryScriptPath: ENTRY_SCRIPT_PATH,
    transformPage: (url, html) => vite.transformIndexHtml(url, html),
    handle: (request, response, next) => {
      vite.middlewares(request, response, next)
    },
    ownsUpgrade: (request) => {
      const protocol = request.headers["sec-websocket-protocol"]
      const path = (request.url ?? "/").split("?")[0]
      return (
        protocol !== undefined &&
        HOT_UPDATE_SOCKET_PROTOCOLS.includes(protocol) &&
        path === HOT_UPDATE_SOCKET_PATH
      )
    },
  }
}

/** 動いているプロセスが読み込んだサーバ側のソース（`src/` の下で `browser/` 以外）の指紋。 */
function serverSourceFingerprint(): Promise<string | undefined> {
  return sourceFingerprint(bundledFilePath("src"), [UI_SOURCE_DIR_RELATIVE_PATH.at(-1) ?? ""])
}
