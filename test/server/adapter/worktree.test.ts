import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { execFileSync } from "node:child_process"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { mergeWorkspace, prepareWorkspace } from "../../../src/server/adapter/worktree.ts"
import { type Workspace } from "../../../src/shared/workspace.ts"

// 本物の `git` を使い捨てのリポジトリで起こす（`git worktree add` の振る舞いそのものを
// 確かめたいので、ここはモックしない）。**tsukumo 自身のリポジトリには触らない。**
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-worktree-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/**
 * 使い捨てのリポジトリを1つ作り、その作業ツリーの根を返す。**`realpath` に揃える**のは、
 * macOS の一時ディレクトリが `/var` → `/private/var` の symlink で、`git` が返す絶対パスが
 * 解決済みになるため。
 */
function createRepository(): string {
  const root = join(realpathSync(dir), "main")
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true })
  writeFileSync(join(root, "node_modules", "pkg", "index.js"), "// 架空の依存\n")
  writeFileSync(join(root, ".gitignore"), "node_modules/\ndist/\n")
  writeFileSync(join(root, "README.md"), "# 架空のリポジトリ\n")
  git(root, ["init", "-q", "."])
  // マージのコミットを作るのに要る（本物の `git merge` を走らせるため）。
  git(root, ["config", "user.email", "test@example.invalid"])
  git(root, ["config", "user.name", "test"])
  git(root, ["add", "-A"])
  git(root, [
    "-c",
    "user.email=test@example.invalid",
    "-c",
    "user.name=test",
    "commit",
    "-qm",
    "init",
  ])
  return root
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8" })
}

describe("prepareWorkspace", () => {
  it("git リポジトリでなければ切らず、起動したディレクトリでそのまま動く（印の置き場も無い）", async () => {
    const prepared = await prepareWorkspace({ cwd: dir, enabled: true })

    expect(prepared.ok).toBe(true)
    expect(prepared.ok ? prepared.workspace.workdir : undefined).toEqual({
      kind: "direct",
      path: dir,
    })
    expect(prepared.ok ? prepared.gitDir : "").toBeUndefined()
  })

  it("切らないと渡されたら、git リポジトリでも切らない（着手の印の置き場は返る）", async () => {
    const root = createRepository()

    const prepared = await prepareWorkspace({ cwd: root, enabled: false })

    expect(prepared.ok ? prepared.workspace.workdir.kind : undefined).toBe("direct")
    expect(existsSync(join(root, ".git", "tsukumo"))).toBe(false)
    expect(prepared.ok ? prepared.gitDir : undefined).toBe(join(root, ".git"))
  })

  it("git リポジトリなら .git の下に切り、印と node_modules の symlink を置く", async () => {
    const root = createRepository()

    const prepared = await prepareWorkspace({ cwd: root, enabled: true })

    expect(prepared.ok).toBe(true)
    const workdir = prepared.ok ? prepared.workspace.workdir : undefined
    expect(workdir?.kind).toBe("worktree")
    const path = workdir?.path ?? ""
    expect(path.startsWith(join(root, ".git", "tsukumo", "worktree"))).toBe(true)
    // 切った先は元の内容を持ち、プロジェクト設定の出どころだけが元を指す。
    expect(existsSync(join(path, "README.md"))).toBe(true)
    expect(workdir?.kind === "worktree" ? workdir.origin : undefined).toBe(root)
    // 着手の印の置き場（切り出し元の `.git`）も返る。
    expect(prepared.ok ? prepared.gitDir : undefined).toBe(join(root, ".git"))
    // `node_modules` は symlink（実体を複製しない）。
    expect(lstatSync(join(path, "node_modules")).isSymbolicLink()).toBe(true)
    expect(existsSync(join(path, "node_modules", "pkg", "index.js"))).toBe(true)
    // 印は worktree と同じ親の下に、切った名前で置かれる。
    const name = path.slice(path.lastIndexOf("/") + 1)
    expect(existsSync(join(root, ".git", "tsukumo", "mark", name))).toBe(true)
    // ブランチは `tsukumo/<名前>`。
    expect(git(root, ["branch", "--list", `tsukumo/${name}`]).trim()).toContain(`tsukumo/${name}`)
  })

  it("使い終えた（pid の生きていない）worktree は、次の起動が畳む", async () => {
    const root = createRepository()
    const first = await prepareWorkspace({ cwd: root, enabled: true })
    const firstPath = first.ok ? first.workspace.workdir.path : ""
    const firstName = firstPath.slice(firstPath.lastIndexOf("/") + 1)
    // 印の pid を「生きていないもの」に書き換える（プロセスが落ちたあとと同じ姿）。
    writeFileSync(join(root, ".git", "tsukumo", "mark", firstName), "999999999\n")
    // `.gitignore` に入る置き土産。**畳んだかどうかはこれが消えたかで見る**（同じ秒に起こすと
    // 名前が同じになりうるので、パスの違いでは見分けられない）。
    mkdirSync(join(firstPath, "dist"), { recursive: true })
    writeFileSync(join(firstPath, "dist", "leftover.js"), "// 架空の置き土産\n")

    const second = await prepareWorkspace({ cwd: root, enabled: true })

    expect(second.ok).toBe(true)
    expect(second.ok ? second.notices : ["知らせが出た"]).toEqual([])
    expect(existsSync(join(firstPath, "dist", "leftover.js"))).toBe(false)
  })

  it("未コミットの変更が残っている worktree は畳まずに知らせる", async () => {
    const root = createRepository()
    const first = await prepareWorkspace({ cwd: root, enabled: true })
    const firstPath = first.ok ? first.workspace.workdir.path : ""
    const firstName = firstPath.slice(firstPath.lastIndexOf("/") + 1)
    writeFileSync(join(root, ".git", "tsukumo", "mark", firstName), "999999999\n")
    writeFileSync(join(firstPath, "README.md"), "# 架空の書きかけ\n")

    const second = await prepareWorkspace({ cwd: root, enabled: true })

    expect(existsSync(firstPath)).toBe(true)
    expect(second.ok ? second.notices : []).toEqual([
      `未コミットの変更が残っているので畳まなかった: ${firstPath}（tsukumo/${firstName}）`,
    ])
  })

  it("動いている tsukumo の worktree は畳まない（印の pid が生きている）", async () => {
    const root = createRepository()
    const first = await prepareWorkspace({ cwd: root, enabled: true })
    const firstPath = first.ok ? first.workspace.workdir.path : ""

    const second = await prepareWorkspace({ cwd: root, enabled: true })

    expect(existsSync(firstPath)).toBe(true)
    expect(second.ok ? second.notices : ["知らせが出た"]).toEqual([])
  })
})

