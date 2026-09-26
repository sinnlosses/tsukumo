import { describe, expect, it } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  buildUiBundle,
  builtUiDir,
  bundleWithBun,
  readUiBundle,
} from "../../../../src/server/view-server/adapter/bundle.ts"

// `bun build` を実際に起こす統合的なテスト。src/browser/ が壊れていないことも合わせて確かめる
// （本物のリポジトリのファイルを対象にする。CLI 起動を最後までしない test/cli.test.ts と
// 同じ考え方で、ここは「組み立てられるか」「置いたものを読めるか」までを見る）。
//
// **`buildUiBundle` は `dist/browser/` を出し直す**（`.gitignore` してある成果物の置き場）。
// つまり `bun run check` を通すと成果物も新しくなる — 頼ってよい副作用ではないが、黙って
// 起きると驚くので書いておく。
//
// **失敗の側は src/browser/ を壊さず、一時ディレクトリに書いた入口で確かめる。**

describe("buildUiBundle", () => {
  it("src/browser/ を JS と CSS の1組にまとめ、dist/browser/ に置く", async () => {
    const result = await buildUiBundle()

    expect(result.ok).toBe(true)
    expect(result.ok ? result.bundle.uiScript.length : 0).toBeGreaterThan(0)
    expect(result.ok ? result.bundle.styleSheet.length : 0).toBeGreaterThan(0)
  })

  it("CSS Modules の class 名が、CSS と JS の対応表の両方に入っている", async () => {
    const result = await buildUiBundle()

    // `layout-grid` は
    // `components/page/conversation/components/conversation-layout/conversation-layout.module.css`
    // の class。組み立てると
    // ハッシュ付きの名前になり、**同じ名前が CSS 側の選択子と JS 側の対応表の両方に**出る。
    expect(result.ok ? result.bundle.styleSheet : "").toContain("layout-grid")
    expect(result.ok ? result.bundle.uiScript : "").toContain("layout-grid")
  })
})

describe("readUiBundle", () => {
  it("置いてある成果物を、組み立て直さずにそのまま読む", async () => {
    const built = await buildUiBundle()
    const read = await readUiBundle()

    expect(read.ok).toBe(true)
    expect(read.ok ? read.bundle.uiScript : "").toBe(built.ok ? built.bundle.uiScript : "")
    expect(read.ok ? read.bundle.styleSheet : "").toBe(built.ok ? built.bundle.styleSheet : "")
  })

  it("組み立てた直後は古くないと言う", async () => {
    await buildUiBundle()

    const read = await readUiBundle()

    expect(read.ok ? read.outdated : true).toBe(false)
  })
})

describe("builtUiDir", () => {
  it("起こす場所に依らず dist/browser を指す", () => {
    expect(builtUiDir().endsWith("/dist/browser")).toBe(true)
  })
})

describe("bundleWithBun", () => {
  it("存在しない入口を渡すと、解決できなかったことを理由として返す", async () => {
    const result = await bundleWithBun("/tmp/tsukumo-does-not-exist.ts", await temporaryOutDir())

    expect(result.ok).toBe(false)
    expect(result.ok ? "" : result.reason).toContain("tsukumo-does-not-exist.ts")
  })

  it("構文エラーの入口を渡すと、bun のエラー文を理由として返す", async () => {
    const entry = join(await temporaryOutDir(), "broken.ts")
    await writeFile(entry, "export const broken = (\n")

    const result = await bundleWithBun(entry, await temporaryOutDir())

    expect(result.ok).toBe(false)
    const reason = result.ok ? "" : result.reason
    expect(reason).toContain("error:")
    expect(reason).toContain("broken.ts")
  })

  it("CSS を持たない入口では、対が揃わなかったことを理由として返す", async () => {
    const entry = join(await temporaryOutDir(), "no-style.ts")
    await writeFile(entry, "export const value = 1\n")

    const result = await bundleWithBun(entry, await temporaryOutDir())

    expect(result.ok).toBe(false)
    expect(result.ok ? "" : result.reason).toContain("対")
  })
})

/** 出し先（と、壊れた入口の置き場）。**リポジトリの dist/browser/ を汚さない**ために分ける。 */
function temporaryOutDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "tsukumo-bundle-"))
}
