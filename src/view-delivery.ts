// ビューの配信。ブラウザ側の配り方（組み立て済みの対か、Vite の開発サーバか）と、開いているタブを持ち、
// `127.0.0.1` のサーバ・`/ws`・開発サーバを1つに束ねる。可変なのは「いまの配り方」
// 「開いているタブ」「コンテキストの内訳の読み口」の3つで、どれもこのファイルの外へ
// 出ない。
//
// ここは配線層（`src/` 直下。docs/design.md 2章「層と依存の向き」）。

import process from "node:process"

import { type CurrentCharacter } from "./current-character.ts"
import { createRpcRouter } from "./router.ts"
import {
  createAchievementCommitCache,
  readAchievement,
  readCommitCalendar,
} from "./server/achievement/adapter/main-history.ts"
import { todayLocalDateKey } from "./server/adapter/local-time.ts"
import { listDiaryDates, readDiaryDay } from "./server/diary/adapter/diary.ts"
import { listRepositoryFiles } from "./server/repository/adapter/repository-file.ts"
import { type PromptImageShelf } from "./server/session-driver/core/prompt-image-shelf.ts"
import {
  summarizeRecentTokenUsage,
  type TokenUsageLog,
} from "./server/token-usage/core/token-usage.ts"
import { type UiBundle } from "./server/view-server/adapter/bundle.ts"
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
import { type StartedSession } from "./session-start.ts"
import { resolveAchievementDateKey } from "./shared/achievement.ts"
import { type ContextUsageReport, UNAVAILABLE_CONTEXT_USAGE } from "./shared/context-usage.ts"
import { type RefreshTarget, type ServerFrame } from "./shared/frame.ts"

export type ViewDeliveryOptions = {
  /** どのポートで試すか（決めるのは `src/server/view-server/core/port-resolution.ts`）。 */
  readonly portResolution: ResolvedViewPort
  /**
   * 起動のときに読んだブラウザ側の1組（`dist/browser/` に置いてあるもの）。開発サーバを
   * 起こしたときも、サーバ側のソースが変わったらこれへ戻る。
   */
  readonly bundle: UiBundle
  /** `/character/<pack>/<file>` に配る1件の出どころ。 */
  readonly character: CurrentCharacter
  /**
   * トークン消費の記録の読み口（手続き `tokenUsage.summary` が配る集計の出どころ。持ち主は `src/main.ts`）。
   * ここで読むのは要求が来たときだけで、配信を始める時点ではファイルに触らない。
   */
  readonly tokenUsageLog: TokenUsageLog
  /**
   * 依頼に添えた画像の原寸の棚（`/prompt-image/<id>` に配る原寸の出どころ。持ち主は
   * `src/main.ts`）。ここは引くだけで、置くのと捨てるのはセッションの側。
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
      /**
       * 実際に待ち受けているポート。セッションの印の目印がここから決まるので返す
       * （`src/server/session-driver/core/session-restore.ts` の `sessionTag`。docs/requirements.md 4.8「鍵」）。
       */
      readonly port: number
      /** 開いたタブとセッションを繋ぐ（`/ws` の受け口を足し、コマンドの手続きを載せる）。 */
      readonly connect: (session: StartedSession) => void
    }
  | { readonly ok: false; readonly reason: string }

/**
 * ビューを配り始める。セッションはまだ繋がない — 先に配れることを確かめてから起こすので、
 * ポートが取れずに終わるときに claude の子プロセスを残さない。
 */
export async function startViewDelivery(options: ViewDeliveryOptions): Promise<ViewDeliveryResult> {
  // 起動トークンはこのプロセスのメモリにだけ置く（ディスクに書かない。docs/design.md 9章）。
  // ビューサーバ（`/prompt-image`・`/rpc`）と WebSocket が同じ1つを見る。
  const token = createStartupToken()
  // 開発サーバを起こしたときと、そこから組み立て済みの対へ戻ったときに替わるので、
  // サーバには取り出し口だけを渡す。
  let ui: ViewUi = { kind: "bundle", bundle: options.bundle }
  // 開いているタブ。セッションのイベントとは別に押したいもの（いまは `refresh` だけ）が
  // あるので、購読をセッションに渡すついでにここでも持つ。
  const viewers = new Set<(frame: ServerFrame) => void>()
  // コンテキストの内訳の読み口。セッションは配り始めたあとに繋がるので、繋がるまでは
  // 「取れない」を返すものを置いておき、`connect` で本物に差し替える（`ui` と同じ持ち方）。
  let readContextUsage: () => Promise<ContextUsageReport> = () =>
    Promise.resolve(UNAVAILABLE_CONTEXT_USAGE)
  // 成果の画面（1日ぶん・暦）が今日以外の日の数を覚える入れ物。両方の口が同じ1つを見る
  // （`docs/requirements.md`「灯りの段階」）。
  const achievementCommitCache = createAchievementCommitCache()

  // 読み取りの手続き（`/rpc`）。口の中身を選んで渡すのはここ（配線）で、束ねるのは `src/router.ts`。
  const rpcRouter = createRpcRouter({
    listRepositoryFiles: () => listRepositoryFiles(process.cwd()),
    // 「今日」を決めるのは配線層（core は今日が何日かを知らない。OS のタイムゾーンに
    // 依るので、ローカル日付を作るのは `adapter/local-time.ts` の仕事）。
    readTokenUsageSummary: (days) =>
      summarizeRecentTokenUsage(options.tokenUsageLog, todayLocalDateKey(), days),
    readContextUsage: () => readContextUsage(),
    // 「今日」を決めるのは配線層（`readTokenUsageSummary` と同じ理由）。見る日の検証・今日への
    // 丸め込みも呼ぶたびにここで済ませ、`main-history.ts` には検証済みの日付キーだけを渡す。
    // 日記（`diary.ts`）はここで合わせる（`main-history.ts` は数だけを持ち、日記の置き場を
    // 知らない。`docs/requirements.md`「成果の振り返り」）。
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
    // 灯りの暦（直近5週ぶん）。「今日」を決めるのは配線層（`readAchievementDay` と同じ理由）。
    // 日記のある日の一覧もここで合わせる（`readAchievementDay` と同じ理由）。
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

  // ポートが塞がっているのは、既定を使っているときに限り「起動時の前提不足」として即時終了せず
  // ずらして再挑戦する（src/server/view-server/core/port-resolution.ts）。明示的に渡されたときは一度だけ
  // 試してそのまま失敗する。
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
        // 差分を当て続けると新しいブラウザ側が古いサーバと話すことになるので、起動のときの対へ
        // 戻してページごと読み込み直させる。上げ直すまでは保存しても何も当たらない。
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

/**
 * 開いているタブに取り直しを押す。セッションの状態は動かないので `session-manager` を
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
