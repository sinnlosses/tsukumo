import { describe, expect, it } from "bun:test"

import { readVendorAsset } from "../../src/adapter/vendor-asset.ts"
import { VENDOR_ASSET_CONTENT_TYPES } from "../../src/shared/vendor-asset.ts"

// 配る名前（shared）と `node_modules` の中のファイル（adapter）は別のファイルに分かれている
// ので、**allowlist の側から全件を辿って**片方だけ足した・パッケージが版を上げてファイルの
// 場所が変わった、を落とす。本物の `node_modules` を読む（依存が入っていることは
// `bun install` 済みの前提。docs/coding-standards.md「テスト」）。
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
    // （`src/browser/features/main-view/markdown/vendor-globals.d.ts`）ので、ESM 版を配ると
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
