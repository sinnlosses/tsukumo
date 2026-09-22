// セッション用の git worktree を用意し、使い終えたものを畳む（`docs/architecture.md`
// 「worktree でセッションを分ける」）。**git・ファイルシステム・OS のプロセスに触るのはここだけ**で、
// 切るかどうか・どの名前で切るか・畳むかどうかの判断は `src/server/core/workspace.ts` にある
// （原則3。1ファイル = 1つの境界）。
//
// **`git` を起こすファイルは2つ目**（もう1つは入力欄の `@` 補完が使う `repository-file.ts`）。
// 境界の単位はコマンドではなく概念なので、「管理下のファイルの列挙」と「セッションの作業場所」を
// 1つにまとめない。
//
// 置き場は `git rev-parse --git-common-dir` の下の `tsukumo/worktree/<名前>`、使用中の印は
// 同じ親の下の `tsukumo/mark/<名前>`（T-349 の決定4）。**git に1回聞けば worktree も印も
// 見つかる**ので、置き場をもう1つ決めて回らない。
//
// **`node_modules` と `characters/local` の symlink は `git status` に `??` で出る**
// （`.gitignore` の `node_modules/` は末尾が `/` なので、ディレクトリではない symlink に
// 当たらない。2026-09-22 実測）。畳んでよいかを見るときは、この2つを除いてから数える。

import { execFile } from "node:child_process"
import { lstat, mkdir, readdir, readFile, rm, rmdir, symlink, writeFile } from "node:fs/promises"
// `resolve` は下の `new Promise((resolve) => …)` と名前がぶつかるので、別名で取る。
import { dirname, join, resolve as resolvePath } from "node:path"
import process from "node:process"

import { isPlainObject } from "remeda"

import { type Workspace } from "../../shared/workspace.ts"
import {
  cutWorkspace,
  decideWorktreeFold,
  planWorkspace,
  type WorkspaceRepository,
  worktreeBranch,
  type WorktreeState,
} from "../core/workspace.ts"
import { bundledFilePath } from "./bundled-path.ts"

/** `git` の応答を待つ上限。**切るのも畳むのも起動時**なので、待たせ続けない。 */
const GIT_TIMEOUT_MS = 15000

/** 切った直後の組み立て（`bun run build`）を待つ上限。超えたら知らせて先へ進む。 */
const BUILD_TIMEOUT_MS = 60000

/** 受け取る標準出力の上限（`git status` が長くなる余地を見込む）。 */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

/** `.git` の下に作る、tsukumo の持ち物の親。worktree も印もこの下に並ぶ。 */
const WORKTREE_HOME_DIR_NAME = "tsukumo"
const WORKTREE_DIR_NAME = "worktree"
const MARK_DIR_NAME = "mark"

/**
 * 切った直後に張る symlink（**元にあって、切った先に無いときだけ**）。git 管理下に無いもので、
 * 無いと切った先で作業できない2つ（T-349 の決定「symlink 2本」）。
 *
 * **「自分のリポジトリかどうか」では判断しない**（T-349 の決定2）。元に無ければ何もしないので、
 * `characters/` を持たないプロジェクトでもこのまま通る。
 */
const LINKED_PATHS: readonly (readonly string[])[] = [["node_modules"], ["characters", "local"]]

/** 用意した結果。**失敗は起動時の前提不足**なので、理由だけを返して呼び出し側が即時終了する。 */
export type WorkspacePreparation =
  | {
      readonly ok: true
      readonly workspace: Workspace
      /** 知らせるだけで起動は続けること（畳めなかった worktree・組み立ての失敗）。 */
      readonly notices: readonly string[]
    }
  | { readonly ok: false; readonly reason: string }

/**
 * このセッションの作業場所を用意する。**git リポジトリなら必ず新しく切り**、切れなかったら
 * 失敗を返す（黙って元の作業ツリーで動かさない。T-349 の決定1）。
 *
 * 順序は**掃除 → 切る → symlink → 組み立て**。掃除を先にするのは、前の起動が残したものを
 * 溜めないため（畳めないものは消さずに知らせる）。
 */
