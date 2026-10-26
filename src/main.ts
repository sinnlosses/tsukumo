// 起動の段取り。
// 前提を確かめる → いま出すキャラクターを決める → ビューを配る → セッションを起こして繋ぐ → 知らせてタブを開く、の順を並べるのがここの仕事。
// それぞれの中身は `createCurrentCharacter` / `startViewDelivery` / `startSession` が持つ。
// 即時終了する前提不足は `run` の1つに集めてある（ポート・ブラウザ側の成果物・取り込んだプラグイン・疑似セッションの4つ）。

import process from "node:process"
import { setTimeout as delay } from "node:timers/promises"

import { createCurrentCharacter } from "./current-character.ts"
import { createAchievementCache } from "./server/achievement/adapter/closed-issue.ts"
import {
  createServerClock,
  millisecondsUntilNextLocalDay,
  todayLocalDateKey,
} from "./server/adapter/local-time.ts"
import { createChatArchive, pruneChatImages } from "./server/chat/adapter/chat-archive.ts"
import { type Config, type ConfigDriver, ENV_NAMES } from "./server/core/config.ts"
import type { Host, HostResult } from "./server/host/core/host.ts"
import { readItemAsset } from "./server/item/adapter/item-asset.ts"
import { createReportImageShelf } from "./server/report/core/report-image-shelf.ts"
import { createBeadsStampReader } from "./server/repository/adapter/beads.ts"
import { readHeadSha } from "./server/repository/adapter/change-count.ts"
import { readFakeSession } from "./server/session-driver/adapter/fake-session.ts"
import { pruneInputLedgerFiles } from "./server/session-driver/adapter/input-ledger-file.ts"
import {
  figurePluginDir,
  readFigurePluginMount,
  readWorkflowPlugin,
  readWorkflowPluginMount,
  workflowPluginDir,
} from "./server/session-driver/adapter/workflow-plugin.ts"
import { createPromptImageShelf } from "./server/session-driver/core/prompt-image-shelf.ts"
import { createOpenTaskReader, twClaimsRunner } from "./server/token-usage/adapter/tw-claim-list.ts"
import { builtUiDir, readUiBundle } from "./server/view-server/adapter/bundle.ts"
import {
  defaultInstanceLocationDir,
  writeInstanceLocation,
} from "./server/view-server/adapter/instance-location-file.ts"
import {
  resolveViewPort,
  resolveViewPortFallbackBase,
} from "./server/view-server/core/port-resolution.ts"
import { startSession } from "./session-start.ts"
import type { SwallowedFailurePlace } from "./shared/diagnostic/swallowed-failure.ts"
import { openViewAfterRegisteringExit, readStartupPrerequisites } from "./startup-order.ts"
import { startViewDelivery } from "./view-delivery.ts"
import { wireAchievement } from "./wiring/achievement.ts"
import { failureDiagnostic } from "./wiring/failure-diagnostic.ts"
import { createHost } from "./wiring/host.ts"
import { wireRepository } from "./wiring/repository.ts"
import { wireSessionClaim } from "./wiring/session-claim.ts"
import { wireTokenUsage } from "./wiring/token-usage.ts"
import { wireUsageLogs } from "./wiring/usage-log.ts"
import type { WiringContext, WiringDriver } from "./wiring/wiring-context.ts"
import { chooseTw, wireWorkflowSetting } from "./wiring/workflow-setting.ts"

/** 環境変数ではなく起動の引数で選ぶもの。 */
export type LaunchOptions = {
  /** Vite の開発サーバを差し込むか（`--dev`）。 */
  readonly devServer: boolean
  /** tsukumo を起こしたディレクトリ。 */
  readonly cwd: string
}

/**
 * 起動の段取りを順に進め、終了コードを返す。0 のときはビューサーバとセッションを残したまま
 * プロセスを生かし続けるので、呼び出し側は 0 以外のときだけ `process.exit` する。
 */
