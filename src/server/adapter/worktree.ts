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
// 同じ親の下（同節の決定4）。**git に1回聞けば worktree も印も見つかる**ので、置き場を
// もう1つ決めて回らない。**印そのものの読み書きは `mark.ts`**（タスクの着手の印と同じ仕組みで、
// 二度書きしない）。
//
// **`node_modules` と `characters/local` の symlink は `git status` に `??` で出る**
// （`.gitignore` の `node_modules/` は末尾が `/` なので、ディレクトリではない symlink に
// 当たらない。2026-09-22 実測）。畳んでよいかを見るときは、この2つを除いてから数える。

import { execFile } from "node:child_process"
import { lstat, mkdir, readdir, readFile, rm, rmdir, symlink } from "node:fs/promises"
// `resolve` は下の `new Promise((resolve) => …)` と名前がぶつかるので、別名で取る。
import { basename, dirname, join, resolve as resolvePath } from "node:path"

import { isPlainObject } from "remeda"

import { type Workspace } from "../../shared/workspace.ts"
import {
  cutWorkspace,
  decideWorktreeFold,
  decideWorktreeMerge,
  planWorkspace,
  type WorkspaceRepository,
  worktreeBranch,
  worktreeMergeStopNotice,
  type WorktreeMergeState,
  type WorktreeMergeStop,
  type WorktreeState,
} from "../core/workspace.ts"
import { bundledFilePath } from "./bundled-path.ts"
import {
  isWorktreeInUse,
  listWorktreeMarkNames,
  removeWorktreeMark,
  tsukumoGitDir,
  writeWorktreeMark,
} from "./mark.ts"

/** `git` の応答を待つ上限。**切るのも畳むのも起動時**なので、待たせ続けない。 */
const GIT_TIMEOUT_MS = 15000

/** 切った直後の組み立て（`bun run build`）を待つ上限。超えたら知らせて先へ進む。 */
const BUILD_TIMEOUT_MS = 60000

/** 受け取る標準出力の上限（`git status` が長くなる余地を見込む）。 */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

/** 切った worktree の実体を並べる場所（`.git` の下の tsukumo の持ち物の親から1段下）。 */
const WORKTREE_DIR_NAME = "worktree"

/**
 * 切った直後に張る symlink（**元にあって、切った先に無いときだけ**）。git 管理下に無いもので、
 * 無いと切った先で作業できない2つ（同節の決定「symlink 2本」）。
 *
 * **「自分のリポジトリかどうか」では判断しない**（同節の決定2）。元に無ければ何もしないので、
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
 * 失敗を返す（黙って元の作業ツリーで動かさない。同節の決定1）。
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
 * 1タスクぶんの成果を本体へ入れた結果。**止まったときは理由を必ず持つ**ので、呼び出し側は
 * 知らせ漏れなく画面へ出せる（`docs/architecture.md`「worktree でセッションを分ける」の決定3）。
 */
export type WorkspaceMerge =
  /** 本体へ入った。`notices` は**畳めなかったときだけ**の1行（畳めたときは空）。 */
  | { readonly kind: "merged"; readonly notices: readonly string[] }
  /** 入れるものが無かった（切っていない・コミットが増えていない）。**何も知らせない。** */
  | { readonly kind: "skipped" }
  /** 止まった。**そのセッションは次のタスクへ進まない**（判断は呼び出し側）。 */
  | { readonly kind: "stopped"; readonly notice: string }

/**
 * このセッションの成果を切り出し元へ入れ、入ったら worktree を畳む。**1タスクごとに呼ぶ**
 * （ブランチが1タスクより長生きしないことで、衝突の窓が小さくなる）。
 *
 * 本体が `main` をチェックアウトしているので `git push . HEAD:main` は断られる。**本体の
 * ディレクトリを指して `git -C <本体> merge` を走らせる**のが唯一の道で、だから本体が汚れて
 * いないことを先に確かめる（{@link decideWorktreeMerge}）。
 *
 * **fast-forward できるならそれで済ませ、できないときだけ merge commit を作る**（`--no-ff` も
 * `--ff-only` も付けない）。`--no-ff` を常に付けると中身の無いコミットが1タスクごとに積まれ、
 * `--ff-only` だと**他のセッターが先にマージしただけで止まる**（衝突していなくても人を呼ぶ形に
 * なる）。
 *
 * **衝突したら自動で解こうとしない**（`-X ours` / `-X theirs` も使わない）。本体を
 * `merge --abort` で必ず戻し、**worktree とブランチは畳まずに**理由を返す——解くのに要る材料が
 * そこにしか無い。
 */