export async function prepareWorkspace(options: {
  readonly cwd: string
  readonly enabled: boolean
}): Promise<WorkspacePreparation> {
  const source = sourceDir()
  const plan = planWorkspace({
    enabled: options.enabled,
    repository: await readWorkspaceRepository(options.cwd),
    cwd: options.cwd,
    source,
    // 時計と OS のタイムゾーンを読むのはここ（`core` は「いま何時か」を知らない）。
    startedAt: Temporal.Now.plainDateTimeISO(),
  })
  if (plan.kind === "direct") {
    return { ok: true, workspace: plan.workspace, notices: [] }
  }

  const { repository } = plan
  const notices = [...(await foldIdleWorktrees(repository))]
  const cut = await cutWorktree(repository, plan.names)
  if (!cut.ok) {
    return cut
  }

  notices.push(...(await furnishWorktree(repository, cut.path)))
  return {
    ok: true,
    workspace: cutWorkspace({
      source,
      path: cut.path,
      name: cut.name,
      origin: repository.root,
    }),
    notices,
  }
}

/**
 * tsukumo のプロセスが動かしているコードの置き場。**`resolve` に通す**のは
 * `bundledFilePath()` が引数なしだと末尾の区切りを残すため（画面にそのまま出る）。
 */
function sourceDir(): string {
  return resolvePath(bundledFilePath())
}

/**
 * 起動したディレクトリが属する作業ツリーを調べる。**git リポジトリでない・`git` が無い・
 * 時間がかかりすぎたときは undefined**（切らずにそのまま動く側へ倒れる）。
 *
 * `--path-format=absolute` を付けるのは、**`--git-common-dir` が元の作業ツリーでは相対パス
 * （`.git`）を返す**ため（2026-09-22 実測）。
 */
async function readWorkspaceRepository(cwd: string): Promise<WorkspaceRepository | undefined> {
  const gitDir = await runGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
  if (!gitDir.ok) {
    return undefined
  }

  // `git worktree list --porcelain` の先頭が元の作業ツリー（切った側から聞いても同じ）。
  const listed = await runGit(cwd, ["worktree", "list", "--porcelain"])
  const root = listed.ok ? firstWorktreePath(listed.stdout) : undefined
  return root === undefined ? undefined : { root, gitDir: gitDir.stdout.trim() }
}

/** `git worktree list --porcelain` の先頭の `worktree <パス>` の行。 */
function firstWorktreePath(stdout: string): string | undefined {
  const line = stdout.split("\n").find((candidate) => candidate.startsWith("worktree "))
  const path = line?.slice("worktree ".length).trim()
  return path === undefined || path === "" ? undefined : path
}

/**
 * 使い終えた worktree を畳む。**印（pid つき）を全部見て**、pid が生きていないもののうち
 * 未コミットの変更も未マージのコミットも無いものだけを消す。残したものは1行ずつ知らせる。
 *
 * **ここで失敗しても起動は続ける**（掃除は今回のセッションの前提ではない。次の起動がもう一度見る）。
 */
async function foldIdleWorktrees(repository: WorkspaceRepository): Promise<readonly string[]> {
  const markDir = join(repository.gitDir, WORKTREE_HOME_DIR_NAME, MARK_DIR_NAME)
  const names = await readdir(markDir).catch(() => [])
  if (names.length === 0) {
    return []
  }

  // 消えたディレクトリぶんの管理情報を先に落としておく（`git worktree remove` が当たらない
  // 取り残しを溜めない）。
  await runGit(repository.root, ["worktree", "prune"])

  const notices: string[] = []
  for (const name of names) {
    const notice = await foldIdleWorktree(repository, name)
    if (notice !== undefined) {
      notices.push(notice)
    }
  }
  return notices
}

/** 使い終えた worktree 1つを畳む。**残したときだけ**知らせる1行を返す。 */
async function foldIdleWorktree(
  repository: WorkspaceRepository,
  name: string,
): Promise<string | undefined> {
  const path = worktreePath(repository, name)
  const branch = worktreeBranch(name)
  const decision = decideWorktreeFold(await readWorktreeState(repository, name))
  if (decision.kind === "in-use") {
    return undefined
  }
  if (decision.kind === "left") {
    const what = decision.reason === "changed" ? "未コミットの変更" : "未マージのコミット"
    return `${what}が残っているので畳まなかった: ${path}（${branch}）`
  }

  // symlink は**自分で外してから** `git worktree remove` に渡す（git に辿らせない）。
  for (const segments of LINKED_PATHS) {
    await removeLink(join(path, ...segments))
  }
  await runGit(repository.root, ["worktree", "remove", path])
  await runGit(repository.root, ["branch", "-d", branch])
  await rm(markPath(repository, name), { force: true })
  return undefined
}

