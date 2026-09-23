// ビューの配信。**組み立てたブラウザ側（スクリプトと CSS）と、開いているタブ**を持ち、
// `127.0.0.1` のサーバ・`/ws`・`src/browser/` の見張りを1つに束ねる。可変なのは「いま配っている
// 組み立て」「開いているタブ」「コンテキストの内訳の読み口」の3つで、どれもこのファイルの外へ
// 出ない。
//
// ここは配線層（`src/` 直下。docs/design.md 2章「層と依存の向き」）。

import process from "node:process"

import { type CurrentCharacter } from "./current-character.ts"
import { type UiBundle } from "./server/adapter/bundle.ts"
import { todayLocalDateKey } from "./server/adapter/local-time.ts"
import { listRepositoryFiles } from "./server/adapter/repository-file.ts"
import { createStartupToken, startViewServer } from "./server/adapter/server.ts"
import { attachSessionSocket } from "./server/adapter/session-socket.ts"
import { watchUiSource } from "./server/adapter/ui-rebuild.ts"
import { type ResolvedViewPort, startOnResolvedPort } from "./server/core/port-resolution.ts"
import { type PromptImageShelf } from "./server/core/prompt-image-shelf.ts"
import { type SessionManager } from "./server/core/session-manager.ts"
import { summarizeRecentTokenUsage, type TokenUsageLog } from "./server/core/token-usage.ts"
import { type ContextUsageReport, UNAVAILABLE_CONTEXT_USAGE } from "./shared/context-usage.ts"
import { type RefreshTarget, type ServerFrame } from "./shared/frame.ts"

export type ViewDeliveryOptions = {
  /** どのポートで試すか（決めるのは `src/server/core/port-resolution.ts`）。 */
  readonly portResolution: ResolvedViewPort
  /**
   * 起動のときに読んだブラウザ側の1組（`dist/browser/` に置いてあるもの）。**見張りが組み立て
   * 直すとここで差し替わる**ので、持ち主はサーバではなくこちら側。
   */
  readonly bundle: UiBundle
  /** `/character/<file>` に配る1件の出どころ。 */
  readonly character: CurrentCharacter
  /**
   * トークン消費の記録の読み口（`/token-usage` に配る集計の出どころ。持ち主は `src/main.ts`）。
   * **ここで読むのは要求が来たときだけ**で、配信を始める時点ではファイルに触らない。
   */
  readonly tokenUsageLog: TokenUsageLog
  /**
   * 依頼に添えた画像の原寸の棚（`/prompt-image/<id>` に配る原寸の出どころ。持ち主は
   * `src/main.ts`）。**ここは引くだけ**で、置くのと捨てるのはセッションの側。
   */
  readonly promptImageShelf: PromptImageShelf
  /**
   * `src/browser/` を見張り、保存のたびに組み立て直して開いているタブへ取り直しを押すか
   * （`TSUKUMO_WATCH_UI`）。
   */
  readonly watchSource: boolean
}

/** 配り始めた結果。失敗は起動時の前提不足なので、理由だけを返して呼び出し側が即時終了する。 */
export type ViewDeliveryResult =
  | {
      readonly ok: true
      /** 利用者が開く URL（起動トークン付き）。タブを開き直すときもこれをそのまま使う。 */
      readonly url: string
      /**
       * 実際に待ち受けているポート。**セッションの印の目印がここから決まる**ので返す
       * （`src/server/core/config.ts` の `sessionTag`。docs/requirements.md 4.8「鍵」）。
       */
      readonly port: number
      /** 開いたタブとセッションを繋ぐ（`/ws` の受け口を足す）。 */
      readonly connect: (session: SessionManager) => void
    }
  | { readonly ok: false; readonly reason: string }

/**
 * ビューを配り始める。**セッションはまだ繋がない** — 先に配れることを確かめてから起こすので、
 * ポートが取れずに終わるときに claude の子プロセスを残さない。
 */
