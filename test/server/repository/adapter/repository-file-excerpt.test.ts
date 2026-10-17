import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  MAX_EXCERPT_FILE_BYTES,
  readFileExcerpt,
} from "../../../../src/server/repository/adapter/repository-file-excerpt.ts"

/** 架空の中身を置いた作業ディレクトリ。git 管理下の一覧はテストごとに渡す。 */
function fictionalWorkspace(files: Readonly<Record<string, string | Buffer>>): string {
  const cwd = mkdtempSync(join(tmpdir(), "tsukumo-file-excerpt-"))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(cwd, path, ".."), { recursive: true })
    writeFileSync(join(cwd, path), content)
  }
  return cwd
}

function listing(paths: readonly string[]): () => Promise<readonly string[]> {
  return async () => paths
}

const TEN_LINES = Array.from({ length: 10 }, (_, index) => `架空の行 ${index + 1}`).join("\n")

describe("readFileExcerpt", () => {
  it("一覧にあるファイルを読み、指した範囲の前後を返す", async () => {
    const cwd = fictionalWorkspace({ "src/fictional.ts": TEN_LINES })

    const excerpt = await readFileExcerpt(
      cwd,
      { path: "src/fictional.ts", startLine: 4, endLine: 5 },
      listing(["src/fictional.ts"]),
    )

    expect(excerpt).toEqual({
      kind: "lines",
      lines: [3, 4, 5, 6].map((number) => ({
        number,
        text: `架空の行 ${number}`,
        truncated: false,
      })),
    })
  })

  it("一覧に無いパスは、ファイルがあっても読まずに untracked", async () => {
    const cwd = fictionalWorkspace({ "untracked.txt": TEN_LINES })

    expect(
      await readFileExcerpt(
        cwd,
        { path: "untracked.txt", startLine: 1, endLine: 1 },
        listing(["src/fictional.ts"]),
      ),
    ).toEqual({ kind: "unavailable", reason: "untracked" })
    expect(
      await readFileExcerpt(
        cwd,
        { path: "../outside.txt", startLine: 1, endLine: 1 },
        listing(["src/fictional.ts"]),
      ),
    ).toEqual({ kind: "unavailable", reason: "untracked" })
  })

  it("指した行がファイルに無ければ out-of-range", async () => {
    const cwd = fictionalWorkspace({ "short.txt": TEN_LINES })

    expect(
      await readFileExcerpt(
        cwd,
        { path: "short.txt", startLine: 11, endLine: 11 },
        listing(["short.txt"]),
      ),
    ).toEqual({ kind: "out-of-range", lineCount: 10 })
  })

  it("上限より大きいファイルは読まずに too-large", async () => {
    const cwd = fictionalWorkspace({ "large.txt": "a".repeat(MAX_EXCERPT_FILE_BYTES + 1) })

    expect(
      await readFileExcerpt(
        cwd,
        { path: "large.txt", startLine: 1, endLine: 1 },
        listing(["large.txt"]),
      ),
    ).toEqual({ kind: "unavailable", reason: "too-large" })
  })

  it("NUL を含むファイルは binary", async () => {
    const cwd = fictionalWorkspace({ "image.bin": Buffer.from([0x89, 0x50, 0x00, 0x0a]) })

    expect(
      await readFileExcerpt(
        cwd,
        { path: "image.bin", startLine: 1, endLine: 1 },
        listing(["image.bin"]),
      ),
    ).toEqual({ kind: "unavailable", reason: "binary" })
  })

  it("一覧にあってもシンボリックリンク・ディレクトリ・無いファイルはたどらずに unreadable", async () => {
    const cwd = fictionalWorkspace({ "target.txt": TEN_LINES, "directory/inner.txt": TEN_LINES })
    symlinkSync(join(cwd, "target.txt"), join(cwd, "link.txt"))
    const tracked = listing(["link.txt", "directory", "deleted.txt"])

    for (const path of ["link.txt", "directory", "deleted.txt"]) {
      expect(await readFileExcerpt(cwd, { path, startLine: 1, endLine: 1 }, tracked)).toEqual({
        kind: "unavailable",
        reason: "unreadable",
      })
    }
  })
})