/** 印1つぶんの、いま分かっていること（判断そのものは `core` の `decideWorktreeFold`）。 */
async function readWorktreeState(
  repository: WorkspaceRepository,
  name: string,
): Promise<WorktreeState> {
  const running = await isMarkRunning(markPath(repository, name))
  if (running) {
    return { running: true, changed: false, unmerged: false }
  }

  const status = await runGit(worktreePath(repository, name), ["status", "--porcelain"])
  const unmerged = await runGit(repository.root, [
    "rev-list",
    "--count",
    `HEAD..${worktreeBranch(name)}`,
  ])
  return {
    running: false,
    changed: status.ok && countChanges(status.stdout) > 0,
    // 読めなかったとき（ブランチがもう無い）は「未マージのコミットは無い」側へ倒す。
    unmerged: unmerged.ok && unmerged.stdout.trim() !== "0",
  }
}

/** 印に書かれた pid のプロセスが生きているか。**読めない印は生きていない扱い**（掃除の対象）。 */
async function isMarkRunning(path: string): Promise<boolean> {
  const written = await readFile(path, "utf8").catch(() => undefined)
  const pid = Number(written?.trim())
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }

  try {
    // シグナル 0 は届けずに存在だけを見る。**別の利用者のプロセスなら EPERM** で、
    // これも「生きている」。
    process.kill(pid, 0)
    return true
  } catch (error) {
    return isPlainObject(error) && error["code"] === "EPERM"
  }
}

/**
 * `git status --porcelain` の行数。**自分で張った symlink の行は数えない**（ファイル冒頭の
 * とおり、`.gitignore` の `node_modules/` が symlink に当たらないので必ず `??` で出る）。
 */
function countChanges(stdout: string): number {
  const linked = LINKED_PATHS.map((segments) => `?? ${segments.join("/")}`)
  return stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "" && !linked.includes(line)).length
}

/** 切った結果。名前の候補を順に試し、**ディレクトリを作れたものが勝つ**。 */
type CutResult =
  | { readonly ok: true; readonly name: string; readonly path: string }
  | { readonly ok: false; readonly reason: string }

/**
 * 名前の候補を先頭から試して worktree を1つ切る。**印はディレクトリを作った直後に書く**ので、
 * 途中で失敗しても印の無い worktree は残らない（残ると次の起動の掃除が見つけられない）。
 */
async function cutWorktree(
  repository: WorkspaceRepository,
  names: readonly string[],
): Promise<CutResult> {
  const reasons: string[] = []
  for (const name of names) {
    const path = worktreePath(repository, name)
    const claimed = await claimWorktreeName(repository, name, path)
    if (!claimed) {
      continue
    }

    const added = await runGit(repository.root, [
      "worktree",
      "add",
      "-b",
      worktreeBranch(name),
      path,
    ])
    if (added.ok) {
      return { ok: true, name, path }
    }

    // 同じ名前のブランチが残っているなど、名前ごと使えないとき。作った印とディレクトリを
    // 戻してから次の候補へ。
    reasons.push(added.reason)
    await rm(markPath(repository, name), { force: true })
    await rmdir(path).catch(() => undefined)
  }

  return { ok: false, reason: `worktree を切れなかった\n${reasons.join("\n")}` }
}

/**
 * 名前を1つ取る。**ディレクトリの作成が排他の役目**（同じ秒に2つ起きたら、作れたほうが勝つ。
 * T-349 の決定4）。取れたら使用中の印（pid）も書く。
 */
async function claimWorktreeName(
  repository: WorkspaceRepository,
  name: string,
  path: string,
): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true })
  const created = await mkdir(path).then(
    () => true,
    () => false,
  )
  if (!created) {
    return false
  }

  await mkdir(dirname(markPath(repository, name)), { recursive: true })
  await writeFile(markPath(repository, name), `${String(process.pid)}\n`, "utf8")
  return true
}

/**
 * 切った直後に要るものを揃える（symlink 2本と `bun run build`）。**揃えられなくても
 * 起動は止めない** — worktree そのものは使えるので、知らせて先へ進む。
 */
