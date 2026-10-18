// E2E が起こす tsukumo の子プロセスと、その一時のディレクトリ。

import type { ChildProcess } from "node:child_process"
import { mkdtempSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { spawnFakeTsukumo } from "../../scripts/shared/fake-tsukumo-process.ts"
import { REPOSITORY_ROOT } from "./artifact.ts"
import { FIXED_INSTANT, TIME_ZONE } from "./fixed-clock.ts"

export type TempDirectory = {
  /** `realpath` を通したパス（macOS では `/private/var/...`）。子プロセスにはこちらを渡す。 */
  readonly real: string
  /** `mkdtemp` が返したままのパス（`/var/...`）。成果物に出たときに両方を置き換える。 */
  readonly given: string
}

export function makeTempDirectory(prefix: string): TempDirectory {
  const given = mkdtempSync(path.join(tmpdir(), prefix))
  return { given, real: realpathSync(given) }
}

/**
 * fake driver で tsukumo を1つ起こす。親の `TSUKUMO_` で始まる変数は外してから渡す
 * （手元で立てている値で結果が変わらないように）。キャラクターは指定せず、空のホームで同梱の
 * 既定を使う。`HOME` も一時のディレクトリへ向ける（`bd` が利用者の設定を読まないように）。
 */
export function spawnTsukumo(
  scene: string,
  home: string,
  userHome: string,
  cwd: string,
): ChildProcess {
  return spawnFakeTsukumo({
    entry: path.join(REPOSITORY_ROOT, "src", "cli.ts"),
    cwd,
    scene: scene === "none" ? undefined : scene,
    port: 0,
    home,
    extraEnv: { TSUKUMO_FIXED_CLOCK: FIXED_INSTANT, TZ: TIME_ZONE, HOME: userHome },
    dropInheritedTsukumoEnv: true,
    stderr: "pipe",
  })
}

/** 起こした pid だけに `SIGTERM` を送り、終わるのを待つ（広いパターンで止めない）。 */
export function stopTsukumo(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    child.once("exit", () => {
      resolve()
    })
    child.kill("SIGTERM")
  })
}
