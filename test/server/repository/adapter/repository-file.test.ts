import { describe, expect, it } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { listRepositoryFiles } from "../../../../src/server/repository/adapter/repository-file.ts"

// ここだけは本物の `git` を起こす（列挙そのものが検査の対象）。読むのはこのリポジトリ自身の
// ファイル名だけで、中身は開かない。

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../..", import.meta.url)).replace(/\/$/, "")

describe("listRepositoryFiles", () => {
  it("git 管理下のファイルをリポジトリ相対のパスで返す", async () => {
    const files = await listRepositoryFiles(REPOSITORY_ROOT)

    expect(files).toContain("package.json")
    expect(files).toContain("src/server/view-server/adapter/server.ts")
    // 管理外（`bun install` が作るもの）は入らない。
    expect(files.some((path) => path.startsWith("node_modules/"))).toBe(false)
  })

  it("git リポジトリでないディレクトリでは空を返す（例外を投げない）", async () => {
    const outside = mkdtempSync(join(tmpdir(), "tsukumo-repository-file-"))

    expect(await listRepositoryFiles(outside)).toEqual([])
  })

  it("`git` の呼び出しそのものが失敗しても空を返す（無いディレクトリ）", async () => {
    const missing = join(tmpdir(), "tsukumo-repository-file-missing", "nowhere")

    expect(await listRepositoryFiles(missing)).toEqual([])
  })
})