export async function mergeWorkspace(workspace: Workspace): Promise<WorkspaceMerge> {
  const { workdir } = workspace
  if (workdir.kind !== "worktree") {
    return { kind: "skipped" }
  }

  const repository = await readWorkspaceRepository(workdir.origin)
  if (repository === undefined) {
    return stopped({ kind: "failed", reason: `git に聞けなかった: ${workdir.origin}` }, workdir)
  }

  const plan = decideWorktreeMerge(await readWorktreeMergeState(repository, workdir.branch))
  if (plan.kind === "skip") {
    return { kind: "skipped" }
  }
  if (plan.kind === "blocked") {
    return stopped({ kind: "origin-changed", origin: repository.root }, workdir)
  }

  const merged = await runGit(repository.root, ["merge", "--no-edit", workdir.branch])
  if (!merged.ok) {
    return stopped(await abortMerge(repository.root, merged.reason), workdir)
  }

  // 入ったので畳む。**使っているセッションが生きている間は畳まない**（`cwd` が消えると claude が
  // 立っている場所が無くなる）ので、**自分の worktree はここでは残り、次の起動の掃除が畳む**
  // （{@link foldIdleWorktrees} と同じ口）。
  const notice = await foldIdleWorktree(repository, basename(workdir.path))
  return { kind: "merged", notices: notice === undefined ? [] : [notice] }
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
  const names = await idleWorktreeNames(repository)
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

/**
 * 片付けの対象になる worktree の名前。**印と実体の両方から集める**（どちらか一方しか無くても
 * 見つかる形にしておく）。印を人が消した・書く前に落ちたといったときに、**実体だけが残って
 * 二度と見つからない worktree** を作らないため。
 */
async function idleWorktreeNames(repository: WorkspaceRepository): Promise<readonly string[]> {
  const marked = await listWorktreeMarkNames(repository.gitDir)
  const cut = await readdir(join(tsukumoGitDir(repository.gitDir), WORKTREE_DIR_NAME)).catch(
    () => [],
  )
  return [...new Set([...marked, ...cut])]
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
  // **畳めたかどうかは実体が消えたかで見る**（`git worktree remove` の成否では見ない）——
  // 管理情報だけが残っていた取り残しでは remove が失敗するが、ディレクトリが無ければ畳めている。
  // **畳めなかったときは印を残す**ので、次の起動がもう一度見つけて片付けられる。
  if (await exists(path)) {
    return `畳めなかったので次の起動でもう一度片付ける: ${path}（${branch}）`
  }

  await runGit(repository.root, ["branch", "-d", branch])
  await removeWorktreeMark(repository.gitDir, name)
  return undefined
}

/** 印1つぶんの、いま分かっていること（判断そのものは `core` の `decideWorktreeFold`）。 */
async function readWorktreeState(
  repository: WorkspaceRepository,
  name: string,
): Promise<WorktreeState> {
  const running = await isWorktreeInUse(repository.gitDir, name)
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
    await removeWorktreeMark(repository.gitDir, name)
    await rmdir(path).catch(() => undefined)
  }

  return { ok: false, reason: `worktree を切れなかった\n${reasons.join("\n")}` }
}

/**
 * 名前を1つ取る。**ディレクトリの作成が排他の役目**（同じ秒に2つ起きたら、作れたほうが勝つ。
 * 同節の決定4）。取れたら使用中の印（pid）も書く。
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

  await writeWorktreeMark(repository.gitDir, name)
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
 * **tsukumo のプロセスが配るのは常に元の作業ツリーの成果物**（同節の決定2）なので、
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

/** 止まった結果を1つに組む（文面を組むのは `core`。ここは git の返事を写すだけ）。 */
function stopped(
  stop: WorktreeMergeStop,
  workdir: { readonly branch: string; readonly path: string },
): WorkspaceMerge {
  return { kind: "stopped", notice: worktreeMergeStopNotice(stop, workdir) }
}

/**
 * 半端なマージ状態の本体を必ず元へ戻し、**戻す前に**衝突したファイルを読む（`--abort` のあとでは
 * 一覧が消える）。衝突以外で通らなかったときは git が書いた行をそのまま持つ。
 */
async function abortMerge(root: string, reason: string): Promise<WorktreeMergeStop> {
  const listed = await runGit(root, ["diff", "--name-only", "--diff-filter=U"])
  const files = listed.ok ? nonEmptyLines(listed.stdout) : []
  await runGit(root, ["merge", "--abort"])
  return files.length === 0 ? { kind: "failed", reason } : { kind: "conflict", files }
}

/** マージの前に分かっていること（判断そのものは `core` の `decideWorktreeMerge`）。 */
async function readWorktreeMergeState(
  repository: WorkspaceRepository,
  branch: string,
): Promise<WorktreeMergeState> {
  const status = await runGit(repository.root, ["status", "--porcelain"])
  const unmerged = await runGit(repository.root, ["rev-list", "--count", `HEAD..${branch}`])
  return {
    // **読めなかったときは「汚れている」側へ倒す**（畳むかどうかの判断と安全側が逆。消すのでは
    // なく止めるほうなので、分からないなら人へ返す）。
    originChanged: !status.ok || countChanges(status.stdout) > 0,
    unmerged: unmerged.ok && unmerged.stdout.trim() !== "0",
  }
}

/** 空行を落とした行の並び（`git` の一覧の出力を読むのはこの形だけ）。 */
function nonEmptyLines(stdout: string): readonly string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
}

function worktreePath(repository: WorkspaceRepository, name: string): string {
  return join(tsukumoGitDir(repository.gitDir), WORKTREE_DIR_NAME, name)
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
