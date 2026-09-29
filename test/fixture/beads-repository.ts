// テストの中で使い捨ての Beads（`bd`）のデータベースを作って操作する。中身は架空の課題だけにする。
//
// `bd init` は利用者の `~/.config/bd/config.yaml` を書き換え、新しい設定では使用状況を外へ送る。
// そうさせないよう、`HOME` を一時ディレクトリへ向け、送信を止めた設定を先に置いてから起こす。
// 読み手（`readBeadsIssues`）もこのプロセスの環境で `bd` を起こすので、呼ぶ側は `vi.stubEnv` で
// 同じ `HOME` を向けておく（`useBeadsHome`）。

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest"

import { git, initGitRepository } from "./git-repository.ts"
import { runSubprocessOrThrow } from "./subprocess.ts"

/** テストの中で課題を書き換える作業ツリーの名前（`bd` の actor）。 */
export const BEADS_TEST_ACTOR = "wt-test"

/** `bd init` を済ませた使い捨てのリポジトリ（{@link useBeadsHome} が作る）。 */
let beadsTemplate: { readonly root: string; readonly repository: string } | undefined

/**
 * 呼んだファイルで1回だけ `bd init` を済ませたリポジトリを作り、{@link initBeads} がその写しを配る。
 * 各テストの前に `home` を `HOME` に向け、使用状況の送信を止めた `bd` の設定を置く。
 * 返す関数は、いま走っているテストの `HOME`。`home` は `useTempDir` の下のディレクトリを渡す。
 */
export function useBeadsHome(home: () => string): () => string {
  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), "tsukumo-beads-template-"))
    const templateHome = join(root, "home")
    const repository = join(root, "repository")
    writeBeadsConfig(templateHome)
    await initGitRepository(repository)
    await git(repository, "commit", "--allow-empty", "-m", "init")
    await bd(repository, templateHome, "init", "--stealth", "-p", "t", "-q")
    await bd(repository, templateHome, "config", "set", "status.custom", "pending:frozen")
    beadsTemplate = { root, repository }
  })
  afterAll(() => {
    if (beadsTemplate !== undefined) {
      rmSync(beadsTemplate.root, { recursive: true, force: true })
    }
    beadsTemplate = undefined
  })
  beforeEach(() => {
    const dir = home()
    writeBeadsConfig(dir)
    vi.stubEnv("HOME", dir)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  return home
}

/** コミットが1つ以上ある git リポジトリ `cwd`（`main` を出している作業ツリー）に `.beads` を作る。
 * `--stealth` なので `.beads` はコミットされない。`bd init` 済みの写しを置くので、
 * {@link useBeadsHome} を呼んだファイルの中でだけ使える。 */
export function initBeads(cwd: string): void {
  if (beadsTemplate === undefined) {
    throw new Error("initBeads は useBeadsHome を呼んだファイルの中でだけ使える")
  }
  cpSync(join(beadsTemplate.repository, ".beads"), join(cwd, ".beads"), { recursive: true })
  const exclude = join(cwd, ".git", "info", "exclude")
  const stealthExclude = readFileSync(join(beadsTemplate.repository, ".git", "info", "exclude"))
  writeFileSync(exclude, stealthExclude)
}

function writeBeadsConfig(home: string): void {
  mkdirSync(join(home, ".config", "bd"), { recursive: true })
  writeFileSync(join(home, ".config", "bd", "config.yaml"), "metrics:\n    disabled: true\n")
}

/** `bd` を1回起こす（actor は {@link BEADS_TEST_ACTOR}）。 */
export async function bd(cwd: string, home: string, ...args: readonly string[]): Promise<string> {
  return runSubprocessOrThrow("bd", ["--actor", BEADS_TEST_ACTOR, ...args], {
    cwd,
    env: { ...process.env, HOME: home },
  })
}
