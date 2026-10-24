// E2E が起こす tsukumo の子プロセスと、その一時のディレクトリ。

import type { ChildProcess } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs"
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

export type CwdFile = {
  readonly path: string
  readonly content: Buffer | string
}

/** cwd からの相対パスで、親のディレクトリごとファイルを書く。 */
export function writeCwdFiles(cwd: string, files: readonly CwdFile[]): void {
  for (const file of files) {
    const target = path.join(cwd, file.path)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, file.content)
  }
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
    session: undefined,
    port: 0,
    home,
    extraEnv: { TSUKUMO_FIXED_CLOCK: FIXED_INSTANT, TZ: TIME_ZONE, HOME: userHome },
    dropInheritedTsukumoEnv: true,
    stderr: "pipe",
    detached: true,
  })
}

const GROUP_GONE_TIMEOUT_MS = 10_000
const GROUP_POLL_INTERVAL_MS = 25

function groupExists(pgid: number): boolean {
  try {
    process.kill(-pgid, 0)
    return true
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH")
  }
}

/**
 * 起こしたプロセスグループだけに `SIGTERM` を送り、子と孫（`tw` の python3 など）が消えるのを待つ
 * （広いパターンで止めない）。上限を過ぎても孫が残れば reject する。
 */
export async function stopTsukumo(child: ChildProcess): Promise<void> {
  const pgid = child.pid
  if (pgid === undefined) {
    return
  }
  if (!groupExists(pgid)) {
    return
  }
  try {
    process.kill(-pgid, "SIGTERM")
  } catch {
    return
  }
  for (let waited = 0; groupExists(pgid); waited += GROUP_POLL_INTERVAL_MS) {
    if (waited >= GROUP_GONE_TIMEOUT_MS) {
      throw new Error(`tsukumo のプロセスグループ ${String(pgid)} に孫が残っている`)
    }
    await new Promise((resolve) => setTimeout(resolve, GROUP_POLL_INTERVAL_MS))
  }
}
