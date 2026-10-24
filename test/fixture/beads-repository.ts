// テストの中で使い捨ての Beads（`bd`）のデータベースを作って操作する。中身は架空の課題だけにする。
//
// `bd init` は利用者の `~/.config/bd/config.yaml` を書き換え、新しい設定では使用状況を外へ送る。
// そうさせないよう、`HOME` を一時ディレクトリへ向け、送信を止めた設定を先に置いてから起こす。
// 読み手（`readBeadsIssues`）もこのプロセスの環境で `bd` を起こすので、呼ぶ側は `vi.stubEnv` で
// 同じ `HOME` を向けておく（`useBeadsHome`）。別のプロセスで読むときは、そのプロセスの `HOME` に
// `writeBeadsConfig` で同じ設定を置く。

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"

import { afterEach, beforeEach, inject, vi } from "vitest"

import { runSubprocessOrThrow } from "./subprocess.ts"

/** テストの中で課題を書き換える作業ツリーの名前（`bd` の actor）。 */
export const BEADS_TEST_ACTOR = "wt-test"

/** `bd init` を済ませた雛形のリポジトリと、そのとき使った `HOME`（`globalSetup` が実行ごとに1回作る）。 */
type BeadsTemplate = {
  readonly home: string
  readonly repository: string
}

/**
 * 各テストの前に `home` を `HOME` に向け、使用状況の送信を止めた `bd` の設定を置く。
 * {@link initBeads} は実行ごとに1回作った雛形の写しを配る。
 * 返す関数は、いま走っているテストの `HOME`。`home` は `useTempDir` の下のディレクトリを渡す。
 */
export function useBeadsHome(home: () => string): () => string {
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

/**
 * コミットが1つ以上ある git リポジトリ `cwd`（`main` を出している作業ツリー）に `.beads` を作る。
 * `--stealth` なので `.beads` はコミットされない。`bd init` 済みの雛形の写しを置く。 */
export function initBeads(cwd: string): void {
  placeBeads(inject("beadsTemplate").repository, cwd)
}

/**
 * {@link initBeads} と同じ使い方で、`issues`（`bd export` の1行の形）を `bd import` 1回で入れた `.beads` を置く。
 */
export async function initBeadsWithIssues(
  cwd: string,
  issues: readonly Readonly<Record<string, unknown>>[],
): Promise<void> {
  await placeImportedBeads(inject("beadsTemplate"), cwd, issues)
}

/**
 * {@link initBeadsWithIssues} と同じ使い方で、git リポジトリでないディレクトリ `cwd` に `.beads` を置く。
 */
export async function initBeadsWithIssuesOutsideGit(
  cwd: string,
  issues: readonly Readonly<Record<string, unknown>>[],
): Promise<void> {
  await placeImportedBeads(inject("beadsTemplate"), cwd, issues, { kind: "outside-git" })
}

/** 置き先が git リポジトリか。`outside-git` なら除外の行を写さない。 */
type BeadsPlace = { readonly kind: "git" } | { readonly kind: "outside-git" }

async function placeImportedBeads(
  template: BeadsTemplate,
  cwd: string,
  issues: readonly Readonly<Record<string, unknown>>[],
  place: BeadsPlace = { kind: "git" },
): Promise<void> {
  const staging = mkdtempSync(join(tmpdir(), "tsukumo-beads-staging-"))
  try {
    cpSync(template.repository, staging, { recursive: true })
    await runSubprocessOrThrow("bd", ["--actor", BEADS_TEST_ACTOR, "import", "-"], {
      cwd: staging,
      env: { ...process.env, HOME: template.home },
      input: issues.map((issue) => JSON.stringify(issue)).join("\n"),
    })
    placeBeads(staging, cwd, place)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

/** 使用状況の送信を止めた `bd` の設定を `home` に置く。 */
export function writeBeadsConfig(home: string): void {
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

/** `source` の `.beads` と、`bd init --stealth` が書いた除外の行を `cwd` へ写す。 */
function placeBeads(source: string, cwd: string, place: BeadsPlace = { kind: "git" }): void {
  const placing = join(cwd, ".beads-placing")
  cpSync(join(source, ".beads"), placing, { recursive: true })
  renameSync(placing, join(cwd, ".beads"))
  if (place.kind === "outside-git") {
    return
  }
  const stealthExclude = readFileSync(join(source, ".git", "info", "exclude"))
  writeFileSync(join(cwd, ".git", "info", "exclude"), stealthExclude)
}
