// 起動の段取り。
// 前提を確かめる → 組み立てる → ビューとセッションを起こす → 終了を登録して開く、の順を並べるのがここの仕事。

import process from "node:process"

import type { Config } from "./server/core/config.ts"
import { assembleStartup, startViewAndSession } from "./wiring/startup-assembly.ts"
import { checkStartupPrerequisites } from "./wiring/startup-prerequisite.ts"
import { registerExitAndOpenView } from "./wiring/view-opening.ts"

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
  const checked = await checkStartupPrerequisites(config)
  if (checked.kind === "failed") {
    return 1
  }
  const { prerequisites } = checked

  const assembly = assembleStartup(config, launch.cwd, prerequisites)

  const started = await startViewAndSession(config, assembly, prerequisites, launch.devServer)
  if (started.kind === "failed") {
    process.stderr.write(`tsukumo: ビューを配れない: ${started.reason}\n`)
    return 1
  }

  await registerExitAndOpenView({
    config,
    cwd: launch.cwd,
    devServer: launch.devServer,
    assembly,
    started,
  })
  return 0
}
