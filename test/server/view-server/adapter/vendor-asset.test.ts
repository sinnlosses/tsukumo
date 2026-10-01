import { describe, expect, it } from "vitest"

import { createVendorAssetReader } from "../../../../src/server/view-server/adapter/vendor-asset.ts"
import { VENDOR_ASSET_CONTENT_TYPES } from "../../../../src/shared/view-server/vendor-asset.ts"

const readVendorAsset = createVendorAssetReader()

describe("createVendorAssetReader の覚え方", () => {
  it("同じ名前は2回目以降ディスクを読み直さず、同じ中身を返す", () => {
    const reads: string[] = []
    const read = createVendorAssetReader((path) => {
      reads.push(path)
      return Buffer.from("x")
    })

    const first = read("mermaid.min.js")
    const second = read("mermaid.min.js")

    expect(reads).toHaveLength(1)
    expect(second).toBe(first)
  })

  it("別の名前は別に読む", () => {
    const reads: string[] = []
    const read = createVendorAssetReader((path) => {
      reads.push(path)
      return Buffer.from("x")
    })

    read("mermaid.min.js")
    read("chart.umd.min.js")

    expect(reads).toHaveLength(2)
  })

  it("読めなかった名前は覚えず、次の呼びで読み直す", () => {
    let attempts = 0
    const read = createVendorAssetReader(() => {
      attempts += 1
      return attempts === 1 ? undefined : Buffer.from("x")
    })

    expect(read("mermaid.min.js")).toBeUndefined()
    expect(read("mermaid.min.js")?.content.toString("utf8")).toBe("x")
    expect(attempts).toBe(2)
  })

  it("allowlist に無い名前は読み取りを呼ばずに undefined", () => {
    let attempts = 0
    const read = createVendorAssetReader(() => {
      attempts += 1
      return Buffer.from("x")
    })

    expect(read("other.js")).toBeUndefined()
    expect(attempts).toBe(0)
  })
})

// 配る名前（shared）と `node_modules` の中のファイル（adapter）は別のファイルに分かれている
// ので、allowlist の側から全件を辿って片方だけ足した・パッケージが版を上げてファイルの
// 場所が変わった、を落とす。本物の `node_modules` を読む（依存が入っていることは
// `pnpm install` 済みの前提。docs/coding-standards.md「テスト」）。
describe("readVendorAsset", () => {
  it("allowlist に載っている名前はすべて node_modules から読める", () => {
    const names = Object.keys(VENDOR_ASSET_CONTENT_TYPES)
    expect(names.length).toBeGreaterThan(0)

    const unreadable = names.filter((name) => readVendorAsset(name) === undefined)

    expect(unreadable).toEqual([])
  })

  it("allowlist の Content-Type をそのまま付けて、空でない中身を返す", () => {
    for (const [name, contentType] of Object.entries(VENDOR_ASSET_CONTENT_TYPES)) {
      const asset = readVendorAsset(name)

      expect(asset?.contentType).toBe(contentType)
      expect(asset?.content.length ?? 0).toBeGreaterThan(1000)
    }
  })

  it("mermaid は UMD（グローバルに `mermaid` を置くもの）を配る", () => {
    const asset = readVendorAsset("mermaid.min.js")

    // ブラウザ側は `<script src>` で読んでグローバルの `mermaid` を使う
    // （`src/browser/types/vendor-global.d.ts`）ので、ESM 版を配ると
    // 読めても何も生えない。
    expect(asset?.content.toString("utf8")).toContain("mermaid")
    expect(asset?.content.toString("utf8", 0, 200)).not.toContain("import")
  })

  it("allowlist に無い名前・パスを含む名前は読まない", () => {
    expect(readVendorAsset("other.js")).toBeUndefined()
    expect(readVendorAsset("../package.json")).toBeUndefined()
    expect(readVendorAsset("mermaid/dist/mermaid.min.js")).toBeUndefined()
  })
})
