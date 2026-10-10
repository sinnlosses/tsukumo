// 変更前の画面を、作業ツリーを1つも動かさずに起こす道具。名指ししたコミットを /tmp へ取り出し、
// そこで組み立てて、空けたポートと一時ホームで tsukumo を1つ起こして URL を出す。撮る作業は
// 別の道具の仕事で、こちらは「変更前をどこかに用意する」ところだけを持つ。
//
// 作業ツリーと `dist/browser/` に触らないことが、この道具の存在理由。 `git stash`・
// `git checkout` で手元を巻き戻す方法は、戻し忘れると書きかけの変更を失うか、`dist/browser/` が
// 変更前のまま残る（`docs/architecture/testing.md`「変更前と撮り比べる」）。ここでは取り出しに一時 index を
// 使うので、本物の index も作業ツリーも読むだけで済む。
//
// 使い方:
//   node scripts/serve-revision.ts HEAD~1                      # 1つ前のコミットを起こす
//   node scripts/serve-revision.ts HEAD~1 --port 7336 --scene notation-figure
//   node scripts/stop.ts --port 7338                           # 止める（必ず打つ）
//
// 起こしたものは自分では止まらない。撮り終えたら `node scripts/stop.ts --port` で止める
// （`pkill` / `killall` は広く狙う形を拒否する hook に止められる）。この道具は子が死ぬと一緒に
// 終わるので、止めるのは `node scripts/stop.ts` の1回で足りる。
//
// 駆動は fake 固定（`TSUKUMO_DRIVER=fake`）。変更前を見るために本物の claude を /tmp の複製で
// 起こす理由が無く、API も使わない。ホームも /tmp に切るので、利用者の `~/.tsukumo/`
// （覚えたキャラクター・雑談の要約）は読み書きしない。
//
// `node_modules` はいま居る作業ツリーのものを symlink で貸す（取り出したツリーで
// `pnpm install` はしない）。撮り比べる2点は普通ひと続きのコミットで、依存は同じ。
// `package.json` をまたいで比べるときだけこの前提が崩れるので、そのときは取り出し先で
// `pnpm install` を手で打つ。
//
// `.git` も同じく symlink で貸す。無いと `bd where` が Beads を見つけられず、成果の画面が「不明」になる
// （`readBeadsWorkspace`）。取り出し先で打つ `git` は読み取り専用だけ（`lendGitDirectory` の
// コメント）なので、貸した `.git` を書き換える心配はない。

import { type ChildProcess, execFileSync } from "node:child_process"
import { existsSync, mkdirSync, symlinkSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { spawnFakeTsukumo, waitForViewUrl } from "./lib/fake-tsukumo-process.ts"

/**
 * 取り出し先の親（リポジトリの外）。コミットごとに下に掘るので、同じコミットを何度起こしても
 * 積み上がらない。撮った画像と同じく、リポジトリには何も置かない。
 */
const SCRATCH_ROOT = "/tmp/tsukumo-revision"

/**
 * 既定のポート。部屋の名前が色名になる範囲（`roomName`）の末尾で、利用者の tsukumo
 * （7327〜7330 あたり）から離れている。かつ `node scripts/stop.ts` を
 * 引数なしで打ったときに一覧する範囲（既定ポートから `VIEW_PORT_FALLBACK_ATTEMPTS` 個ぶん）の
 * 中に収める — 止め忘れたときに一覧から見つかるようにする。
 */
const DEFAULT_PORT = 7338

/** 起こした tsukumo が URL を出すまで待つ上限（ミリ秒）。 */
const LAUNCH_TIMEOUT_MS = 30_000

const USAGE = `使い方: node scripts/serve-revision.ts <コミット> [オプション]

  --port <n>      待ち受けるポート（既定 ${String(DEFAULT_PORT)}。明示指定なのでずらさない）
  --scene <name>  起こした直後に流す疑似セッションの場面（既定は流さない）

  例: node scripts/serve-revision.ts HEAD~1 --scene notation-figure
      撮り終えたら node scripts/stop.ts --port ${String(DEFAULT_PORT)}
`

type Options = {
  readonly commit: string
  readonly port: number
  readonly scene: string | undefined
}

/** 取り出したコミットの置き場。ツリーとホームを分けて持つ。 */
type Revision = {
  readonly sha: string
  readonly treeDir: string
  readonly homeDir: string
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv)
  if (options === undefined) {
    process.stderr.write(USAGE)
    return 2
  }

  const revision = extractRevision(options.commit)
  if (revision === undefined) {
    process.stderr.write(`コミットを取り出せない: ${options.commit}\n`)
    return 1
  }
  process.stdout.write(`取り出した: ${revision.sha} → ${revision.treeDir}\n`)

  if (!buildUi(revision)) {
    return 1
  }

  const session = spawnFakeTsukumo({
    entry: path.join(revision.treeDir, "src", "cli.ts"),
    cwd: revision.treeDir,
    scene: options.scene,
    port: options.port,
    home: revision.homeDir,
    extraEnv: {},
    dropInheritedTsukumoEnv: false,
    stderr: "inherit",
  })
  let url: string
  try {
    url = await waitForViewUrl(session, LAUNCH_TIMEOUT_MS)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    session.kill("SIGTERM")
    return 1
  }

  process.stdout.write(
    `${revision.sha} を配信中\n  ${url}\n` +
      `止める: node scripts/stop.ts --port ${String(options.port)}\n`,
  )
  return waitForExit(session)
}