export async function run(config: Config, launch: LaunchOptions): Promise<number> {
  // 起動時に前提（ポート番号として読める）が満たされていないときだけ即時終了する。
  const portResolution = resolveViewPort(
    config.rawViewPort,
    resolveViewPortFallbackBase(config.rawViewPortFallbackBase),
  )
  if (portResolution.kind === "invalid") {
    process.stderr.write(`tsukumo: ${ENV_NAMES.viewPort.name} がポート番号として読めない\n`)
    return 1
  }

  // ブラウザ側スクリプトと CSS は `pnpm run build` が置いたものを読むだけで、起動時には組み立てない。
  // 無ければページが動かないので、起動時の前提不足として即時終了する。
  // 理由に `pnpm run build` を添える（無いと、起動できない側は何を打てばよいか分からない）。
  // fake driver はプラグインを載せないので見ない。
  const { built, workflowPlugin } = await readStartupPrerequisites({
    readBundle: () => readUiBundle(builtUiDir()),
    checkPlugin: () => {
      const { driver } = config
      switch (driver.kind) {
        case "fake":
          return Promise.resolve({
            ok: true,
            mount: true,
            mountFigure: false,
            notices: [],
          } as const)
        case "sdk":
          return checkWorkflowPlugin(config.claudeConfigDir)
        default:
          return driver satisfies never
      }
    },
  })
  if (!built.ok) {
    process.stderr.write(`tsukumo: ブラウザ側の成果物を読めない\n${built.reason}\n`)
    return 1
  }

  // 古い成果物を黙って配らない。
  // 古くても画面は動くので止めはせず、1行だけ知らせて先へ進む。
  if (built.outdated) {
    process.stderr.write(
      "tsukumo: ソース（src/browser/ src/shared/）が成果物を組み立てたときから変わっている（pnpm run build まで古い画面が出る）\n",
    )
  }

  // 取り込んだ tsukumo-plugins が空だとワークフローのスキルが載らないので、起動時の前提不足として止める。
  for (const notice of workflowPlugin.notices) {
    process.stderr.write(`${notice}\n`)
  }
  if (!workflowPlugin.ok) {
    return 1
  }
  const mountWorkflowPlugin = workflowPlugin.mount
  const mountFigurePlugin = workflowPlugin.mountFigure
  const workflowTw = chooseTw(config.twCommand, mountWorkflowPlugin)

  // fake driver を選んだときは疑似セッションが要る。無ければ起こす意味が無いので、起動時の
  // 前提不足として扱う。
  const wiringDriver = wiringDriverOf(config.driver)
  if (wiringDriver.kind === "unreadable") {
    process.stderr.write(
      `tsukumo: fake driver の疑似セッションを読めない: ${wiringDriver.reason}\n`,
    )
    return 1
  }
  const driver = wiringDriver.driver

  // 日付ごとの記録の口はここで1回だけ作ってセッションとビューの両側へ渡す。
  // 置き場（`~/.tsukumo/` の下）を知っているところを増やさない。
  const usageLogs = wireUsageLogs(
    { driver },
    {
      reportSchema: config.reportSchema,
      openTask: createOpenTaskReader(twClaimsRunner(workflowTw, launch.cwd)),
    },
  )
  const { diagnostic: diagnosticLog, tokenUsage: tokenUsageLog } = usageLogs
  const clock = createServerClock(config.fixedClock)
  const reportFailure = failureDiagnostic(diagnosticLog, clock)
  const pruneExpiredChatImages = (): void => {
    pruneChatImages(todayLocalDateKey(clock), (error) => {
      reportFailure({ feature: "chat", place: "archive-image-prune" }, error)
    })
  }
  repeatAtEachLocalDayStart(pruneExpiredChatImages, clock)

  const character = createCurrentCharacter(config, launch.cwd, (place, error) => {
    reportFailure({ feature: "chat", place }, error)
  })

  // 依頼に添えた画像の原寸の棚と、レポートの画像の棚も1つずつをここで作って両側へ渡す。
  // 両側が同じ棚を見ないと、置いた原寸をビューが引けない。
  const promptImageShelf = createPromptImageShelf()
  const reportImageShelf = createReportImageShelf()
  const host = createHost(config.host)
  // 成果の画面が Beads の読みを覚える入れ物も1つで、ビューとセッションの両側が同じものを見る。
  // 温めはセッション側が起こす（ビューが別の入れ物を持つと、温めた読みが画面に届かない）。
  // 印の読み手も1つで、成果のキャッシュとタスク一覧の見張りが同じものを使う（同時の読みは束ねられる）。
  const readBeadsStamp = createBeadsStampReader(launch.cwd)
  const achievementCache = createAchievementCache(launch.cwd, clock, readBeadsStamp)
  const workflowSetting = wireWorkflowSetting(launch.cwd, workflowTw)
  const context: WiringContext = {
    cwd: launch.cwd,
    now: clock,
    inheritedEnv: config.inheritedEnv,
    driver,
    chatArchive: createChatArchive(),
    throwawayQuery: usageLogs.throwawayQuery.record,
  }
  const achievement = wireAchievement(context, achievementCache)
  const repository = wireRepository(context, diagnosticLog, readBeadsStamp)
  const tokenUsage = wireTokenUsage(context, tokenUsageLog)
  const sessionClaim = wireSessionClaim()

  const headSha = readHeadSha(launch.cwd)

  const view = await startViewDelivery({
    portResolution,
    rpc: {
      ...repository.rpc,
      ...tokenUsage.rpc,
      ...sessionClaim.rpc,
      ...achievement.rpc,
      ...workflowSetting.rpc,
    },
    bundle: built.bundle,
    character,
    serveItemAsset: (fileName, version) => readItemAsset(fileName, version),
    promptImageShelf,
    reportImageShelf,
    diagnosticLog,
    now: clock,
    devServer: launch.devServer,
  })
  if (!view.ok) {
    process.stderr.write(`tsukumo: ビューを配れない: ${view.reason}\n`)
    return 1
  }

  // セッションの印の目印は、実際に待ち受けているポートから決まる（`sessionTag`）。
  // 同じディレクトリで2つめを起こすとポートがずれるので、目印も分かれる。
  // 設定のポートではなく `view.port` を渡すこと。
  const session = await startSession({
    config,
    character,
    context,
    achievement,
    repository,
    usageLogs,
    promptImageShelf,
    reportImageShelf,
    viewPort: view.port,
    host,
    mountWorkflowPlugin,
    mountFigurePlugin,
    workflowTw,
    workflowSetting: workflowSetting.commands,
  })
  view.connect(session)

  let removeInstanceLocation = keepInstanceLocation
  let openedView: OpenedFakeView = { tracked: false }

  openedView = await openViewAfterRegisteringExit({
    registerExit: () => {
      stopSessionOnExit(
        session.manager.close,
        session.closeLogs,
        () => {
          removeInstanceLocation()
        },
        () => openedView,
        reportFailure,
      )
    },
    openView: async () => {
      announce(view.url, launch.devServer)
      // 古い日付のファイルは起動のたびに1回だけ、知らせたあとに消す。
      setImmediate(() => {
        usageLogs.pruneExpired(todayLocalDateKey(clock))
        pruneInputLedgerFiles(clock())
        pruneExpiredChatImages()
      })
      removeInstanceLocation = writeInstanceLocation({
        dir: defaultInstanceLocationDir(),
        location: {
          pid: process.pid,
          port: view.port,
          url: view.url,
          cwd: launch.cwd,
          head: await headSha,
        },
        reportFailure: (error) => {
          reportFailure({ feature: "view-server", place: "instance-location-write" }, error)
        },
      })
      return config.openView
        ? await openLayoutView(host, driver, view.url)
        : { tracked: false as const }
    },
  })

  return 0
}

