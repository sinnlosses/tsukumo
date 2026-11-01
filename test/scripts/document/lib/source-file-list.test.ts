import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { listSourcePaths } from "../../../../scripts/document/lib/source-file-list.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

// このファイル自身も拾われる側なので、リポジトリのパスは区切りごとに分けて組み立てる。
const TEST = "test"
const E2E = "e2e"

describe("読む対象の一覧", () => {
  const tempDir = useTempDir("source-file-list")

  it("test/e2e/output/ の下は一覧に載らず、同じ名前の別の場所は載る", () => {
    const root = tempDir()
    const files = [
      join(TEST, E2E, "output", "playwright", "a.json"),
      join(TEST, E2E, "other", "b.json"),
      join("docs", "c.md"),
    ]
    for (const file of files) {
      mkdirSync(join(root, file, ".."), { recursive: true })
      writeFileSync(join(root, file), "{}\n")
    }
    expect(listSourcePaths(root)).toEqual([
      join("docs", "c.md"),
      join(TEST, E2E, "other", "b.json"),
    ])
  })
})
