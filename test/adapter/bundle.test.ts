import { describe, expect, it } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildStyleSheet, buildUiScript, bundleWithBun } from "../../src/adapter/bundle.ts"

// `bun build` を実際に起こす統合的なテスト。src/ui/ が壊れていないことも合わせて確かめる
// （本物のリポジトリのファイルを対象にする。CLI 起動を最後までしない test/index.test.ts と
// 同じ考え方で、ここは「組み立てられるか」までを見る）。
//
// **失敗の側は src/ui/ を壊さず、一時ディレクトリに書いた入口で確かめる。**

describe("buildUiScript", () => {
  it("src/ui/ を1本の JS にまとめて返す", async () => {
    const result = await buildUiScript()

    expect(result.ok).toBe(true)
    expect(result.ok ? result.content.length : 0).toBeGreaterThan(0)
  })
})

describe("buildStyleSheet", () => {
  it("src/ui/styles/ を1本の CSS にまとめて返す", async () => {
    const result = await buildStyleSheet()

    expect(result.ok).toBe(true)
    expect(result.ok ? result.content.length : 0).toBeGreaterThan(0)
  })
})

describe("bundleWithBun", () => {
  it("存在しない入口を渡すと、解決できなかったことを理由として返す", async () => {
    const result = await bundleWithBun("/tmp/tsukumo-does-not-exist.ts", 1024 * 1024)

    expect(result.ok).toBe(false)
    expect(result.ok ? "" : result.reason).toContain("tsukumo-does-not-exist.ts")
  })

  it("構文エラーの入口を渡すと、bun のエラー文を理由として返す", async () => {
    const entry = join(await mkdtemp(join(tmpdir(), "tsukumo-bundle-")), "broken.ts")
    await writeFile(entry, "export const broken = (\n")

    const result = await bundleWithBun(entry, 1024 * 1024)

    expect(result.ok).toBe(false)
    const reason = result.ok ? "" : result.reason
    expect(reason).toContain("error:")
    expect(reason).toContain("broken.ts")
  })
})