/** 切った worktree を1つ用意する（切れていなければテストを落とす）。 */
async function cutWorkspaceFor(root: string): Promise<Workspace> {
  const prepared = await prepareWorkspace({ cwd: root, enabled: true })
  if (!prepared.ok || prepared.workspace.workdir.kind !== "worktree") {
    throw new Error("worktree を切れなかった")
  }
  return prepared.workspace
}

/** 切った worktree の名前（印の置き場と同じ綴り）。 */
function nameOf(workspace: Workspace): string {
  const { path } = workspace.workdir
  return path.slice(path.lastIndexOf("/") + 1)
}

/** その worktree を使っていたプロセスが終わったあとと同じ姿にする（印の pid を落とす）。 */
function markAsExited(root: string, workspace: Workspace): void {
  writeFileSync(join(root, ".git", "tsukumo", "mark", nameOf(workspace)), "999999999\n")
}

/** 切った先で1コミットぶんの成果を作る。 */
function commitInWorktree(workspace: Workspace, file: string, body: string, message: string): void {
  const path = workspace.workdir.path
  writeFileSync(join(path, file), body)
  git(path, ["add", file])
  git(path, ["commit", "-qm", message])
}

describe("mergeWorkspace", () => {
  it("切った先のコミットを本体へ入れ、使い終えていれば worktree ごと畳む", async () => {
    const root = createRepository()
    const workspace = await cutWorkspaceFor(root)
    commitInWorktree(workspace, "TASK.md", "# 架空の成果\n", "架空のタスク")
    markAsExited(root, workspace)

    const merged = await mergeWorkspace(workspace)

    expect(merged).toEqual({ kind: "merged", notices: [] })
    expect(git(root, ["log", "--oneline"])).toContain("架空のタスク")
    expect(existsSync(workspace.workdir.path)).toBe(false)
    expect(git(root, ["branch", "--list", "tsukumo/*"]).trim()).toBe("")
    expect(git(root, ["worktree", "list"]).trim().split("\n")).toHaveLength(1)
  })

  it("まだ使っているセッションの worktree は、入れるだけで畳まない", async () => {
    const root = createRepository()
    const workspace = await cutWorkspaceFor(root)
    commitInWorktree(workspace, "TASK.md", "# 架空の成果\n", "架空のタスク")

    const merged = await mergeWorkspace(workspace)

    expect(merged).toEqual({ kind: "merged", notices: [] })
    expect(git(root, ["log", "--oneline"])).toContain("架空のタスク")
    // `cwd` が消えないよう残し、畳むのは次の起動の掃除に任せる。
    expect(existsSync(workspace.workdir.path)).toBe(true)
  })

  it("衝突したら本体を元に戻し、worktree とブランチを残して理由を返す", async () => {
    const root = createRepository()
    const workspace = await cutWorkspaceFor(root)
    commitInWorktree(workspace, "README.md", "# worktree 側の書き換え\n", "worktree 側")
    writeFileSync(join(root, "README.md"), "# 本体側の書き換え\n")
    git(root, ["commit", "-qam", "本体側"])
    const before = git(root, ["rev-parse", "HEAD"]).trim()

    const stopped = await mergeWorkspace(workspace)

    expect(stopped.kind).toBe("stopped")
    const notice = stopped.kind === "stopped" ? stopped.notice : ""
    expect(notice).toContain("マージが衝突したので止めた（本体は元に戻した）")
    expect(notice).toContain(`ブランチ: tsukumo/${nameOf(workspace)}`)
    expect(notice).toContain(`worktree: ${workspace.workdir.path}`)
    expect(notice).toContain("衝突したファイル: README.md")
    expect(notice).toContain("次の手: worktree で git merge main して解き、もう一度マージを頼む")
    // 本体は半端なマージ状態を残さない。
    expect(git(root, ["rev-parse", "HEAD"]).trim()).toBe(before)
    expect(git(root, ["status", "--porcelain"]).trim()).toBe("")
    expect(existsSync(join(root, ".git", "MERGE_HEAD"))).toBe(false)
    // 解くのに要る材料はそこにしか無いので、畳まない。
    expect(existsSync(workspace.workdir.path)).toBe(true)
    expect(git(root, ["branch", "--list", `tsukumo/${nameOf(workspace)}`]).trim()).not.toBe("")
  })

  it("本体に未コミットの変更があるときはマージを始めず、本体の場所を知らせる", async () => {
    const root = createRepository()
    const workspace = await cutWorkspaceFor(root)
    commitInWorktree(workspace, "TASK.md", "# 架空の成果\n", "架空のタスク")
    writeFileSync(join(root, "README.md"), "# 本体の書きかけ\n")

    const stopped = await mergeWorkspace(workspace)

    expect(stopped.kind).toBe("stopped")
    const notice = stopped.kind === "stopped" ? stopped.notice : ""
    expect(notice).toContain("本体に未コミットの変更があるのでマージしなかった")
    expect(notice).toContain(`本体: ${root}`)
    expect(git(root, ["log", "--oneline"])).not.toContain("架空のタスク")
  })

  it("入れるものが無ければ何もしない", async () => {
    const root = createRepository()
    const workspace = await cutWorkspaceFor(root)

    expect(await mergeWorkspace(workspace)).toEqual({ kind: "skipped" })
  })

  it("切っていなければ何もしない", async () => {
    const root = createRepository()

    const merged = await mergeWorkspace({
      source: root,
      workdir: { kind: "direct", path: root },
    })

    expect(merged).toEqual({ kind: "skipped" })
  })
})

