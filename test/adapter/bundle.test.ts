import { describe, expect, it } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildUiBundle, bundleWithBun } from "../../src/adapter/bundle.ts"

// `bun build` を実際に起こす統合的なテスト。src/ui/ が壊れていないことも合わせて確かめる
// （本物のリポジトリのファイルを対象にする。CLI 起動を最後までしない test/cli.test.ts と
// 同じ考え方で、ここは「組み立てられるか」までを見る）。
//
// **失敗の側は src/ui/ を壊さず、一時ディレクトリに書いた入口で確かめる。**

describe("buildUiBundle", () => {
  it("src/ui/ を JS と CSS の1組にまとめて返す", async () => {
    const result = await buildUiBundle()

    expect(result.ok).toBe(true)
    expect(result.ok ? result.bundle.uiScript.length : 0).toBeGreaterThan(0)
    expect(result.ok ? result.bundle.styleSheet.length : 0).toBeGreaterThan(0)
  })

  it("CSS Modules の class 名が、CSS と JS の対応表の両方に入っている", async () => {
    const result = await buildUiBundle()

    // `layout-grid` は `features/layout/layout.module.css` の class。組み立てると
    // ハッシュ付きの名前になり、**同じ名前が CSS 側の選択子と JS 側の対応表の両方に**出る。
    expect(result.ok ? result.bundle.styleSheet : "").toContain("layout-grid")
    expect(result.ok ? result.bundle.uiScript : "").toContain("layout-grid")
  })
})

describe("bundleWithBun", () => {
  it("存在しない入口を渡すと、解決できなかったことを理由として返す", async () => {
    const result = await bundleWithBun("/tmp/tsukumo-does-not-exist.ts")

    expect(result.ok).toBe(false)
    expect(result.ok ? "" : result.reason).toContain("tsukumo-does-not-exist.ts")
  })

  it("構文エラーの入口を渡すと、bun のエラー文を理由として返す", async () => {
    const entry = join(await mkdtemp(join(tmpdir(), "tsukumo-bundle-")), "broken.ts")
    await writeFile(entry, "export const broken = (\n")

    const result = await bundleWithBun(entry)

    expect(result.ok).toBe(false)
    const reason = result.ok ? "" : result.reason
    expect(reason).toContain("error:")
    expect(reason).toContain("broken.ts")
  })

  it("CSS を持たない入口では、対が揃わなかったことを理由として返す", async () => {
    const entry = join(await mkdtemp(join(tmpdir(), "tsukumo-bundle-")), "no-style.ts")
    await writeFile(entry, "export const value = 1\n")

    const result = await bundleWithBun(entry)

    expect(result.ok).toBe(false)
    expect(result.ok ? "" : result.reason).toContain("対")
  })
})
