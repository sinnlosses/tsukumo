// 疑似セッションの場面名で tsukumo を起こし、配信 URL を得る。

import path from "node:path"

import { spawnFakeTsukumo, waitForViewUrl } from "../../shared/fake-tsukumo-process.ts"
import { REPOSITORY_ROOT } from "../../shared/repository-root.ts"

/** 起こした tsukumo が配信 URL を出すまで待つ上限（ミリ秒）。ブラウザ側の組み立てを含む。 */
const LAUNCH_TIMEOUT_MS = 30_000

export type LaunchedScene = { readonly url: string; readonly close: () => void }

/** 起こせなければ理由つきで reject する（起こした子は止める）。 */
export async function launchFakeScene(options: {
  readonly cwd: string
  readonly scene: string
  readonly home: string | undefined
  readonly extraEnv: Readonly<Record<string, string>>
}): Promise<LaunchedScene> {
  const child = spawnFakeTsukumo({
    entry: path.join(REPOSITORY_ROOT, "src", "cli.ts"),
    cwd: options.cwd,
    scene: options.scene,
    port: 0,
    home: options.home,
    extraEnv: options.extraEnv,
    dropInheritedTsukumoEnv: false,
    stderr: "inherit",
  })
  try {
    const url = await waitForViewUrl(child, LAUNCH_TIMEOUT_MS)
    // 起こしたのはこの pid だけ。広いパターンで落とさない（開発中の tsukumo を巻き込むため）。
    return { url, close: () => child.kill("SIGTERM") }
  } catch (error) {
    child.kill("SIGTERM")
    throw error
  }
}
