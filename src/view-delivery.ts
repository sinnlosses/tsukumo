// ビューの配信。
// ブラウザ側の配り方（組み立て済みの対か、Vite の開発サーバか）と、開いているタブを持ち、`127.0.0.1` のサーバ・`/ws`・開発サーバを1つに束ねる。
// 可変なのは「いまの配り方」「開いているタブ」「セッションが繋がるまで差し替えを待つ読み口」の3つで、どれもこのファイルの外へ出ない。

import process from "node:process"

import type { CurrentCharacter } from "./current-character.ts"
import { createRpcRouter } from "./router.ts"
import {
  createAchievementCommitCache,
  readAchievement,
  readCommitCalendar,
} from "./server/achievement/adapter/main-history.ts"
import { todayLocalDateKey } from "./server/adapter/local-time.ts"
import { listDiaryDates, readDiaryDay } from "./server/diary/adapter/diary.ts"
import { listRepositoryFiles } from "./server/repository/adapter/repository-file.ts"
import type { PromptImageShelf } from "./server/session-driver/core/prompt-image-shelf.ts"
import {
  summarizeRecentTokenUsage,
  type TokenUsageLog,
} from "./server/token-usage/core/token-usage.ts"
import type { UiBundle } from "./server/view-server/adapter/bundle.ts"
import {
  createStartupToken,
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
import { resolveAchievementDateKey } from "./shared/achievement/achievement.ts"
import {
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "./shared/context-usage/context-usage.ts"
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
  /**
   * トークン消費の記録の読み口（手続き `tokenUsage.summary` が配る集計の出どころ）。
   * ここで読むのは要求が来たときだけで、配信を始める時点ではファイルに触らない。
   */
  readonly tokenUsageLog: TokenUsageLog
  /**
   * 依頼に添えた画像の原寸の棚（`/prompt-image/<id>` に配る原寸の出どころ）。
   * ここは引くだけで、置くのと捨てるのはセッションの側。
   */
  readonly promptImageShelf: PromptImageShelf
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
  // セッションから引く読み口の3つ。
  // セッションは配り始めたあとに繋がるので、繋がるまでは「取れない」を返すものを置いておき、`connect` で本物に差し替える。
  let readContextUsage: () => Promise<ContextUsageReport> = () =>
    Promise.resolve(UNAVAILABLE_CONTEXT_USAGE)
  let readPlanUsage: () => Promise<PlanUsageReport> = () => Promise.resolve(UNAVAILABLE_PLAN_USAGE)
  let readSessionDigest: (sessionId: string) => Promise<SessionDigest> = () =>
    Promise.resolve(UNAVAILABLE_SESSION_DIGEST)
  // 成果の画面（1日ぶん・暦）が今日以外の日の数を覚える入れ物。両方の口が同じ1つを見る。
  const achievementCommitCache = createAchievementCommitCache()

  const rpcRouter = createRpcRouter({
    listRepositoryFiles: () => listRepositoryFiles(process.cwd()),
    // 「今日」はここで決めて渡す（OS のタイムゾーンに依るので、core は今日が何日かを知らない）。
    readTokenUsageSummary: (days) =>
      summarizeRecentTokenUsage(options.tokenUsageLog, todayLocalDateKey(), days),
    readContextUsage: () => readContextUsage(),
    readPlanUsage: () => readPlanUsage(),
    readSessionDigest: (sessionId) => readSessionDigest(sessionId),
    // 見る日の検証・今日への丸め込みも呼ぶたびにここで済ませ、`readAchievement` には検証済みの日付キーだけを渡す。
    // 日記はここで合わせる（`readAchievement` は数だけを持ち、日記の置き場を知らない）。
    readAchievementDay: async (selection) => {
      const today = todayLocalDateKey()
      const dateKey = resolveAchievementDateKey(selection, today)
      const [result, diary] = await Promise.all([
        readAchievement(process.cwd(), dateKey, today, achievementCommitCache),
        readDiaryDay(process.cwd(), dateKey),
      ])
      return result.kind === "ok" && result.achievement.kind === "known"
        ? { kind: "ok", achievement: { ...result.achievement, diary } }
        : result
    },
    // 灯りの暦（直近5週ぶん）。日記のある日の一覧もここで合わせる。
    readAchievementCalendar: async () => {
      const [result, diaryDates] = await Promise.all([
        readCommitCalendar(process.cwd(), todayLocalDateKey(), achievementCommitCache),
        listDiaryDates(process.cwd()),
      ])
      return result.kind === "ok" && result.calendar.kind === "known"
        ? { kind: "ok", calendar: { ...result.calendar, diaryDates } }
        : result
    },
  })

  const started = await startOnResolvedPort(options.portResolution, (port) =>
    startViewServer(port, {
      ui: () => ui,
      serveCharacterAsset: (location) => options.character.serveAsset(location),
      findPromptImage: (id) => options.promptImageShelf.find(id),
      rpcRouter,
      token,
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
      readSessionDigest = manager.readSessionDigest
      attachSessionSocket({
        httpServer: server.httpServer,
        token,
        origin: new URL(server.layoutUrl).origin,
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

/** 開いているタブに取り直しを押す。セッションの状態は動かないので、セッションの管理を通さない。 */
function pushRefresh(
  viewers: ReadonlySet<(frame: ServerFrame) => void>,
  target: RefreshTarget,
): void {
  for (const send of viewers) {
    send({ type: "refresh", target })
  }
}
