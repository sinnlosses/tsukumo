// 起動の段取り。
// 前提を確かめる → いま出すキャラクターを決める → ビューを配る → セッションを起こして繋ぐ → 知らせてタブを開く、の順を並べるのがここの仕事。
// それぞれの中身は `createCurrentCharacter` / `startViewDelivery` / `startSession` が持つ。
// 即時終了する前提不足は `run` の1つに集めてある（ポート・ブラウザ側の成果物・疑似セッションの3つ）。

import process from "node:process"

import { createCurrentCharacter } from "./current-character.ts"
import { type Config, VIEW_PORT_ENV_NAME } from "./server/core/config.ts"
import type { Host, HostResult } from "./server/host/core/host.ts"
import { createReportImageShelf } from "./server/report/core/report-image-shelf.ts"
import { readFakeSession } from "./server/session-driver/adapter/fake-driver.ts"
import { createPromptImageShelf } from "./server/session-driver/core/prompt-image-shelf.ts"
import { createTokenUsageLog } from "./server/token-usage/adapter/token-usage-log.ts"
import { builtUiDir, readUiBundle } from "./server/view-server/adapter/bundle.ts"
import {
  resolveViewPort,
  resolveViewPortFallbackBase,
} from "./server/view-server/core/port-resolution.ts"
import { startSession } from "./session-start.ts"
import { startViewDelivery } from "./view-delivery.ts"
import { createHost } from "./wiring/host.ts"

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
    process.stderr.write(`tsukumo: ${VIEW_PORT_ENV_NAME} がポート番号として読めない\n`)
    return 1
  }

  // ブラウザ側スクリプトと CSS は `pnpm run build` が置いたものを読むだけで、起動時には組み立てない。
  // 無ければページが動かないので、起動時の前提不足として即時終了する。
  // 理由に `pnpm run build` を添える（無いと、起動できない側は何を打てばよいか分からない）。
  const built = await readUiBundle(builtUiDir())
  if (!built.ok) {
    process.stderr.write(`tsukumo: ブラウザ側の成果物を読めない\n${built.reason}\n`)
    return 1
  }

  // 古い成果物を黙って配らない。
  // 古くても画面は動くので止めはせず、1行だけ知らせて先へ進む。
  if (built.outdated) {
    process.stderr.write(
      "tsukumo: ソース（src/browser/ src/shared/）のほうが成果物より新しい（pnpm run build まで古い画面が出る）\n",
    )
  }

  // fake driver を選んだときは疑似セッションが要る。無ければ起こす意味が無いので、起動時の
  // 前提不足として扱う。
  const fakeReading = config.driver === "fake" ? readFakeSession() : undefined
  if (fakeReading?.kind === "unreadable") {
    process.stderr.write(`tsukumo: fake driver の疑似セッションを読めない: ${fakeReading.reason}\n`)
    return 1
  }
  const fakeSession = fakeReading?.session

  const character = createCurrentCharacter(config, launch.cwd)

  // トークン消費の記録の口は1つをここで作ってセッションとビューの両側へ渡す。
  // 置き場（`~/.tsukumo/token-usage/`）を知っているところを増やさない。
  const tokenUsageLog = createTokenUsageLog()
  // 依頼に添えた画像の原寸の棚と、レポートの画像の棚も1つずつをここで作って両側へ渡す。
  // 両側が同じ棚を見ないと、置いた原寸をビューが引けない。
  const promptImageShelf = createPromptImageShelf()
  const reportImageShelf = createReportImageShelf()
  const host = createHost(config.host)

  const view = await startViewDelivery({
    portResolution,
    bundle: built.bundle,
    character,
    tokenUsageLog,
    promptImageShelf,
    reportImageShelf,
    devServer: launch.devServer,
    cwd: launch.cwd,
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
    fakeSession,
    tokenUsageLog,
    promptImageShelf,
    reportImageShelf,
    viewPort: view.port,
    cwd: launch.cwd,
    host,
  })
  view.connect(session)

  announce(view.url)

  const openedView = config.openView
    ? await openLayoutView(host, config.driver, view.url)
    : { tracked: false as const }

  stopSessionOnExit(session.manager.close, openedView)

  return 0
}

/** 起動時に開いた疑似セッションのビュー。これが無ければ終了時にビューを閉じない。 */
type OpenedFakeView =
  | { readonly tracked: false }
  | { readonly tracked: true; readonly close: () => Promise<HostResult> }

/**
 * プロセスが終わるときにセッションを閉じる。閉じないと claude の子プロセスが残るので、
 * 割り込み（Ctrl-C）と終了要求の両方で入力を閉じてから抜ける。
 * `openedView` を追跡しているとき（疑似セッションでビューを開いたとき）だけ、そのビューも閉じる。
 */
function stopSessionOnExit(closeSessions: () => void, openedView: OpenedFakeView): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void shutdown(closeSessions, openedView)
    })
  }
}

async function shutdown(closeSessions: () => void, openedView: OpenedFakeView): Promise<void> {
  closeSessions()
  if (openedView.tracked) {
    await openedView.close()
  }
  process.exit(0)
}

// 起動したことと URL は、ペインに残る唯一の出力。
// URL には起動トークンが付くので、タブを開き直すときはこの URL をそのまま使う。
function announce(url: string): void {
  process.stdout.write(`tsukumo: ビューを配信中\n  ${url}\n`)
}

/**
 * レイアウトページのビューを開く。失敗しても起動は続ける。
 * 疑似セッション（`driver === "fake"`）のときだけ閉じる手段を追跡して返す（終了時に閉じる対象はこれだけ）。
 */
async function openLayoutView(
  host: Host,
  driver: Config["driver"],
  url: string,
): Promise<OpenedFakeView> {
  const result = await host.showView(url)
  if (!result.ok) {
    process.stderr.write(`tsukumo: ビューのタブを開けなかった: ${result.reason}\n`)
    return { tracked: false }
  }
  return driver === "fake" ? { tracked: true, close: result.close } : { tracked: false }
}
