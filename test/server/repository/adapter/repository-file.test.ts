import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { listRepositoryFiles } from "../../../../src/server/repository/adapter/repository-file.ts"
import { runSubprocessOrThrow } from "../../../fixture/subprocess.ts"

// ここだけは本物の `git` を起こす（列挙そのものが検査の対象）。読むのはこのリポジトリ自身の
// ファイル名だけで、中身は開かない。

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../..", import.meta.url)).replace(/\/$/, "")

describe("listRepositoryFiles", () => {
  it("git 管理下のファイルをリポジトリ相対のパスで返す", async () => {
    const { paths, omittedCount } = await listRepositoryFiles(REPOSITORY_ROOT)

    expect(paths).toContain("package.json")
    expect(paths).toContain("src/server/view-server/adapter/server.ts")
    // 管理外（`pnpm install` が作るもの）は入らない。
    expect(paths.some((path) => path.startsWith("node_modules/"))).toBe(false)
    expect(omittedCount).toBe(0)
  })

  it("git リポジトリでないディレクトリでは空を返す（例外を投げない）", async () => {
    const outside = mkdtempSync(join(tmpdir(), "tsukumo-repository-file-"))

    expect(await listRepositoryFiles(outside)).toEqual({ paths: [], omittedCount: 0 })
  })

  it("`git` の呼び出しそのものが失敗しても空を返す（無いディレクトリ）", async () => {
    const missing = join(tmpdir(), "tsukumo-repository-file-missing", "nowhere")

    expect(await listRepositoryFiles(missing)).toEqual({ paths: [], omittedCount: 0 })
  })

  it("上限を超えたら並びの前から上限まで返し、落とした件数を載せる", async () => {
    const repository = mkdtempSync(join(tmpdir(), "tsukumo-repository-file-limit-"))
    const names = ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt"]
    for (const name of names) {
      writeFileSync(join(repository, name), "架空")
    }
    await runSubprocessOrThrow("git", ["init", "--quiet"], { cwd: repository })
    await runSubprocessOrThrow("git", ["add", ...names], { cwd: repository })

    expect(await listRepositoryFiles(repository, 3)).toEqual({
      paths: ["a.txt", "b.txt", "c.txt"],
      omittedCount: 2,
    })
    expect(await listRepositoryFiles(repository, 5)).toEqual({ paths: names, omittedCount: 0 })
  })
})