describe("取り残しの片付け", () => {
  it("印が消えていても、実体が残っていれば次の起動が見つけて畳む", async () => {
    const root = createRepository()
    const first = await cutWorkspaceFor(root)
    rmSync(join(root, ".git", "tsukumo", "mark", nameOf(first)), { force: true })
    // 畳んだかどうかは置き土産で見る（同じ秒に起こすと切り直した先が同じパスになりうる）。
    mkdirSync(join(first.workdir.path, "dist"), { recursive: true })
    writeFileSync(join(first.workdir.path, "dist", "leftover.js"), "// 架空の置き土産\n")

    const second = await prepareWorkspace({ cwd: root, enabled: true })

    expect(second.ok ? second.notices : ["知らせが出た"]).toEqual([])
    expect(existsSync(join(first.workdir.path, "dist", "leftover.js"))).toBe(false)
  })

  it("畳めなかったときは印を残し、次の起動でもう一度片付けられるようにする", async () => {
    const root = createRepository()
    const workspace = await cutWorkspaceFor(root)
    markAsExited(root, workspace)
    // 管理情報だけを先に落とすと `git worktree remove` が当たらなくなる（畳めない姿）。
    git(root, ["worktree", "remove", "--force", workspace.workdir.path])
    mkdirSync(workspace.workdir.path, { recursive: true })

    const second = await prepareWorkspace({ cwd: root, enabled: true })

    expect(second.ok ? second.notices : []).toEqual([
      `畳めなかったので次の起動でもう一度片付ける: ${workspace.workdir.path}（tsukumo/${nameOf(workspace)}）`,
    ])
    expect(existsSync(join(root, ".git", "tsukumo", "mark", nameOf(workspace)))).toBe(true)
  })
})
