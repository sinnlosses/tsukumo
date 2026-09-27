import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  buildUiBundle,
  builtUiDir,
  bundleWithVite,
  readUiBundle,
} from "../../../../src/server/view-server/adapter/bundle.ts"

// `vite build` を実際に起こす統合的なテスト。src/browser/ が壊れていないことも合わせて確かめる
// （本物のリポジトリのファイルを対象にする。CLI 起動を最後までしない test/cli.test.ts と
// 同じ考え方で、ここは「組み立てられるか」「置いたものを読めるか」までを見る）。
//
// 出し先は一時ディレクトリに取る（実物の dist/browser/ は書き換えない）。同じ `dist/browser/`
// を CLI 起動時に読む test/cli.test.ts と並んで走ると、書き直している最中を読んで落ちる。
//
// 失敗の側は src/browser/ を壊さず、一時ディレクトリに書いた入口（`main.tsx`）で確かめる。

describe("buildUiBundle", () => {
  it("src/browser/ を JS と CSS の1組にまとめ、指定した出し先に置く", async () => {
    const result = await buildUiBundle(await temporaryDir())

    expect(result.ok).toBe(true)
    expect(result.ok ? result.bundle.uiScript.length : 0).toBeGreaterThan(0)
    expect(result.ok ? result.bundle.styleSheet.length : 0).toBeGreaterThan(0)
  })

  it("CSS Modules の class 名が、CSS の選択子と JS の対応表に同じ綴りで入っている", async () => {
    const result = await buildUiBundle(await temporaryDir())

    // `layout-grid` は
    // `components/page/conversation/components/conversation-layout/conversation-layout.module.css`
    // の class。組み立てるとハッシュ付きの名前になる。
    const selector = /\.(_?layout-grid_[\w-]+)/.exec(result.ok ? result.bundle.styleSheet : "")
    const hashedName = selector?.[1] ?? "（CSS に layout-grid の選択子が無い）"
    expect(result.ok ? result.bundle.uiScript : "").toContain(`"${hashedName}"`)
  })
})

describe("readUiBundle", () => {
  it("置いてある成果物を、組み立て直さずにそのまま読む", async () => {
    const outDir = await temporaryDir()
    const built = await buildUiBundle(outDir)
    const read = await readUiBundle(outDir)

    expect(read.ok).toBe(true)
    expect(read.ok ? read.bundle.uiScript : "").toBe(built.ok ? built.bundle.uiScript : "")
    expect(read.ok ? read.bundle.styleSheet : "").toBe(built.ok ? built.bundle.styleSheet : "")
  })

  it("組み立てた直後は古くないと言う", async () => {
    const outDir = await temporaryDir()
    await buildUiBundle(outDir)

    const read = await readUiBundle(outDir)

    expect(read.ok ? read.outdated : true).toBe(false)
  })
})

describe("builtUiDir", () => {
  it("起こす場所に依らず dist/browser を指す", () => {
    expect(builtUiDir().endsWith("/dist/browser")).toBe(true)
  })
})

describe("bundleWithVite", () => {
  it("入口の無い置き場を渡すと、入口を解決できなかったことを理由として返す", async () => {
    const result = await bundleWithVite("/tmp/tsukumo-does-not-exist", await temporaryDir())

    expect(result.ok).toBe(false)
    expect(result.ok ? "" : result.reason).toContain("main.tsx")
  })

  it("構文エラーの入口を渡すと、vite のエラー文を色とスタックを除いて理由として返す", async () => {
    const sourceDir = await temporaryDir()
    await writeFile(join(sourceDir, "main.tsx"), "export const broken = (\n")

    const result = await bundleWithVite(sourceDir, await temporaryDir())

    expect(result.ok).toBe(false)
    const reason = result.ok ? "" : result.reason
    expect(reason).toContain("main.tsx:1:")
    expect(reason).not.toContain("\u001b[")
    expect(reason).not.toMatch(/^\s+at /m)
  })

  it("CSS を持たない入口では、対が揃わなかったことを理由として返す", async () => {
    const sourceDir = await temporaryDir()
    await writeFile(join(sourceDir, "main.tsx"), "export const value = 1\n")

    const result = await bundleWithVite(sourceDir, await temporaryDir())

    expect(result.ok).toBe(false)
    expect(result.ok ? "" : result.reason).toContain("対")
  })
})

/** 出し先（と、壊れた入口の置き場）。リポジトリの dist/browser/ を汚さないために分ける。 */
function temporaryDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "tsukumo-bundle-"))
}