async function furnishWorktree(
  repository: WorkspaceRepository,
  path: string,
): Promise<readonly string[]> {
  const notices: string[] = []
  for (const segments of LINKED_PATHS) {
    const failure = await linkFromOrigin(repository.root, path, segments)
    if (failure !== undefined) {
      notices.push(failure)
    }
  }

  const build = await buildInWorktree(path)
  return build === undefined ? notices : [...notices, build]
}

/**
 * 元の作業ツリーにあるものを、切った先から symlink で指す。**元に無い・切った先に既にある
 * ときは何もしない**（git 管理下にあるものを覆わない）。
 */
async function linkFromOrigin(
  root: string,
  path: string,
  segments: readonly string[],
): Promise<string | undefined> {
  const target = join(root, ...segments)
  const link = join(path, ...segments)
  const [targetExists, linkExists, parentExists] = await Promise.all([
    exists(target),
    exists(link),
    exists(dirname(link)),
  ])
  if (!targetExists || linkExists || !parentExists) {
    return undefined
  }

  return symlink(target, link).then(
    () => undefined,
    () => `${link} を ${target} へ繋げなかった`,
  )
}

/**
 * 切った先で `bun run build` を1回走らせる。**`build` を持たないプロジェクトでは何もしない**
 * （「自分のリポジトリかどうか」ではなく、`package.json` にその口があるかで決める）。
 *
 * 失敗しても知らせるだけ。組み立ての成果物は `.gitignore` なので切った先には無いが、
 * **tsukumo のプロセスが配るのは常に元の作業ツリーの成果物**（T-349 の決定2）なので、
 * ここで作れなくても画面は出る。
 */
async function buildInWorktree(path: string): Promise<string | undefined> {
  if (!(await hasBuildScript(path))) {
    return undefined
  }

  const built = await run("bun", ["run", "build"], path, BUILD_TIMEOUT_MS)
  return built.ok ? undefined : `切った worktree で bun run build が通らなかった: ${path}`
}

/** `package.json` に `scripts.build` があるか（読めない・JSON でないときは無い扱い）。 */
async function hasBuildScript(path: string): Promise<boolean> {
  const written = await readFile(join(path, "package.json"), "utf8").catch(() => undefined)
  if (written === undefined) {
    return false
  }

  const parsed = parseJson(written)
  if (!isPlainObject(parsed)) {
    return false
  }

  const scripts = parsed["scripts"]
  return isPlainObject(scripts) && typeof scripts["build"] === "string"
}

/** 壊れた JSON は undefined（外から来る値なので、読めないことを普通の結果として扱う）。 */
function parseJson(written: string): unknown {
  try {
    return JSON.parse(written) as unknown
  } catch {
    return undefined
  }
}

/** symlink だけを外す（**実体のディレクトリは消さない** — 指している先を巻き込まない）。 */
async function removeLink(path: string): Promise<void> {
  const linked = await lstat(path).then(
    (stats) => stats.isSymbolicLink(),
    () => false,
  )
  if (linked) {
    await rm(path, { force: true })
  }
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  )
}

function worktreePath(repository: WorkspaceRepository, name: string): string {
  return join(repository.gitDir, WORKTREE_HOME_DIR_NAME, WORKTREE_DIR_NAME, name)
}

function markPath(repository: WorkspaceRepository, name: string): string {
  return join(repository.gitDir, WORKTREE_HOME_DIR_NAME, MARK_DIR_NAME, name)
}

/** コマンド1回の結果。**失敗には必ず理由が付く**（起動を止めるときにそのまま出す）。 */
type CommandResult =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly reason: string }

function runGit(cwd: string, args: readonly string[]): Promise<CommandResult> {
  return run("git", args, cwd, GIT_TIMEOUT_MS)
}

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      [...args],
      { cwd, timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" },
      (error, stdout, stderr) => {
        resolve(
          error === null
            ? { ok: true, stdout }
            : { ok: false, reason: failureReason(command, args, stderr) },
        )
      },
    )
  })
}

/**
 * 失敗の理由。**打ったコマンドと、そのコマンドが書いた行**だけを並べる（会話の内容は通らない
 * 経路だが、他所の値を混ぜない形を保つ）。
 */
function failureReason(command: string, args: readonly string[], stderr: string): string {
  const written = stderr.trim()
  const line = `${command} ${args.join(" ")}`
  return written === "" ? line : `${line}\n${written}`
}
