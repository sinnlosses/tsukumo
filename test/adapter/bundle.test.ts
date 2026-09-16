import { describe, expect, it } from "bun:test"

import { buildStyleSheet, buildUiScript, bundleWithBun } from "../../src/adapter/bundle.ts"

// `bun build` を実際に起こす統合的なテスト。src/ui/ が壊れていないことも合わせて確かめる
// （本物のリポジトリのファイルを対象にする。CLI 起動を最後までしない test/index.test.ts と
// 同じ考え方で、ここは「組み立てられるか」までを見る）。

describe("buildUiScript", () => {
  it("src/ui/ を1本の JS にまとめて返す", async () => {
    const script = await buildUiScript()

    expect(script).toBeDefined()
    expect(script?.length).toBeGreaterThan(0)
  })
})

describe("buildStyleSheet", () => {
  it("src/ui/style/ を1本の CSS にまとめて返す", async () => {
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
