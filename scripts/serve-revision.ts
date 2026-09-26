// 変更前の画面を、作業ツリーを1つも動かさずに起こす道具。名指ししたコミットを /tmp へ取り出し、
// そこで組み立てて、空けたポートと一時ホームで tsukumo を1つ起こして URL を出す。撮るのは
// `capture-view.ts` / `capture-catalog.ts` の仕事で、こちらは「変更前をどこかに用意する」ところだけを持つ。
//
// 作業ツリーと `dist/browser/` に触らないことが、この道具の存在理由。 `git stash`・
// `git checkout` で手元を巻き戻す方法は、戻し忘れると書きかけの変更を失うか、`dist/browser/` が
// 変更前のまま残る（`docs/architecture.md`「変更前と撮り比べる」）。ここでは取り出しに一時 index を
// 使うので、本物の index も作業ツリーも読むだけで済む。
//
// 使い方:
//   bun run scripts/serve-revision.ts HEAD~1                      # 1つ前のコミットを起こす
//   bun run scripts/serve-revision.ts HEAD~1 --port 7341 --scene notation-figure
//   bun run scripts/stop.ts --port 7340                           # 止める（必ず打つ）
//
// 起こしたものは自分では止まらない。撮り終えたら `stop.ts --port` で止める
// （`pkill` / `killall` は `scripts/deny-broad-kill.ts` が拒否する）。この道具は子が死ぬと一緒に
// 終わるので、止めるのは `stop.ts` の1回で足りる。
//
// 駆動は fake 固定（`TSUKUMO_DRIVER=fake`）。変更前を見るために本物の claude を /tmp の複製で
// 起こす理由が無く、API も使わない。ホームも /tmp に切るので、利用者の `~/.tsukumo/`
// （覚えたキャラクター・雑談の要約）は読み書きしない。
//
// `node_modules` はいま居る作業ツリーのものを symlink で貸す（取り出したツリーで
// `bun install` はしない）。撮り比べる2点は普通ひと続きのコミットで、依存は同じ。
// `package.json` をまたいで比べるときだけこの前提が崩れるので、そのときは取り出し先で
// `bun install` を手で打つ。
//
// `.git` も同じく symlink で貸す。無いと成果の画面が「main が読めない」になる
// （`src/server/achievement/adapter/main-history.ts`）。取り出し先で打つ `git` は読み取り専用
// だけ（`lendGitDirectory` のコメント）なので、貸した `.git` を書き換える心配はない。

import { type ChildProcess, execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, symlinkSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

/**
 * 取り出し先の親（リポジトリの外）。コミットごとに下に掘るので、同じコミットを何度起こしても
 * 積み上がらない。撮った画像と同じく、リポジトリには何も置かない。
 */
const SCRATCH_ROOT = "/tmp/tsukumo-revision"

/**
 * 既定のポート。利用者の tsukumo（7327〜7330 あたり）から離し、かつ `stop.ts` が引数なしで
 * 一覧する範囲（既定ポートから `VIEW_PORT_FALLBACK_ATTEMPTS` 個ぶん）の中に収める
 * — 止め忘れたときに一覧から見つかるようにする。
 */
const DEFAULT_PORT = 7340

/** 起こした tsukumo が URL を出すまで待つ上限（ミリ秒）。 */
const LAUNCH_TIMEOUT_MS = 30_000

const USAGE = `使い方: bun run scripts/serve-revision.ts <コミット> [オプション]

  --port <n>      待ち受けるポート（既定 ${String(DEFAULT_PORT)}。明示指定なのでずらさない）
  --scene <name>  起こした直後に流す疑似セッションの場面（既定は流さない）

  例: bun run scripts/serve-revision.ts HEAD~1 --scene notation-figure
      撮り終えたら bun run scripts/stop.ts --port ${String(DEFAULT_PORT)}
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

  const session = spawnTsukumo(revision, options)
  const url = await waitForViewUrl(session)
  if (url === undefined) {
    session.kill("SIGTERM")
    return 1
  }

  process.stdout.write(
    `${revision.sha} を配信中\n  ${url}\n` +
      `止める: bun run scripts/stop.ts --port ${String(options.port)}\n`,
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

  const treeDir = path.join(SCRATCH_ROOT, sha, "tree")
  const homeDir = path.join(SCRATCH_ROOT, sha, "home")
  mkdirSync(treeDir, { recursive: true })
  mkdirSync(homeDir, { recursive: true })

  const indexFile = path.join(SCRATCH_ROOT, sha, "index")
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
 * いま居る作業ツリーの `.git` を symlink で貸す。成果の画面（`main` の履歴。
 * `src/server/achievement/adapter/main-history.ts`）が `main` を読むのにこれが要る
 * （無いと「main が読めない」＝`{ kind: "unknown" }` になる）。
 *
 * `.git` は本体の作業ツリーそのままの形（ディレクトリでも、linked worktree の gitdir
 * ポインタのファイルでも）を symlink で指すだけ——書き換えない。取り出し先で打つ `git` は
 * `src/server/repository/adapter/git.ts` 経由のものだけで、そこはすべて読み取り専用
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
    execFileSync("bun", ["run", path.join(revision.treeDir, "scripts", "build-ui.ts")], {
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
 * 取り出したツリーで tsukumo を1つ起こす。タブは開かず（`TSUKUMO_OPEN_VIEW=0`）、駆動は fake、
 * ホームは /tmp の下 — 利用者が使っている tsukumo とポートもホームも重ならない。
 */
function spawnTsukumo(revision: Revision, options: Options): ChildProcess {
  return spawn("bun", ["run", path.join(revision.treeDir, "src", "cli.ts")], {
    cwd: revision.treeDir,
    env: {
      ...process.env,
      TSUKUMO_DRIVER: "fake",
      ...(options.scene === undefined ? {} : { TSUKUMO_FAKE_SCENE: options.scene }),
      TSUKUMO_VIEW_PORT: String(options.port),
      TSUKUMO_HOME: revision.homeDir,
      TSUKUMO_OPEN_VIEW: "0",
      TSUKUMO_WATCH_UI: "0",
    },
    stdio: ["ignore", "pipe", "inherit"],
  })
}

/** 起こした tsukumo が出す配信 URL を待つ。出ないまま終わったら undefined。 */
function waitForViewUrl(session: ChildProcess): Promise<string | undefined> {
  return new Promise((resolve) => {
    let seen = ""
    const timer = setTimeout(() => {
      process.stderr.write(`tsukumo が URL を出さない（${String(LAUNCH_TIMEOUT_MS)}ms）\n`)
      resolve(undefined)
    }, LAUNCH_TIMEOUT_MS)

    session.stdout?.on("data", (chunk: Buffer) => {
      seen += chunk.toString("utf8")
      const url = /https?:\/\/\S+/.exec(seen)?.[0]
      if (url !== undefined) {
        clearTimeout(timer)
        resolve(url)
      }
    })
    session.on("exit", (code) => {
      clearTimeout(timer)
      process.stderr.write(`tsukumo が終了した（コード ${String(code)}）\n`)
      resolve(undefined)
    })
  })
}

/**
 * 起こしたものが終わるまで居座る。この道具は自分では止めない — `stop.ts --port` が子へ
 * SIGTERM を送ると、それに続いてここも終わる（止め口を1つに保つ）。この道具自身が
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
