// `develop/progress.md` 用のカスタムマージドライバ（git の `merge.<driver>.driver` から
// 呼ばれる薄い入口）。並行の作業ツリーから `main` へ送るとき、複数のセッションが
// 「## 完了したこと（このセッション）」の直下へ同じ位置に小節を差し込む動きがぶつかり続けている
// ため、この1ファイルだけ自前のドライバで3wayマージする。
//
// 割る・畳む処理そのものは `scripts/progress-done-section.ts` の純粋関数にあり、ここは
// ファイルを読んで渡し、結果を書き戻すだけ。「## 完了したこと」の外（前文・見出し自身から
// 最初の小節の直前まで・その節の次に来る `## ` 見出し以降）は普通の3way（`git merge-file`）に
// 任せる。
//
// 呼ばれ方: `<コマンド> %O %A %B`（git が実ファイルパスに置き換えて呼ぶ。%O=共通祖先、
// %A=マージ先＝結果を書く場所、%B=取り込む側）。
// 契約: 結果を %A に書き、衝突が残っていれば非0で終わる（git はそれを見てそのファイルを
// unmerged として扱う）。
//
// **登録はこのリポジトリでは行わない**（`.gitattributes` に `merge=progress` を置くだけ。
// `git config merge.progress.driver "bun run scripts/merge-progress.ts %O %A %B"` は人が打つ。
// 手順は T-405 が CLAUDE.md に書く）。

import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"

import { isObjectType } from "remeda"

import {
  buildSectionConflictText,
  joinDoneSections,
  mergeDoneSections,
  splitDoneSection,
} from "./progress-done-section.ts"

const USAGE = "使い方: merge-progress.ts <base> <ours> <theirs>（git のマージドライバとして呼ぶ）"

const [argBasePath, argOursPath, argTheirsPath] = process.argv.slice(2)
if (argBasePath === undefined || argOursPath === undefined || argTheirsPath === undefined) {
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}

process.exit(mergeProgressFile(argBasePath, argOursPath, argTheirsPath))

/**
 * 3ファイルを読み、マージした結果を ours（%A）に書いて終了コードを返す。
 * `0`: 衝突なくマージできた。`1`: 衝突が残った（%A には衝突マーカー入りの内容を書く）。
 */
function mergeProgressFile(basePath: string, oursPath: string, theirsPath: string): number {
  const baseText = readFileSync(basePath, "utf8")
  const oursText = readFileSync(oursPath, "utf8")
  const theirsText = readFileSync(theirsPath, "utf8")

  const baseSplit = splitDoneSection(baseText)
  const oursSplit = splitDoneSection(oursText)
  const theirsSplit = splitDoneSection(theirsText)

  if (baseSplit === undefined || oursSplit === undefined || theirsSplit === undefined) {
    // 「## 完了したこと」節がどれかに無い。畳む前提が崩れているので、ファイル全体を
    // 素の3wayに任せる（`git merge-file` が %A に直接書く）。
    return runGitMergeFileInPlace(oursPath, basePath, theirsPath)
  }

  const head = mergeTextWithGit(baseSplit.head, oursSplit.head, theirsSplit.head)
  const tail = mergeTextWithGit(baseSplit.tail, oursSplit.tail, theirsSplit.tail)
  const sections = mergeDoneSections(baseSplit.sections, oursSplit.sections, theirsSplit.sections)

  const sectionText =
    joinDoneSections(sections.sections) +
    sections.conflicts.map((conflict) => buildSectionConflictText(conflict)).join("")

  writeFileSync(oursPath, head.text + sectionText + tail.text)

  const hasConflict = head.conflict || tail.conflict || sections.conflicts.length > 0
  return hasConflict ? 1 : 0
}

/** ファイル全体を `git merge-file` の素の3wayに任せる。結果は ours（第1引数）へ直接書かれる。 */
function runGitMergeFileInPlace(oursPath: string, basePath: string, theirsPath: string): number {
  try {
    execFileSync("git", ["merge-file", oursPath, basePath, theirsPath], { stdio: "pipe" })
    return 0
  } catch {
    return 1
  }
}

/**
 * テキストの断片（節の前後）を `git merge-file` で3wayマージする。断片は実ファイルでは
 * ないので一時ファイルへ書き出し、`--stdout` で結果だけを受け取って元のファイルには
 * 影響させない。
 */
function mergeTextWithGit(
  baseText: string,
  oursText: string,
  theirsText: string,
): { readonly text: string; readonly conflict: boolean } {
  const dir = mkdtempSync(join(tmpdir(), "tsukumo-progress-merge-"))
  try {
    const tmpBasePath = join(dir, "base")
    const tmpOursPath = join(dir, "ours")
    const tmpTheirsPath = join(dir, "theirs")
    writeFileSync(tmpBasePath, baseText)
    writeFileSync(tmpOursPath, oursText)
    writeFileSync(tmpTheirsPath, theirsText)

    try {
      const text = execFileSync(
        "git",
        [
          "merge-file",
          "-p",
          "-L",
          "ours",
          "-L",
          "base",
          "-L",
          "theirs",
          tmpOursPath,
          tmpBasePath,
          tmpTheirsPath,
        ],
        { encoding: "utf8" },
      )
      return { text, conflict: false }
    } catch (error) {
      // 衝突があると `git merge-file` は非0で終わるが、衝突マーカー入りの結果自体は
      // stdout に出ている。捕まえた例外は prototype を持つので `isObjectType` で見て、
      // `stdout` があるときだけ読む（`docs/coding-standards.md`「型を迂回するキャストを
      // 使わない」）。
      const stdout = isObjectType(error) && "stdout" in error ? error.stdout : undefined
      return { text: typeof stdout === "string" ? stdout : "", conflict: true }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
