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

import { prepareWorkspace } from "../../../src/server/adapter/worktree.ts"

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
  it("git リポジトリでなければ切らず、起動したディレクトリでそのまま動く", async () => {
    const prepared = await prepareWorkspace({ cwd: dir, enabled: true })

    expect(prepared.ok).toBe(true)
    expect(prepared.ok ? prepared.workspace.workdir : undefined).toEqual({
      kind: "direct",
      path: dir,
    })
  })

  it("切らないと渡されたら、git リポジトリでも切らない", async () => {
    const root = createRepository()

    const prepared = await prepareWorkspace({ cwd: root, enabled: false })

    expect(prepared.ok ? prepared.workspace.workdir.kind : undefined).toBe("direct")
    expect(existsSync(join(root, ".git", "tsukumo"))).toBe(false)
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
