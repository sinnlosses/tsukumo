import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { readUiBundle } from "../../../../src/server/view-server/adapter/bundle.ts"
import { runViteBuild } from "../../../../src/server/view-server/adapter/vite-build.ts"

// `vite build` を実際に起こす。src/browser/ を壊さず、一時ディレクトリに書いた入口ファイルで失敗の側を確かめる。

describe("runViteBuild", () => {
  it("入口の無い置き場を渡すと、入口を解決できなかったことを理由として返す", async () => {
    const failure = await runViteBuild("/tmp/tsukumo-does-not-exist", await temporaryDir())

    expect(failure?.reason).toContain("main.tsx")
  })

  it("構文エラーの入口を渡すと、vite のエラー文を色とスタックを除いて理由として返す", async () => {
    const sourceDir = await temporaryDir()
    await writeFile(join(sourceDir, "main.tsx"), "export const broken = (\n")

    const reason = (await runViteBuild(sourceDir, await temporaryDir()))?.reason ?? ""

    expect(reason).toMatch(/main\.tsx:\d+:\d+/)
    expect(reason).not.toContain("\u001b[")
    expect(reason).not.toMatch(/^\s+at /m)
  })

  it("CSS を持たない入口は組み立てが通っても対が揃わず、出し先を読むと対が無いことを理由として返す", async () => {
    const sourceDir = await temporaryDir()
    const outDir = await temporaryDir()
    await writeFile(join(sourceDir, "main.tsx"), "export const value = 1\n")

    expect(await runViteBuild(sourceDir, outDir)).toBeUndefined()
    const read = await readUiBundle(outDir)

    expect(read.ok).toBe(false)
    expect(read.ok ? "" : read.reason).toContain("対")
  })
})

/** 出し先と、壊れた入口の置き場。リポジトリの dist/browser/ を汚さないために分ける。 */
function temporaryDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "tsukumo-vite-build-"))
}
