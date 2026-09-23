// `scripts/merge-progress.ts` を**本物の `git merge`** から実際に起こして確かめる。
// 他のテストは「ドライバを直接呼ぶ」だけなので、`.gitattributes` の `merge=<driver>` と
// `git config merge.<driver>.driver` の組み合わせで**git がこのドライバを実際に選ぶ**ところは
// 別に確かめる必要がある（T-404「解くべき論点」）。
//
// **登録はこの一時リポジトリの中だけ**で行う（`git init` した使い捨てのディレクトリの
// `.git/config` に書く）。このリポジトリ自身の `.git/config`には一切触らない。

import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import process from "node:process"

import { sampleProgressDoc, withPrependedSection } from "../fixture/progress-doc.ts"

describe("merge-progress ドライバを git merge から実際に起こす", () => {
  test("両側が別々の小節を足したブランチは、衝突なくマージされ両方残る", () => {
    const dir = mkdtempSync(join(tmpdir(), "tsukumo-merge-progress-git-test-"))
    try {
      const driverPath = resolve(process.cwd(), "scripts/merge-progress.ts")

      run(dir, ["init", "-q", "-b", "main"])
      run(dir, ["config", "user.email", "test@example.invalid"])
      run(dir, ["config", "user.name", "tsukumo test"])
      // このリポジトリの .git/config には書かない。今つくった使い捨てリポジトリの中だけ。
      run(dir, [
        "config",
        "merge.progress.driver",
        `"${process.execPath}" "${driverPath}" %O %A %B`,
      ])
      writeFileSync(join(dir, ".gitattributes"), "progress.md merge=progress\n")
      writeFileSync(join(dir, "progress.md"), sampleProgressDoc())
      run(dir, ["add", "."])
      run(dir, ["commit", "-q", "-m", "base"])

      run(dir, ["switch", "-q", "-c", "ours"])
      writeFileSync(
        join(dir, "progress.md"),
        withPrependedSection(sampleProgressDoc(), "2026-09-23", "ours追加（T-401）"),
      )
      run(dir, ["commit", "-aq", "-m", "ours が小節を足した"])

      run(dir, ["switch", "-q", "-c", "theirs", "main"])
      writeFileSync(
        join(dir, "progress.md"),
        withPrependedSection(sampleProgressDoc(), "2026-09-22", "theirs追加（T-402）"),
      )
      run(dir, ["commit", "-aq", "-m", "theirs が小節を足した"])

      run(dir, ["switch", "-q", "ours"])
      // 衝突すれば非0で例外になる。ここでは「衝突しない」こと自体も確かめる。
      run(dir, ["merge", "-q", "--no-edit", "theirs"])

      const status = run(dir, ["status", "--porcelain"])
      expect(status.trim()).toBe("")

      const merged = readFileSync(join(dir, "progress.md"), "utf8")
      expect(merged).not.toContain("<<<<<<<")
      expect(merged).toContain("ours追加（T-401）")
      expect(merged).toContain("theirs追加（T-402）")
      expect(merged.indexOf("2026-09-23")).toBeLessThan(merged.indexOf("2026-09-22"))
      expect(merged).toContain("## 未解決")
      expect(merged).toContain("## 注意")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

function run(dir: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd: dir, encoding: "utf8" })
}
