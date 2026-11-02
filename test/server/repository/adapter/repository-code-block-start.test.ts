import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { codeBlockStartLine } from "../../../../src/server/report/core/rules/block/code-match.ts"
import { readCodeBlockStart } from "../../../../src/server/repository/adapter/repository-code-block-start.ts"

function fictionalWorkspace(files: Readonly<Record<string, string | Buffer>>): string {
  const cwd = mkdtempSync(join(tmpdir(), "tsukumo-code-block-start-"))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(cwd, path, ".."), { recursive: true })
    writeFileSync(join(cwd, path), content)
  }
  return cwd
}

function listing(paths: readonly string[]): () => Promise<readonly string[]> {
  return async () => paths
}

const FILE = Array.from({ length: 10 }, (_, index) => `架空の行 ${String(index + 1)}`).join("\n")
const BLOCK = { language: "ts", source: "架空の行 4\n架空の行 5\n" }

describe("readCodeBlockStart", () => {
  it("管理下のファイルの連続した一部なら、頭の行を返す", async () => {
    const cwd = fictionalWorkspace({ "src/a.ts": FILE })

    expect(
      await readCodeBlockStart(
        cwd,
        { path: "src/a.ts", ...BLOCK },
        listing(["src/a.ts"]),
        codeBlockStartLine,
      ),
    ).toEqual({ kind: "line", startLine: 4 })
  })

  it("決められない中身は unknown", async () => {
    const cwd = fictionalWorkspace({ "src/a.ts": FILE })

    expect(
      await readCodeBlockStart(
        cwd,
        { path: "src/a.ts", language: "ts", source: "無い行" },
        listing(["src/a.ts"]),
        codeBlockStartLine,
      ),
    ).toEqual({ kind: "unknown" })
  })

  it("一覧に無いパス・外へ出るパスは、ファイルがあっても読まずに unknown", async () => {
    const cwd = fictionalWorkspace({ "untracked.ts": FILE })

    for (const path of ["untracked.ts", "../outside.ts"]) {
      expect(
        await readCodeBlockStart(
          cwd,
          { path, ...BLOCK },
          listing(["src/a.ts"]),
          codeBlockStartLine,
        ),
      ).toEqual({ kind: "unknown" })
    }
  })

  it("上限より大きい・バイナリ・リンク・ディレクトリ・無いファイルは unknown", async () => {
    const cwd = fictionalWorkspace({
      "large.ts": `${FILE}\n${"a".repeat(1024 * 1024 + 1)}`,
      "image.bin": Buffer.from([0x89, 0x50, 0x00, 0x0a]),
      "target.ts": FILE,
      "directory/inner.ts": FILE,
    })
    symlinkSync(join(cwd, "target.ts"), join(cwd, "link.ts"))
    const tracked = listing(["large.ts", "image.bin", "link.ts", "directory", "deleted.ts"])

    for (const path of ["large.ts", "image.bin", "link.ts", "directory", "deleted.ts"]) {
      expect(
        await readCodeBlockStart(cwd, { path, ...BLOCK }, tracked, codeBlockStartLine),
      ).toEqual({ kind: "unknown" })
    }
  })
})
