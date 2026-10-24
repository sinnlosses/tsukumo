import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

import {
  buildUiBundle,
  builtUiDir,
  readUiBundle,
} from "../../../../src/server/view-server/adapter/bundle.ts"

// `vite build` を実際に起こす統合的なテスト。src/browser/ が壊れていないことも合わせて確かめる
// （本物のリポジトリのファイルを対象にする。CLI 起動を最後までしない別のテストと
// 同じ考え方で、ここは「組み立てられるか」「置いたものを読めるか」までを見る）。
//
// 出し先は一時ディレクトリに取る（実物の dist/browser/ は書き換えない）。同じ `dist/browser/`
// を CLI 起動時に読む別のテストと並んで走ると、書き直している最中を読んで落ちる。

// 組み立てに数秒かかるので、読むだけの4件で1回の成果物を使う。
let builtDir: string
let built: Awaited<ReturnType<typeof buildUiBundle>>

beforeAll(async () => {
  builtDir = await temporaryDir()
  built = await buildUiBundle(builtDir)
})

describe("buildUiBundle", () => {
  it("src/browser/ を JS と CSS の1組にまとめ、指定した出し先に置く", () => {
    const result = built

    expect(result.ok).toBe(true)
    expect(result.ok ? result.bundle.uiScript.length : 0).toBeGreaterThan(0)
    expect(result.ok ? result.bundle.styleSheet.length : 0).toBeGreaterThan(0)
  })

  it("入口から import() で分けたチャンクを、入口かほかのチャンクが import する名前のまま持つ", () => {
    const result = built
    const scripts = result.ok ? [result.bundle.uiScript, ...result.bundle.chunks.values()] : []
    const chunkNames = result.ok ? [...result.bundle.chunks.keys()] : []

    expect(chunkNames.length).toBeGreaterThan(0)
    for (const name of chunkNames) {
      expect(scripts.some((script) => script.includes(`./${name}`))).toBe(true)
    }
  })

  it("CSS Modules の class 名が、CSS の選択子と JS の対応表に同じ綴りで入っている", () => {
    const result = built

    // `layout-grid` は
    // `components/page/conversation/components/conversation-layout/conversation-layout.module.css`
    // の class。組み立てるとハッシュ付きの名前になる。
    const selector = /\.(_?layout-grid_[\w-]+)/.exec(result.ok ? result.bundle.styleSheet : "")
    const hashedName = selector?.[1] ?? "（CSS に layout-grid の選択子が無い）"
    // minify した JS は文字列をバッククォートで書くことがある（`"` 固定では見つからない）。
    expect(result.ok ? result.bundle.uiScript : "").toMatch(new RegExp(`["'\`]${hashedName}["'\`]`))
  })
})

describe("readUiBundle", () => {
  it("置いてある成果物を、組み立て直さずにそのまま読む", async () => {
    const read = await readUiBundle(builtDir)

    expect(read.ok).toBe(true)
    expect(read.ok ? read.bundle.uiScript : "").toBe(built.ok ? built.bundle.uiScript : "")
    expect(read.ok ? read.bundle.styleSheet : "").toBe(built.ok ? built.bundle.styleSheet : "")
    expect(read.ok ? read.bundle.chunks : new Map()).toEqual(
      built.ok ? built.bundle.chunks : new Map([["（組み立てに失敗した）", ""]]),
    )
  })

  it("組み立てた直後は古くないと言う", async () => {
    const read = await readUiBundle(builtDir)

    expect(read.ok ? read.outdated : true).toBe(false)
  })
})

describe("builtUiDir", () => {
  it("起こす場所に依らず dist/browser を指す", () => {
    expect(builtUiDir().endsWith("/dist/browser")).toBe(true)
  })
})

/** 出し先。リポジトリの dist/browser/ を汚さないために分ける。 */
function temporaryDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "tsukumo-bundle-"))
}
