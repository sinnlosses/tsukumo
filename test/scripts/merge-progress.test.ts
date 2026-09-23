// `scripts/merge-progress.ts` を git のマージドライバと同じ呼ばれ方（`<base> <ours> <theirs>`）で
// 実際に起こし、%A（ours）へ書かれる中身と終了コードを確かめる。`deny-broad-kill.test.ts` と
// 同じく「スクリプトを実際に起こして契約（終了コードと書き戻し）を確かめる」形（判定だけを
// 取り出すと、契約そのものが抜ける）。

import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"

import { sampleProgressDoc, withEditedBody, withPrependedSection } from "../fixture/progress-doc.ts"

const SCRIPT_PATH = "scripts/merge-progress.ts"

describe("merge-progress ドライバ", () => {
  test("両側が足した小節はどちらも残り、節の外（未解決/注意）も保たれる", () => {
    const { code, ours } = runDriver(
      sampleProgressDoc(),
      withPrependedSection(sampleProgressDoc(), "2026-09-23", "ours追加（T-401）"),
      withPrependedSection(sampleProgressDoc(), "2026-09-22", "theirs追加（T-402）"),
    )

    expect(code).toBe(0)
    expect(ours).toContain("ours追加（T-401）")
    expect(ours).toContain("theirs追加（T-402）")
    expect(ours.indexOf("2026-09-23")).toBeLessThan(ours.indexOf("2026-09-22"))
    expect(ours).toContain("## 未解決")
    expect(ours).toContain("## 注意")
  })

  test("同じ小節を両側が書き換えたときは非0で終わり、衝突マーカーを書く", () => {
    const { code, ours } = runDriver(
      sampleProgressDoc(),
      withEditedBody(sampleProgressDoc(), "本文1。", "ours版。"),
      withEditedBody(sampleProgressDoc(), "本文1。", "theirs版。"),
    )

    expect(code).not.toBe(0)
    expect(ours).toContain("<<<<<<<")
    expect(ours).toContain("ours版。")
    expect(ours).toContain("theirs版。")
  })

  test("「## 完了したこと」が無いファイルは素の3wayに落ちる（衝突なしの例）", () => {
    const { code, ours } = runDriver(
      "line1\nline2\nline3\n",
      "line1-ours\nline2\nline3\n",
      "line1\nline2\nline3-theirs\n",
    )

    expect(code).toBe(0)
    expect(ours).toContain("line1-ours")
    expect(ours).toContain("line3-theirs")
  })

  test("「## 完了したこと」が無いファイルで同じ行を書き換えたときも非0で終わる", () => {
    const { code, ours } = runDriver("base\nline\n", "base\nours版\n", "base\ntheirs版\n")

    expect(code).not.toBe(0)
    expect(ours).toContain("<<<<<<<")
  })
})

function runDriver(
  base: string,
  ours: string,
  theirs: string,
): { readonly code: number; readonly ours: string } {
  const dir = mkdtempSync(join(tmpdir(), "tsukumo-merge-progress-driver-test-"))
  try {
    const basePath = join(dir, "base.md")
    const oursPath = join(dir, "ours.md")
    const theirsPath = join(dir, "theirs.md")
    writeFileSync(basePath, base)
    writeFileSync(oursPath, ours)
    writeFileSync(theirsPath, theirs)

    const code = spawnDriver(basePath, oursPath, theirsPath)
    return { code, ours: readFileSync(oursPath, "utf8") }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function spawnDriver(basePath: string, oursPath: string, theirsPath: string): number {
  try {
    execFileSync(process.execPath, [SCRIPT_PATH, basePath, oursPath, theirsPath], { stdio: "pipe" })
    return 0
  } catch (error) {
    const status = (error as { readonly status?: unknown }).status
    return typeof status === "number" ? status : -1
  }
}