/** 所在をまだ書いていないあいだの、消す側の代わり。 */
function keepInstanceLocation(): void {}

/** 終了のとき、記録の口を閉じ終えるのを待つ上限。これを過ぎたら待たずに抜ける。 */
const CLOSE_LOGS_TIMEOUT_MS = 2_000

/** 起動時に開いた疑似セッションのビュー。これが無ければ終了時にビューを閉じない。 */
type OpenedFakeView =
  | { readonly tracked: false }
  | { readonly tracked: true; readonly close: () => Promise<HostResult> }

/**
 * 取り込んだ tsukumo-plugins が読めるかの検査と、セッションに載せるかの判定。
 * 読めないとき、と一部だけのときは、理由を stderr に1行出す（揃っていて載せないのは通常の状態なので黙る）。
 * 図のプラグインは任意で、取り込みに無いときは黙って載せず、利用者が入れているときだけ知らせる。
 */
async function checkWorkflowPlugin(claudeConfigDir: string | undefined): Promise<
  | {
      readonly ok: true
      readonly mount: boolean
      readonly mountFigure: boolean
      readonly notices: readonly string[]
    }
  | { readonly ok: false; readonly notices: readonly string[] }
> {
  const plugin = await readWorkflowPlugin(workflowPluginDir())
  if (!plugin.ok) {
    return { ok: false, notices: [`tsukumo: 取り込んだプラグインを読めない\n${plugin.reason}`] }
  }
  const mount = await readWorkflowPluginMount(workflowPluginDir(), claudeConfigDir)
  const figure = await readFigurePluginMount(figurePluginDir(), claudeConfigDir)
  const notices = [
    ...(mount.kind === "partial"
      ? [`tsukumo: plugin partly missing (${mount.missing.join(", ")}): using bundled one`]
      : []),
    ...(figure.kind === "user-installed"
      ? ["tsukumo: figure-capture is already installed: not mounting the bundled one"]
      : []),
  ]
  return {
    ok: true,
    mount: mount.kind !== "user-installed",
    mountFigure: figure.kind === "mount",
    notices,
  }
}

