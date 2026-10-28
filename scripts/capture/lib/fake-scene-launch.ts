// 疑似セッションの場面名で tsukumo を起こし、配信 URL を得る。

import path from "node:path"

import { tsukumoHomeDir } from "../../../src/server/adapter/tsukumo-home.ts"
import { builtUiDir } from "../../../src/server/view-server/adapter/bundle.ts"
import { assertBuiltUiFresh } from "../../dev/lib/built-ui-freshness.ts"
import { spawnFakeTsukumo, waitForViewUrl } from "../../shared/fake-tsukumo-process.ts"
import { REPOSITORY_ROOT } from "../../shared/repository-root.ts"

/** 起こした tsukumo が配信 URL を出すまで待つ上限（ミリ秒）。ブラウザ側の組み立てを含む。 */
const LAUNCH_TIMEOUT_MS = 30_000

export type LaunchedScene = { readonly url: string; readonly close: () => void }

/** 成果物が古い・読めないときも、子を起こさずに理由つきで reject する。起こせなければ起こした子は止める。 */
export async function launchFakeScene(options: {
  readonly cwd: string
  readonly scene: string
  readonly home: string | undefined
  /** 疑似セッションのファイル。undefined なら同梱のファイル。 */
  readonly session: string | undefined
  readonly extraEnv: Readonly<Record<string, string>>
  /** 組み立て済みのブラウザ側の置き場。undefined なら `dist/browser/`。 */
  readonly builtDir: string | undefined
}): Promise<LaunchedScene> {
  await assertBuiltUiFresh(options.builtDir ?? builtUiDir())
  const home = options.home ?? tsukumoHomeDir()
  const child = spawnFakeTsukumo({
    entry: path.join(REPOSITORY_ROOT, "src", "cli.ts"),
    cwd: options.cwd,
    scene: options.scene,
    port: 0,
    home,
    session: options.session,
    extraEnv: options.extraEnv,
    dropInheritedTsukumoEnv: false,
    stderr: "inherit",
    detached: false,
  })
  try {
    const url = await waitForViewUrl(child, home, LAUNCH_TIMEOUT_MS)
    // 起こしたのはこの pid だけ。広いパターンで落とさない（開発中の tsukumo を巻き込むため）。
    return { url, close: () => child.kill("SIGTERM") }
  } catch (error) {
    child.kill("SIGTERM")
    throw error
  }
}
