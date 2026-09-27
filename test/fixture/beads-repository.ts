// テストの中で使い捨ての Beads（`bd`）のデータベースを作って操作する。中身は架空の課題だけにする。
//
// `bd init` は利用者の `~/.config/bd/config.yaml` を書き換え、新しい設定では使用状況を外へ送る。
// そうさせないよう、`HOME` を一時ディレクトリへ向け、送信を止めた設定を先に置いてから起こす。
// 読み手（`readBeadsIssues`）もこのプロセスの環境で `bd` を起こすので、呼ぶ側は `vi.stubEnv` で
// 同じ `HOME` を向けておく（`useBeadsHome`）。

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, beforeEach, vi } from "vitest"

import { runSubprocessOrThrow } from "./subprocess.ts"

/** テストの中で課題を書き換える作業ツリーの名前（`bd` の actor）。 */
export const BEADS_TEST_ACTOR = "wt-test"

/**
 * 各テストの前に `home` を `HOME` に向け、使用状況の送信を止めた `bd` の設定を置く。
 * 返す関数は、いま走っているテストの `HOME`。`home` は `useTempDir` の下のディレクトリを渡す。
 */
export function useBeadsHome(home: () => string): () => string {
  beforeEach(() => {
    const dir = home()
    mkdirSync(join(dir, ".config", "bd"), { recursive: true })
    writeFileSync(join(dir, ".config", "bd", "config.yaml"), "metrics:\n    disabled: true\n")
    vi.stubEnv("HOME", dir)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  return home
}

/** コミットが1つ以上ある git リポジトリ `cwd`（`main` を出している作業ツリー）に `.beads` を作る。
 * `--stealth` なので `.beads` はコミットされない。 */
export async function initBeads(cwd: string, home: string): Promise<void> {
  await bd(cwd, home, "init", "--stealth", "-p", "t", "-q")
  await bd(cwd, home, "config", "set", "status.custom", "pending:frozen")
}

/** `bd` を1回起こす（actor は {@link BEADS_TEST_ACTOR}）。 */
export async function bd(cwd: string, home: string, ...args: readonly string[]): Promise<string> {
  return runSubprocessOrThrow("bd", ["--actor", BEADS_TEST_ACTOR, ...args], {
    cwd,
    env: { ...process.env, HOME: home },
  })
}
