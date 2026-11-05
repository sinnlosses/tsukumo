// 終了のハンドラの登録と、知らせてタブを開くところ。
// 並べ方（登録してから開く）は `openViewAfterRegisteringExit` が約束する。

import process from "node:process"
import { setTimeout as delay } from "node:timers/promises"

import { todayLocalDateKey } from "../server/adapter/local-time.ts"
import type { Config } from "../server/core/config.ts"
import type { Host, HostResult } from "../server/host/core/host.ts"
import { pruneInputLedgerFiles } from "../server/session-driver/adapter/input-ledger-file.ts"
import {
  defaultInstanceLocationDir,
  writeInstanceLocation,
} from "../server/view-server/adapter/instance-location-file.ts"
import type { SwallowedFailurePlace } from "../shared/diagnostic/swallowed-failure.ts"
import type { StartedSession } from "./session-start.ts"
import type { StartupAssembly } from "./startup-assembly.ts"
import { openViewAfterRegisteringExit } from "./startup-order.ts"
import type { WiringDriver } from "./wiring-context.ts"

/**
 * 終了のハンドラを登録してから、起動したことと URL を知らせ、所在を書き、設定どおりならタブを開く。
 * 古い日付のファイルは知らせたあとに1回だけ消す。
 */
export async function registerExitAndOpenView(options: {
  readonly config: Config
  readonly cwd: string
  readonly devServer: boolean
  readonly assembly: StartupAssembly
  readonly started: {
    readonly url: string
    readonly port: number
    readonly session: StartedSession
  }
}): Promise<void> {
  const { config, assembly } = options
  const { session, ...view } = options.started
  const { reportFailure, usageLogs } = assembly
  const clock = assembly.context.now
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
      announce(view.url, options.devServer)
      setImmediate(() => {
        usageLogs.pruneExpired(todayLocalDateKey(clock))
        pruneInputLedgerFiles(clock())
        assembly.pruneExpiredChatImages()
      })
      removeInstanceLocation = writeInstanceLocation({
        dir: defaultInstanceLocationDir(),
        location: {
          pid: process.pid,
          port: view.port,
          url: view.url,
          cwd: options.cwd,
          head: await assembly.headSha,
        },
        reportFailure: (error) => {
          reportFailure({ feature: "view-server", place: "instance-location-write" }, error)
        },
      })
      return config.openView
        ? await openLayoutView(assembly.host, assembly.context.driver, view.url)
        : { tracked: false as const }
    },
  })
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
  if (result.kind === "failed") {
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
