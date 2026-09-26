// `scripts/section-reference.ts` の拾う・照らす純粋関数を、小さな本文で検証する。
// リポジトリ全体で0件を保つのは `test/section-reference.test.ts` の役目。
//
// このファイル自身も拾われる側なので、参照の形の文字列はファイル名を定数に分けて組み立てる
// （ソースに `docs/<名前>.md「…」` の形がそのまま現れないようにする）。

import { describe, expect, test } from "bun:test"

import {
  findSectionReferences,
  findStrayReferences,
  formatStrayReference,
  isScannedSource,
} from "../../scripts/section-reference.ts"

const DISPLAY = "docs/display.md"
const RESEARCH = "docs/research/topic.md"
const HISTORY = "docs/history/tasks.md"
const CLAUDE = "CLAUDE.md"
const GONE = "docs/gone.md"

function phrasesOf(text: string): string[] {
  return findSectionReferences("src/sample.ts", text).map((reference) => reference.phrase)
}

describe("findSectionReferences", () => {
  test("ファイル名の直後の「句」を拾い、行と参照先を添える", () => {
    expect(
      findSectionReferences("src/sample.ts", `前置き\n// ${DISPLAY}「吹き出し」を見る\n`),
    ).toEqual([{ sourcePath: "src/sample.ts", line: 2, targetPath: DISPLAY, phrase: "吹き出し" }])
  })

  test("閉じのバッククォート・番号・章・原則・「の」を挟んでも拾う", () => {
    expect(
      phrasesOf(
        [
          `\`${DISPLAY}\`「一」`,
          `${DISPLAY} 4.2「二」`,
          `\`${DISPLAY}\` 2章「三」`,
          `\`${DISPLAY}\` 7.1 の「四」`,
          `${DISPLAY} 原則4「五」`,
          `\`${CLAUDE}\` の「六」`,
        ].join("\n"),
      ),
    ).toEqual(["一", "二", "三", "四", "五", "六"])
  })

  test("あいだに他の語が挟まるものは拾わない", () => {
    expect(phrasesOf(`${DISPLAY} 7章）。人格の「句ではない」`)).toEqual([])
    expect(phrasesOf(`\`${DISPLAY}\` には「句ではない」`)).toEqual([])
  })

  test("docs/ 配下のサブディレクトリも参照先として拾い、docs/history/ は参照先にしない", () => {
    expect(phrasesOf(`${RESEARCH}「調査」 ${HISTORY}「記録」`)).toEqual(["調査"])
  })

  test("別の場所の CLAUDE.md（直前が / のもの）は拾わない", () => {
    expect(phrasesOf(`~/.claude/${CLAUDE}「よそ」`)).toEqual([])
  })

  test("句の中の「」は入れ子として数え、外側の 」で閉じる", () => {
    expect(phrasesOf(`${DISPLAY}「「無い」値」のあと「別」`)).toEqual(["「無い」値"])
  })

  test("行をまたぐ句は、継続行のコメント記号と字下げを除いて繋ぐ", () => {
    expect(phrasesOf(`// ${DISPLAY}「書きかけの\n//   本文」\n`)).toEqual(["書きかけの本文"])
    expect(phrasesOf(` * ${DISPLAY}「前半\n * 後半」\n`)).toEqual(["前半後半"])
  })

  test("3行先までに閉じなければ拾わない", () => {
    expect(phrasesOf(`${DISPLAY}「a\nb\nc\nd\ne」`)).toEqual([])
  })
})

describe("findStrayReferences", () => {
  const targets = new Map([
    [
      DISPLAY,
      "### 4.2 表示\n\n**書きかけの本文は**そのまま記録の末尾に積まれ、\n  ターンが終わる。`speak` の説明\n",
    ],
  ])

  function straysOf(phrase: string, targetPath: string = DISPLAY): string[] {
    return findStrayReferences(
      [{ sourcePath: "src/sample.ts", line: 1, targetPath, phrase }],
      targets,
    ).map(formatStrayReference)
  }

  test("見出しに限らず、本文に文字として含まれれば迷子にしない", () => {
    expect(straysOf("表示")).toEqual([])
    expect(straysOf("書きかけの本文はそのまま記録の末尾に積まれ、ターンが終わる")).toEqual([])
  })

  test("空白・バッククォート・** の有無の違いは見ない", () => {
    expect(straysOf("speak の説明")).toEqual([])
    expect(straysOf("`speak`の 説明")).toEqual([])
  })

  test("末尾の … は略した印として、前半だけで照らす", () => {
    expect(straysOf("書きかけの本文は…")).toEqual([])
  })

  test("言い換えた句は迷子にする", () => {
    expect(straysOf("書きかけの本文がそのまま流れていく")).toEqual([
      `src/sample.ts:1: ${DISPLAY}「書きかけの本文がそのまま流れていく」`,
    ])
  })

  test("参照先のファイルが無ければ、そのことを添えて迷子にする", () => {
    expect(straysOf("何か", GONE)).toEqual([`src/sample.ts:1: ${GONE}「何か」（参照先が無い）`])
  })
})

describe("isScannedSource", () => {
  test("docs/history/・docs/research/・develop/ は参照を探す対象にしない", () => {
    expect(isScannedSource("docs/history/tasks.md")).toBe(false)
    expect(isScannedSource("docs/research/topic.md")).toBe(false)
    expect(isScannedSource("develop/tasks.json")).toBe(false)
  })

  test("それ以外の docs/・src/・CLAUDE.md は対象にする", () => {
    expect(isScannedSource("docs/design.md")).toBe(true)
    expect(isScannedSource("src/shared/main-view.ts")).toBe(true)
    expect(isScannedSource("CLAUDE.md")).toBe(true)
  })
})