/**
 * プロセスが終わるときにセッションを閉じる。閉じないと claude の子プロセスが残るので、
 * 割り込み（Ctrl-C）・終了要求・端末を閉じたとき（SIGHUP）で所在のファイルを消し、入力を閉じてから抜ける。
 * `openedView()` が追跡しているとき（疑似セッションでビューを開いたとき）だけ、そのビューも閉じる。
 * 未処理の拒否は記録して続け、未処理の例外は記録してから同じ閉じ方で終わる。
 */
function stopSessionOnExit(
  closeSessions: () => void,
  closeLogs: () => Promise<void>,
  removeInstanceLocation: () => void,
  openedView: () => OpenedFakeView,
  reportFailure: (place: SwallowedFailurePlace, error: unknown) => void,
): void {
  // 閉じるのは最初の1回だけ。あとから来た終了要求は終了コードも含めて無視する。
  let stopping = false
  const shutdown = async (exitCode: number): Promise<void> => {
    if (stopping) {
      return
    }
    stopping = true
    try {
      removeInstanceLocation()
      closeSessions()
      await Promise.race([closeLogs(), delay(CLOSE_LOGS_TIMEOUT_MS)])
      const view = openedView()
      if (view.tracked) {
        await view.close()
      }
    } finally {
      process.exit(exitCode)
    }
  }
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      void shutdown(0)
    })
  }
  process.on("unhandledRejection", (reason) => {
    reportFailure({ feature: "process", place: "unhandled-rejection" }, reason)
  })
  process.on("uncaughtException", (error) => {
    reportFailure({ feature: "process", place: "uncaught-exception" }, error)
    void shutdown(1)
  })
}

/**
 * 次のローカルの日の始まりごとに `task` を呼ぶ。タイマーはプロセスを生かし続けない。
 * 境目の直前に起きて同じ日のまま呼ばないよう、少し遅らせて起きる。
 * 起きても `now` が進んでいない（凍らせた時計）なら次を仕掛けない。境目の直前で凍っていると短い間隔で回り続けるため。
 */
function repeatAtEachLocalDayStart(task: () => void, now: () => number): void {
  const armedAt = now()
  const timer = setTimeout(
    () => {
      task()
      if (now() !== armedAt) {
        repeatAtEachLocalDayStart(task, now)
      }
    },
    millisecondsUntilNextLocalDay(now) + DAY_START_MARGIN_MS,
  )
  timer.unref()
}

/** 日の境目から起きるまでの遅れ。 */
const DAY_START_MARGIN_MS = 1_000

// 起動したことと URL は、ペインに残る唯一の出力。
// URL には起動トークンが付くので、タブを開き直すときはこの URL をそのまま使う。
function announce(url: string, devServer: boolean): void {
  const devNote = devServer ? "  dev server: edits under src/browser/ apply live\n" : ""
  process.stdout.write(`tsukumo is running\n  ${url}\n${devNote}`)
}

/**
 * レイアウトページのビューを開く。失敗しても起動は続ける。
 * 疑似セッション（`driver.kind` が `fake`）のときだけ閉じる手段を追跡して返す（終了時に閉じる対象はこれだけ）。
 */
async function openLayoutView(
  host: Host,
  driver: WiringDriver,
  url: string,
): Promise<OpenedFakeView> {
  const result = await host.showView(url)
  if (!result.ok) {
    process.stderr.write(`tsukumo: ビューのタブを開けなかった: ${result.reason}\n`)
    return { tracked: false }
  }
  switch (driver.kind) {
    case "fake":
      return { tracked: true, close: result.close }
    case "sdk":
      return { tracked: false }
    default:
      return driver satisfies never
  }
}

function wiringDriverOf(
  driver: ConfigDriver,
):
  | { readonly kind: "ok"; readonly driver: WiringDriver }
  | { readonly kind: "unreadable"; readonly reason: string } {
  switch (driver.kind) {
    case "sdk":
      return { kind: "ok", driver }
    case "fake": {
      const reading = readFakeSession(driver.sessionPath)
      if (reading.kind === "unreadable") {
        return reading
      }
      return {
        kind: "ok",
        driver: {
          kind: "fake",
          session: reading.session,
          scene: driver.scene,
          sceneUntil: driver.sceneUntil,
        },
      }
    }
    default:
      return driver satisfies never
  }
}
