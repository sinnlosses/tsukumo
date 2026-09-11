import { describe, expect, it } from "bun:test"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { bundledFilePath, resolveBundledDir } from "../src/bundled-files.ts"

describe("bundledFilePath", () => {
  it("tsukumo 自身の場所（リポジトリのルート）からの相対で解く", () => {
    const path = bundledFilePath("characters", "tsukumo-spirit")

    // このテストファイル自身（test/）から見たリポジトリのルートで組み立て、一致することを確かめる。
    // src/bundled-files.ts の実装（import.meta.url からの相対）とは別の経路で同じ値を作る。
    const repoRoot = fileURLToPath(new URL("..", import.meta.url))
    expect(path).toBe(join(repoRoot, "characters", "tsukumo-spirit"))
  })
})

describe("resolveBundledDir", () => {
  const defaultSegments = ["characters", "tsukumo-spirit"]

  it("上書きが絶対パスならそのまま使う", () => {
    const result = resolveBundledDir("/tmp/some-characters", "/somewhere/project", defaultSegments)

    expect(result).toBe("/tmp/some-characters")
  })

  it("上書きが相対パスなら cwd 相対で解く", () => {
    const result = resolveBundledDir("characters/local", "/somewhere/project", defaultSegments)

    expect(result).toBe(join("/somewhere/project", "characters/local"))
  })

  it("上書きが無ければ tsukumo 自身の場所の既定になる（cwd には依存しない）", () => {
    const result = resolveBundledDir(undefined, "/somewhere/project", defaultSegments)

    expect(result).toBe(bundledFilePath(...defaultSegments))
    expect(result).not.toContain("/somewhere/project")
  })

  it("上書きが空文字・空白だけのときも既定になる", () => {
    expect(resolveBundledDir("", "/somewhere/project", defaultSegments)).toBe(
      bundledFilePath(...defaultSegments),
    )
    expect(resolveBundledDir("   ", "/somewhere/project", defaultSegments)).toBe(
      bundledFilePath(...defaultSegments),
    )
  })
})
