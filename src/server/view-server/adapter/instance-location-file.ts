// 動いている tsukumo が自分の所在を `$TSUKUMO_HOME/instance-location/<pid>.json` に書き置く。
// 手元の道具はこのファイルを読んで、ポートの走査や stdout の拾い読みなしに tsukumo を見つける。
// URL には起動トークンが付くので、利用者だけが読める権限で書く。

import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"

import { writeFileAtomic } from "../../adapter/lib/atomic-file.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"

/** ホームの下の所在のファイルの置き場の名前。占有ファイル（`session-claim`）とは別。 */
export const INSTANCE_LOCATION_DIR_NAME = "instance-location"

/** 所在のファイルの権限（利用者だけが読み書きできる）。 */
const INSTANCE_LOCATION_FILE_MODE = 0o600

/** 動いている tsukumo の所在。 */
export type InstanceLocation = {
  readonly pid: number
  readonly port: number
  readonly url: string
  readonly cwd: string
}

/** 所在のファイルの置き場（ホームの下）。 */
export function defaultInstanceLocationDir(): string {
  return join(tsukumoHomeDir(), INSTANCE_LOCATION_DIR_NAME)
}

/**
 * 所在のファイルを書く。書けなかった失敗は投げずに `reportFailure` へ渡す。
 * 返す関数が、書いたファイルを消す（プロセスを閉じるとき）。
 */
export function writeInstanceLocation(options: {
  readonly dir: string
  readonly location: InstanceLocation
  readonly reportFailure: (error: unknown) => void
}): () => void {
  const path = join(options.dir, `${String(options.location.pid)}.json`)
  try {
    mkdirSync(options.dir, { recursive: true })
    writeFileAtomic(path, JSON.stringify(options.location), INSTANCE_LOCATION_FILE_MODE)
  } catch (error) {
    options.reportFailure(error)
  }
  return () => {
    try {
      rmSync(path, { force: true })
    } catch (error) {
      options.reportFailure(error)
    }
  }
}