export async function startViewDelivery(options: ViewDeliveryOptions): Promise<ViewDeliveryResult> {
  // 起動トークンは**このプロセスのメモリにだけ**置く（ディスクに書かない。docs/design.md 9章）。
  // ビューサーバ（`/repository-file`・`/token-usage`・`/context-usage`・`/prompt-image`）と
  // WebSocket が同じ1つを見る。
  const token = createStartupToken()
  // **`TSUKUMO_WATCH_UI` のときだけ組み立て直したものへ丸ごと差し替わる**ので、サーバには
  // 取り出し口だけを渡す。
  let assets = options.bundle
  // 開いているタブ。**セッションのイベントとは別に押したいもの**（いまは `refresh` だけ）が
  // あるので、購読をセッションに渡すついでにここでも持つ。
  const viewers = new Set<(frame: ServerFrame) => void>()
  // コンテキストの内訳の読み口。**セッションは配り始めたあとに繋がる**ので、繋がるまでは
  // 「取れない」を返すものを置いておき、`connect` で本物に差し替える（`assets` と同じ持ち方）。
  let readContextUsage: () => Promise<ContextUsageReport> = () =>
    Promise.resolve(UNAVAILABLE_CONTEXT_USAGE)

  // ポートが塞がっているのは、既定を使っているときに限り「起動時の前提不足」として即時終了せず
  // ずらして再挑戦する（src/server/core/port-resolution.ts）。明示的に渡されたときは一度だけ
  // 試してそのまま失敗する。
  const started = await startOnResolvedPort(options.portResolution, (port) =>
    startViewServer(port, {
      assets: { uiScript: () => assets.uiScript, styleSheet: () => assets.styleSheet },
      serveCharacterAsset: (fileName) => options.character.serveAsset(fileName),
      listRepositoryFiles: () => listRepositoryFiles(process.cwd()),
      // **「今日」を決めるのは配線層**（core は今日が何日かを知らない。OS のタイムゾーンに
      // 依るので、ローカル日付を作るのは `adapter/local-time.ts` の仕事）。
      readTokenUsageSummary: (days) =>
        summarizeRecentTokenUsage(options.tokenUsageLog, todayLocalDateKey(), days),
      readContextUsage: () => readContextUsage(),
      findPromptImage: (id) => options.promptImageShelf.find(id),
      token,
    }),
  )
  if (!started.ok) {
    return { ok: false, reason: started.reason }
  }
  const server = started.server

  if (options.watchSource) {
    watchUiSource({
      // **CSS だけを取り直させない**（`refresh` の `style`）。CSS Modules の class 名は
      // ハッシュ化されて JS 側の対応表にも焼かれるので、片方だけ新しくすると綴りが食い違って
      // 崩れた画面が残る。ページごと読み込み直す（選択も書きかけも `hello` で戻る）。
      onRebuilt: (bundle) => {
        assets = bundle
        pushRefresh(viewers, "page")
      },
      // 組み立て直せなくても前の版が配られたままなので、知らせるだけで続ける。
      // 理由（`bun build` の出力）はターミナルにだけ出す — ブラウザの画面には出さない。
      onFailure: (failure) => {
        process.stderr.write(`tsukumo: ${failure.reason}\n`)
        if (failure.detail !== undefined && failure.detail !== "") {
          process.stderr.write(`${failure.detail}\n`)
        }
      },
    })
  }

  return {
    ok: true,
    url: `${server.layoutUrl}?t=${token}`,
    port: started.port,
    connect: (session) => {
      readContextUsage = session.readContextUsage
      attachSessionSocket({
        httpServer: server.httpServer,
        token,
        origin: new URL(server.layoutUrl).origin,
        subscribe: (send) => {
          viewers.add(send)
          const unsubscribe = session.subscribe(send)
          return () => {
            viewers.delete(send)
            unsubscribe()
          }
        },
        dispatch: (command) => session.dispatch(command),
      })
    },
  }
}

/**
 * 開いているタブに取り直しを押す。**セッションの状態は動かない**ので `session-manager` を
 * 通さない（docs/design.md 11章）。
 */
function pushRefresh(
  viewers: ReadonlySet<(frame: ServerFrame) => void>,
  target: RefreshTarget,
): void {
  for (const send of viewers) {
    send({ type: "refresh", target })
  }
}
