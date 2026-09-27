import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { sourceFingerprint } from "../../../../src/server/view-server/adapter/source-fingerprint.ts"

// 開発サーバつきの起動（`pnpm run dev`）で、画面へ差分を当ててよいかを決める指紋。
// 一時ディレクトリに `browser/` と `shared/` を模した木を作って確かめる。

describe("sourceFingerprint", () => {
  it("中身が同じなら同じ指紋になる", async () => {
    const root = await sourceTree()

    expect(await sourceFingerprint(root, ["browser"])).toBe(
      await sourceFingerprint(root, ["browser"]),
    )
  })

  it("除いていない置き場のファイルが変わると、指紋が変わる", async () => {
    const root = await sourceTree()
    const before = await sourceFingerprint(root, ["browser"])

    await writeFile(join(root, "shared", "frame.ts"), "export const PROTOCOL_VERSION = 6\n")

    expect(await sourceFingerprint(root, ["browser"])).not.toBe(before)
  })

  it("ファイルが増えても指紋が変わる", async () => {
    const root = await sourceTree()
    const before = await sourceFingerprint(root, ["browser"])

    await writeFile(join(root, "shared", "added.ts"), "export {}\n")

    expect(await sourceFingerprint(root, ["browser"])).not.toBe(before)
  })

  it("除いた置き場（browser）のファイルが変わっても、指紋は変わらない", async () => {
    const root = await sourceTree()
    const before = await sourceFingerprint(root, ["browser"])

    await writeFile(join(root, "browser", "main.tsx"), "export const edited = true\n")

    expect(await sourceFingerprint(root, ["browser"])).toBe(before)
  })

  it("置き場が読めなければ undefined を返す（分からないものを「変わった」と言わない）", async () => {
    const root = join(await sourceTree(), "missing")

    expect(await sourceFingerprint(root, ["browser"])).toBeUndefined()
  })
})

async function sourceTree(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tsukumo-fingerprint-"))
  await mkdir(join(root, "browser"))
  await mkdir(join(root, "shared"))
  await writeFile(join(root, "browser", "main.tsx"), "export const edited = false\n")
  await writeFile(join(root, "shared", "frame.ts"), "export const PROTOCOL_VERSION = 5\n")
  await writeFile(join(root, "main.ts"), "export {}\n")
  return root
}
