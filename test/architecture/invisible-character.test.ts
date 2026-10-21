// 見えない文字（ゼロ幅スペースなど）が、意図せずファイルに実体で入っていないことの検査。

import { readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { runSubprocessOrThrow } from "../fixture/subprocess.ts"

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "")
const SCANNED_DIRECTORIES = ["src", "test", "scripts", "docs", ".claude"]
const INVISIBLE_CODE_POINTS: ReadonlySet<number> = new Set([0x200b, 0x200c, 0x200d, 0xfeff])

/** 見えない文字そのものを入力や期待値にしているファイル → 理由。 */
const ALLOWED_FILES: Readonly<Record<string, string>> = {
  "test/server/session-driver/core/sdk-message.test.ts":
    "ゼロ幅スペースと BOM を含む入力を正規化する検証",
  "test/shared/session/session-advance-speech.test.ts":
    "ゼロ幅スペースだけのセリフを空として扱う検証",
}

const FIX_HINT = "エスケープで書いたつもりなら、実体になっている。Edit・Write で書き直す"

type Occurrence = { readonly line: number; readonly codePoint: number }

describe("見えない文字", () => {
  it("許す場所の一覧に無い追跡ファイルに、実体で入っていない", async () => {
    const listing = await runSubprocessOrThrow(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...SCANNED_DIRECTORIES],
      { cwd: REPOSITORY_ROOT },
    )
    const found = listing
      .split("\n")
      .filter((path) => path !== "" && !(path in ALLOWED_FILES))
      .flatMap((path) => describeOccurrences(path))

    expect(found, FIX_HINT).toEqual([])
  })

  it("許す場所の一覧のファイルは、実際に見えない文字を含む", () => {
    const stale = Object.keys(ALLOWED_FILES).filter(
      (path) =>
        findInvisibleCharacters(readFileSync(`${REPOSITORY_ROOT}/${path}`, "utf8")).length === 0,
    )

    expect(stale).toEqual([])
  })

  it.each([0x200b, 0x200c, 0x200d, 0xfeff])("コードポイント %d を行と共に拾う", (codePoint) => {
    const text = `abc\nde${String.fromCodePoint(codePoint)}f\n`

    expect(findInvisibleCharacters(text)).toEqual([{ line: 2, codePoint }])
  })

  it("同じ行の複数と、複数行を順に返す", () => {
    const zwsp = String.fromCodePoint(0x200b)
    const bom = String.fromCodePoint(0xfeff)

    expect(findInvisibleCharacters(`${bom}a${zwsp}\n\n${zwsp}`)).toEqual([
      { line: 1, codePoint: 0xfeff },
      { line: 1, codePoint: 0x200b },
      { line: 3, codePoint: 0x200b },
    ])
  })

  it("普通の文字列・日本語・改行だけの文字列では空を返す", () => {
    expect(findInvisibleCharacters("plain text")).toEqual([])
    expect(findInvisibleCharacters("日本語の文。\n次の行　全角スペース")).toEqual([])
    expect(findInvisibleCharacters("\n\n\n")).toEqual([])
    expect(findInvisibleCharacters("")).toEqual([])
  })
})

/** 画像などのバイナリ（NUL を含む）と、ファイルでないものは空を返す。 */
function describeOccurrences(path: string): readonly string[] {
  const absolute = `${REPOSITORY_ROOT}/${path}`
  if (!statSync(absolute, { throwIfNoEntry: false })?.isFile()) return []
  const text = readFileSync(absolute, "utf8")
  if (text.includes("\u0000")) return []
  return findInvisibleCharacters(text).map(
    ({ line, codePoint }) =>
      `${path}:${line} U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
  )
}

/** 文字列に入っている見えない文字の位置（行は1始まり）を、出てくる順に返す。 */
function findInvisibleCharacters(text: string): readonly Occurrence[] {
  return text.split("\n").flatMap((lineText, index) =>
    [...lineText].flatMap((char) => {
      const codePoint = char.codePointAt(0) ?? 0
      return INVISIBLE_CODE_POINTS.has(codePoint) ? [{ line: index + 1, codePoint }] : []
    }),
  )
}
