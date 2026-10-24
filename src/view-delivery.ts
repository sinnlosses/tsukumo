// ビューの配信。
// ブラウザ側の配り方（組み立て済みの対か、Vite の開発サーバか）と、開いているタブを持ち、`127.0.0.1` のサーバ・`/ws`・開発サーバを1つに束ねる。
// 可変なのは「いまの配り方」「開いているタブ」「セッションが繋がるまで差し替えを待つ読み口」の3つで、どれもこのファイルの外へ出ない。

import process from "node:process"

import type { CurrentCharacter } from "./current-character.ts"
import { createRpcRouter, type RpcRouterPorts } from "./router.ts"
import type { DiagnosticLog } from "./server/diagnostic/core/diagnostic.ts"
import type { ReportImageShelf } from "./server/report/core/report-image-shelf.ts"
import type { PromptImageShelf } from "./server/session-driver/core/prompt-image-shelf.ts"
import type { UiBundle } from "./server/view-server/adapter/bundle.ts"
import {
  createStartupToken,
  type ServeItemAsset,
  startViewServer,
  type ViewUi,
} from "./server/view-server/adapter/server.ts"
import { attachSessionSocket } from "./server/view-server/adapter/session-socket.ts"
import { startUiDevServer } from "./server/view-server/adapter/ui-dev-server.ts"
import {
  type ResolvedViewPort,
  startOnResolvedPort,
} from "./server/view-server/core/port-resolution.ts"
import type { StartedSession } from "./session-start.ts"
import {
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "./shared/context-usage/context-usage.ts"
import { swallowedFailureFootprint } from "./shared/diagnostic/swallowed-failure.ts"
import type { RefreshTarget, ServerFrame } from "./shared/frame.ts"
import { type PlanUsageReport, UNAVAILABLE_PLAN_USAGE } from "./shared/plan-usage/plan-usage.ts"
import { type SessionDigest, UNAVAILABLE_SESSION_DIGEST } from "./shared/session/session-digest.ts"

export type ViewDeliveryOptions = {
  /** どのポートで試すか（決めるのは `resolveViewPort`）。 */
  readonly portResolution: ResolvedViewPort
  /**
   * 起動のときに読んだブラウザ側の1組（`dist/browser/` に置いてあるもの）。
   * 開発サーバを起こしたときも、サーバ側のソースが変わったらこれへ戻る。
   */
  readonly bundle: UiBundle
  /** `/character/<pack>/<file>` に配る1件の出どころ。 */
  readonly character: CurrentCharacter
  /** `/item/<file>` に配る1件の出どころ。 */
  readonly serveItemAsset: ServeItemAsset
  /** 各機能の組み立て（`wire<機能>`）が返した `/rpc` の読み口。セッションが繋がってから本物になる4本はここに無く、配信が差し替える。 */
  readonly rpc: Omit<
    RpcRouterPorts,
    "refreshTasks" | "readContextUsage" | "readPlanUsage" | "readSessionDigest"
  >
  /**
   * 依頼に添えた画像の原寸の棚（`/prompt-image/<id>` に配る原寸の出どころ）。
   * ここは引くだけで、置くのと捨てるのはセッションの側。
   */
  readonly promptImageShelf: PromptImageShelf
  /** `image` の塊の画像の棚（`/report-image/` に配る画像の出どころ）。ここは引くだけ。 */
  readonly reportImageShelf: ReportImageShelf
  /** 診断ログの口。 */
  readonly diagnosticLog: DiagnosticLog
  /** 診断ログに書く「いま」を読む時計。 */
  readonly now: () => number
  /** Vite の開発サーバを差し込み、`src/browser/` の保存を HMR で当てるか（`--dev`）。 */
  readonly devServer: boolean
}

/** 配り始めた結果。失敗は起動時の前提不足なので、理由だけを返して呼び出し側が即時終了する。 */
export type ViewDeliveryResult =
  | {
      readonly ok: true
      /** 利用者が開く URL（起動トークン付き）。タブを開き直すときもこれをそのまま使う。 */
      readonly url: string
      /** 実際に待ち受けているポート。セッションの印の目印（`sessionTag`）がここから決まるので返す。 */
      readonly port: number
      /** 開いたタブとセッションを繋ぐ（`/ws` の受け口を足し、コマンドの手続きを載せる）。 */
      readonly connect: (session: StartedSession) => void
    }
  | { readonly ok: false; readonly reason: string }

/**
 * ビューを配り始める。
 * セッションはまだ繋がない。
 * 先に配れることを確かめてから起こすので、ポートが取れずに終わるときに claude の子プロセスを残さない。
 */
export async function startViewDelivery(options: ViewDeliveryOptions): Promise<ViewDeliveryResult> {
  // ビューサーバ（`/prompt-image`・`/rpc`）と WebSocket が同じ1つを見る。
  const token = createStartupToken()
  // 開発サーバを起こしたときと、そこから組み立て済みの対へ戻ったときに替わるので、サーバには取り出し口だけを渡す。
  let ui: ViewUi = { kind: "bundle", bundle: options.bundle }
  // 開いているタブ。
  // セッションのイベントとは別に押したいもの（`refresh`）があるので、購読をセッションに渡すついでにここでも持つ。
  const viewers = new Set<(frame: ServerFrame) => void>()
  // セッションから引く読み口の4つ。
  // セッションは配り始めたあとに繋がるので、繋がるまでは「取れない」を返すものを置いておき、`connect` で本物に差し替える。
  let readContextUsage: () => Promise<ContextUsageReport> = unavailableContextUsage
  let readPlanUsage: () => Promise<PlanUsageReport> = unavailablePlanUsage
  let refreshTasks: () => Promise<void> = noTasksToRefresh
  let readSessionDigest: (sessionId: string) => Promise<SessionDigest> = unavailableSessionDigest

  const rpcRouter = createRpcRouter({
    ...options.rpc,
    refreshTasks: () => refreshTasks(),
    readContextUsage: () => readContextUsage(),
    readPlanUsage: () => readPlanUsage(),
    readSessionDigest: (sessionId) => readSessionDigest(sessionId),
  })

  const started = await startOnResolvedPort(options.portResolution, (port) =>
    startViewServer(port, {
      ui: () => ui,
      serveCharacterAsset: (location, version) => options.character.serveAsset(location, version),
      serveItemAsset: options.serveItemAsset,
      findPromptImage: (id) => options.promptImageShelf.find(id),
      findReportImage: (toolUseId, path) => options.reportImageShelf.find(toolUseId, path),
      rpcRouter,
      token,
      onRuntimeError: (error) => reportSwallowedFailure(options, "http-server-error", error),
    }),
  )
  if (!started.ok) {
    return { ok: false, reason: started.reason }
  }
  const server = started.server

  const devServer = options.devServer
    ? await startUiDevServer({
        httpServer: server.httpServer,
        // 差分を当て続けると新しいブラウザ側が古いサーバと話すことになるので、起動のときの対へ戻してページごと読み込み直させる。
        // 上げ直すまでは保存しても何も当たらない。
        onServerSourceChanged: () => {
          ui = { kind: "bundle", bundle: options.bundle }
          process.stderr.write(
            "tsukumo: サーバ側のソース（src/ の browser 以外）が起動時から変わったので、HMR を止めて起動のときの画面へ戻す（tsukumo を上げ直すまで反映しない）\n",
          )
          pushRefresh(viewers, "page")
        },
      })
    : undefined
  if (devServer !== undefined) {
    ui = { kind: "dev", devServer }
  }

  return {
    ok: true,
    url: `${server.layoutUrl}?t=${token}`,
    port: started.port,
    connect: ({ manager, socketRouter }) => {
      readContextUsage = manager.readContextUsage
      readPlanUsage = manager.readPlanUsage
      refreshTasks = manager.refreshTasks
      readSessionDigest = manager.readSessionDigest
      attachSessionSocket({
        httpServer: server.httpServer,
        token,
        origin: new URL(server.layoutUrl).origin,
        onMessageFailure: (error) => reportSwallowedFailure(options, "socket-message", error),
        subscribe: (send) => {
          viewers.add(send)
          const unsubscribe = manager.subscribe(send)
          return () => {
            viewers.delete(send)
            unsubscribe()
          }
        },
        socketRouter,
        commandSession: manager.commandSession,
        yieldsUpgrade: (request) => devServer?.ownsUpgrade(request) ?? false,
      })
    },
  }
}

/**
 * ビューサーバ・`/ws` が握りつぶしていた失敗を診断ログへ書く。
 */
function reportSwallowedFailure(
  options: ViewDeliveryOptions,
  place: "socket-message" | "http-server-error",
  error: unknown,
): void {
  options.diagnosticLog.append([
    swallowedFailureFootprint(options.now(), { feature: "view-server", place }, error),
  ])
}

/** 開いているタブに取り直しを押す。セッションの状態は動かないので、セッションの管理を通さない。 */
function pushRefresh(
  viewers: ReadonlySet<(frame: ServerFrame) => void>,
  target: RefreshTarget,
): void {
  for (const send of viewers) {
    send({ type: "refresh", target })
  }
}

function unavailableContextUsage(): Promise<ContextUsageReport> {
  return Promise.resolve(UNAVAILABLE_CONTEXT_USAGE)
}

function unavailablePlanUsage(): Promise<PlanUsageReport> {
  return Promise.resolve(UNAVAILABLE_PLAN_USAGE)
}

function noTasksToRefresh(): Promise<void> {
  return Promise.resolve()
}

function unavailableSessionDigest(): Promise<SessionDigest> {
  return Promise.resolve(UNAVAILABLE_SESSION_DIGEST)
}
