import { describe, expect, it } from "bun:test"

import {
  buildBrowserScript,
  buildStyleSheet,
  bundleWithBun,
} from "../../src/infrastructure/browser-bundle.ts"

// `bun build` を実際に起こす統合的なテスト。src/presentation/browser/ 及び
// src/presentation/style/ が壊れていないことも合わせて確かめる（本物のリポジトリの
// ファイルを対象にする。CLI 起動を最後までしない test/index.test.ts と同じ考え方で、
// ここは「組み立てられるか」までを見る）。

describe("buildBrowserScript", () => {
  it("src/presentation/browser/ を1本の JS にまとめて返す", async () => {
    const script = await buildBrowserScript()

    expect(script).toBeDefined()
    expect(script?.length).toBeGreaterThan(0)
  })
})

describe("buildStyleSheet", () => {
  it("src/presentation/style/ を1本の CSS にまとめて返す", async () => {
    const styleSheet = await buildStyleSheet()

    expect(styleSheet).toBeDefined()
    expect(styleSheet?.length).toBeGreaterThan(0)
  })
})

describe("bundleWithBun", () => {
  it("存在しない入口を渡すと undefined を返す（呼び出し側が起動を止める）", async () => {
    const result = await bundleWithBun("/tmp/tsukumo-does-not-exist.ts", 1024 * 1024)

    expect(result).toBeUndefined()
  })
})