/**
 * 名指しのコミットを /tmp のツリーへ取り出す。一時 index（`GIT_INDEX_FILE`）を使うので、
 * 本物の index も作業ツリーも書き換わらない — `git checkout` や `git stash` で手元を巻き戻す
 * 方法との違いはここ1点。解決できないコミットのときは undefined。
 */
function extractRevision(commit: string): Revision | undefined {
  const sha = git(["rev-parse", "--short", commit])?.trim()
  if (sha === undefined || sha === "") {
    return undefined
  }

  const treeName = path.basename(repositoryRoot())
  const scratchDir = path.join(SCRATCH_ROOT, sha, treeName)
  const treeDir = path.join(scratchDir, treeName)
  const homeDir = path.join(scratchDir, "home")
  mkdirSync(treeDir, { recursive: true })
  mkdirSync(homeDir, { recursive: true })

  const indexFile = path.join(scratchDir, "index")
  if (
    git(["read-tree", sha], indexFile) === undefined ||
    git(["--work-tree", treeDir, "checkout-index", "-a", "-f"], indexFile) === undefined
  ) {
    return undefined
  }

  lendNodeModules(treeDir)
  lendGitDirectory(treeDir)
  return { sha, treeDir, homeDir }
}

/**
 * いま居る作業ツリーの `node_modules` を symlink で貸す。すでに貸してあれば何もしない
 * （同じコミットを起こし直すたびに張り直さない）。
 */
function lendNodeModules(treeDir: string): void {
  const link = path.join(treeDir, "node_modules")
  if (existsSync(link)) {
    return
  }
  symlinkSync(path.join(repositoryRoot(), "node_modules"), link, "dir")
}

/**
 * いま居る作業ツリーの `.git` を symlink で貸す。
 * linked worktree には `.beads` が無く、`bd where` は git を辿って本体の作業ツリーの `.beads` を見つけるので、成果の画面（`readBeadsWorkspace`）にこれが要る
 * （無いと `{ kind: "unknown" }` になる）。日記の置き場も共有の `.git` で決まる。
 *
 * `.git` は本体の作業ツリーそのままの形（ディレクトリでも、linked worktree の gitdir
 * ポインタのファイルでも）を symlink で指すだけ——書き換えない。取り出し先で打つ `git` は
 * `runGit` 経由のものだけで、そこはすべて読み取り専用
 * （`rev-parse` / `log` / `ls-tree` / `rev-list` / `cat-file` / `ls-files`）なので、本物の
 * index・ref・working tree の状態を書き換える呼び出しはここを通らない。
 * すでに貸してあれば何もしない（`lendNodeModules` と同じ）。
 */
function lendGitDirectory(treeDir: string): void {
  const link = path.join(treeDir, ".git")
  if (existsSync(link)) {
    return
  }
  symlinkSync(path.join(repositoryRoot(), ".git"), link)
}

/**
 * 取り出したツリーの中でブラウザ側を組み立てる。成果物はそのツリーの `dist/browser/` に出る
 * （`builtUiDir()` がモジュールの位置から決まるので、いま居る作業ツリーのものは動かない）。
 */
function buildUi(revision: Revision): boolean {
  try {
    execFileSync("node", [path.join(revision.treeDir, "scripts", "build-ui.ts")], {
      cwd: revision.treeDir,
      stdio: ["ignore", "ignore", "inherit"],
    })
    return true
  } catch (error) {
    process.stderr.write(`組み立てられない: ${String(error)}\n`)
    return false
  }
}

/**
 * 起こしたものが終わるまで居座る。この道具は自分では止めない — `node scripts/stop.ts --port` が
 * 子へ SIGTERM を送ると、それに続いてここも終わる（止め口を1つに保つ）。この道具自身が
 * SIGINT / SIGTERM を受けたときだけは、子を道連れにしてから終わる。
 */
function waitForExit(session: ChildProcess): Promise<number> {
  return new Promise((resolve) => {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => {
        session.kill("SIGTERM")
      })
    }
    session.on("exit", (code) => {
      process.stderr.write(`tsukumo が終了した（コード ${String(code)}）\n`)
      resolve(code ?? 0)
    })
  })
}

/**
 * git を1回打つ。失敗は undefined に畳む（呼ぶ側はどれも「取り出せなかった」で同じ扱い）。
 * `indexFile` を渡した呼び出しは、その一時 index に向けて打つ。
 */
function git(args: readonly string[], indexFile?: string): string | undefined {
  try {
    return execFileSync("git", [...args], {
      cwd: repositoryRoot(),
      encoding: "utf8",
      env: indexFile === undefined ? process.env : { ...process.env, GIT_INDEX_FILE: indexFile },
    })
  } catch (error) {
    process.stderr.write(`git ${args.join(" ")}: ${String(error)}\n`)
    return undefined
  }
}

/** いま居る作業ツリーの直下（この道具が置いてある `scripts/` の親）。 */
function repositoryRoot(): string {
  return fileURLToPath(new URL("..", import.meta.url))
}

/** 引数を読む。コミットが無い・`--port` が読めないときは undefined（呼び出し側が使い方を出す）。 */
function parseOptions(argv: readonly string[]): Options | undefined {
  const commit = argv[0]
  if (commit === undefined || commit.startsWith("-")) {
    return undefined
  }

  let port = DEFAULT_PORT
  let scene: string | undefined

  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (value === undefined) {
      return undefined
    }
    if (flag === "--port") {
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        return undefined
      }
      port = parsed
    } else if (flag === "--scene") {
      scene = value
    } else {
      return undefined
    }
    index += 1
  }

  return { commit, port, scene }
}

const exitCode = await main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
