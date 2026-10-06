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

import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest"

import { git, initGitRepository } from "./git-repository.ts"
import { runSubprocessOrThrow } from "./subprocess.ts"

/** テストの中で課題を書き換える作業ツリーの名前（`bd` の actor）。 */
export const BEADS_TEST_ACTOR = "wt-test"

/** `bd init` は検証を並べて走らせた重い機械で1回あたり十数秒かかるので、全体の `hookTimeout` より長く待つ。 */
const BEADS_TEMPLATE_TIMEOUT_MS = 60_000

/** `bd init` を済ませた使い捨てのリポジトリと、そのとき使った `HOME`。 */
type BeadsTemplate = {
  readonly root: string
  readonly home: string
  readonly repository: string
}

/** {@link useBeadsHome} が作ったもの。 */
let beadsTemplate: BeadsTemplate | undefined

/** {@link processBeadsTemplate} が作ったもの。 */
let processTemplate: Promise<BeadsTemplate> | undefined

/**
 * 呼んだファイルで1回だけ `bd init` を済ませたリポジトリを作り、{@link initBeads} がその写しを配る。
 * 各テストの前に `home` を `HOME` に向け、使用状況の送信を止めた `bd` の設定を置く。
 * 返す関数は、いま走っているテストの `HOME`。`home` は `useTempDir` の下のディレクトリを渡す。
 */
export function useBeadsHome(home: () => string): () => string {
  beforeAll(async () => {
    beadsTemplate = await createBeadsTemplate()
  }, BEADS_TEMPLATE_TIMEOUT_MS)
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
  placeBeads(beadsTemplate.repository, cwd)
}

/**
 * {@link initBeads} と同じ使い方で、`issues`（`bd export` の1行の形）を `bd import` 1回で入れた `.beads` を置く。
 */
export async function initBeadsWithIssues(
  cwd: string,
  issues: readonly Readonly<Record<string, unknown>>[],
): Promise<void> {
  if (beadsTemplate === undefined) {
    throw new Error("initBeadsWithIssues は useBeadsHome を呼んだファイルの中でだけ使える")
  }
  await placeImportedBeads(beadsTemplate, cwd, issues)
}

/**
 * {@link initBeadsWithIssues} と同じ使い方で、git リポジトリでないディレクトリ `cwd` に `.beads` を置く。
 */
export async function initBeadsWithIssuesOutsideGit(
  cwd: string,
  issues: readonly Readonly<Record<string, unknown>>[],
): Promise<void> {
  if (beadsTemplate === undefined) {
    throw new Error(
      "initBeadsWithIssuesOutsideGit は useBeadsHome を呼んだファイルの中でだけ使える",
    )
  }
  await placeImportedBeads(beadsTemplate, cwd, issues, { kind: "outside-git" })
}

/**
 * git リポジトリ `cwd` に、`issues`（`bd export` の1行の形）を入れた `.beads` を置く。テストの外のフックを持たないので、
 * 別のプロセス（tsukumo）が見回っている場所へ置くときに使う。
 * 課題は写しの側で入れ終えてから1回の名前の付け替えで置くので、見回りが入れかけの `.beads` を読むことは無い。
 * `bd init` はプロセスで1回だけ済ませる（{@link processBeadsTemplate}）。
 */
export async function placeBeadsWithIssues(
  cwd: string,
  issues: readonly Readonly<Record<string, unknown>>[],
): Promise<void> {
  await placeImportedBeads(await processBeadsTemplate(), cwd, issues)
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

async function createBeadsTemplate(): Promise<BeadsTemplate> {
  const root = mkdtempSync(join(tmpdir(), "tsukumo-beads-template-"))
  const home = join(root, "home")
  const repository = join(root, "repository")
  writeBeadsConfig(home)
  await initGitRepository(repository)
  await git(repository, "commit", "--allow-empty", "-m", "init")
  await bd(repository, home, "init", "--stealth", "-p", "t", "-q")
  await bd(repository, home, "config", "set", "status.custom", "pending:frozen")
  return { root, home, repository }
}

/** プロセスで1回だけ作り、プロセスが終わるときに消す。 */
function processBeadsTemplate(): Promise<BeadsTemplate> {
  processTemplate ??= createBeadsTemplate().then((template) => {
    process.once("exit", () => {
      rmSync(template.root, { recursive: true, force: true })
    })
    return template
  })
  return processTemplate
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
