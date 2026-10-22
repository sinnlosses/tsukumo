// 拾う・照らす純粋関数を、小さな本文で検証する。
// リポジトリ全体で0件を保つのは別の検査の役目。
//
// このファイル自身も拾われる側なので、参照の形の文字列はファイル名を定数に分けて組み立てる
// （ソースに `docs/<名前>.md「…」` の形がそのまま現れないようにする）。無いファイルのパスは
// 素のパスとしても拾われるので、`docs/` と名前を分けて組み立てる。

import { describe, expect, test } from "vitest"

import {
  findFileReferences,
  findMissingFileReferences,
  findSectionReferences,
  findStrayReferences,
  formatMissingFileReference,
  formatStrayReference,
  isScannedSource,
} from "../../../scripts/document/section-reference.ts"

const DISPLAY = "docs/architecture/display.md"
const RESEARCH = "docs/research/topic.md"
const HISTORY = "docs/history/tasks.md"
const AGENTS = "AGENTS.md"
const GONE = "docs/gone.md"
const ABSENT = `docs/${"absent"}.md`

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
          `\`${AGENTS}\` の「六」`,
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

  test("別の場所の AGENTS.md（直前が / のもの）は拾わない", () => {
    expect(phrasesOf(`~/.codex/${AGENTS}「よそ」`)).toEqual([])
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

  test("パスで行が終わり、次の行の頭が「で始まる形も拾う", () => {
    expect(phrasesOf(`${DISPLAY} 4.2\n「二」\n`)).toEqual(["二"])
    expect(phrasesOf(`${DISPLAY} の\n「一」\n`)).toEqual(["一"])
  })

  test("行をまたぐ形でも、継続行のコメント記号と字下げを除いて拾う", () => {
    expect(phrasesOf(`// ${DISPLAY}\n// 「前半\n//   後半」\n`)).toEqual(["前半後半"])
  })

  test("次の行が「で始まらなければ拾わない", () => {
    expect(phrasesOf(`${DISPLAY}\nただの次の行\n`)).toEqual([])
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
      [{ sourcePath: "src/sample.ts", line: 1, targetPath, section: undefined, phrase }],
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

  describe("節番号つき", () => {
    const numbered = new Map([
      [
        DISPLAY,
        [
          "### 4.8 別の節",
          "覚えたこと は別の節の本文にだけある",
          "### 4.9 雑談モード",
          "本文の語 はここ",
          "#### プロフィールの書き戻し",
          "```",
          "### 4.10 コードブロックの中",
          "```",
          "### 4.10 次の節",
        ].join("\n"),
      ],
    ])

    function numberedStraysOf(section: string | undefined, phrase: string): string[] {
      return findStrayReferences(
        [{ sourcePath: "src/sample.ts", line: 1, targetPath: DISPLAY, section, phrase }],
        numbered,
      ).map((stray) => stray.phrase)
    }

    test("句が番号の節の見出しにあれば迷子にしない（下位の見出しも節に含む）", () => {
      expect(numberedStraysOf("4.9", "雑談モード")).toEqual([])
      expect(numberedStraysOf("4.9", "プロフィールの書き戻し")).toEqual([])
    })

    test("本文中の語を指す正当な言い方は迷子にしない", () => {
      expect(numberedStraysOf("4.9", "本文の語")).toEqual([])
    })

    test("句がファイルにあっても、番号の節の外なら迷子にする", () => {
      expect(numberedStraysOf("4.9", "覚えたこと")).toEqual(["覚えたこと"])
    })

    test("コードブロックの中の # 行は見出しにしない", () => {
      expect(numberedStraysOf("4.9", "次の節")).toEqual(["次の節"])
      expect(numberedStraysOf("4.10", "次の節")).toEqual([])
    })

    test("番号に当たる見出しが無い・番号が無い参照は、ファイル全体で照らす", () => {
      expect(numberedStraysOf("9.9", "覚えたこと")).toEqual([])
      expect(numberedStraysOf(undefined, "覚えたこと")).toEqual([])
    })
  })
})

describe("findFileReferences", () => {
  function targetsOf(text: string): string[] {
    return findFileReferences("src/sample.ts", text).map((reference) => reference.targetPath)
  }

  test("「」の有無を問わず docs/ 以下の .md のパスを拾い、行を添える", () => {
    expect(
      findFileReferences("src/sample.ts", `前置き\n// ${DISPLAY}「吹き出し」と ${ABSENT}\n`),
    ).toEqual([
      { sourcePath: "src/sample.ts", line: 2, targetPath: DISPLAY },
      { sourcePath: "src/sample.ts", line: 2, targetPath: ABSENT },
    ])
  })

  test("docs/history/ を指すパスも拾う", () => {
    expect(targetsOf(`\`${HISTORY}\``)).toEqual([HISTORY])
  })

  test("直前が / のもの（別のリポジトリ・URL の中のパス）は拾わない", () => {
    expect(targetsOf(`claude-skills/${DISPLAY} https://example.com/${DISPLAY}`)).toEqual([])
  })

  test("実在を照らさない一覧のパスは拾わない", () => {
    expect(targetsOf(`${GONE} ${RESEARCH}`)).toEqual([])
  })
})

describe("findMissingFileReferences", () => {
  test("実在するファイルの一覧に無いパスだけを返し、そのことを添えて1行にする", () => {
    const references = findFileReferences("src/sample.ts", `${DISPLAY}\n${ABSENT}\n`)
    expect(
      findMissingFileReferences(references, new Set([DISPLAY])).map(formatMissingFileReference),
    ).toEqual([`src/sample.ts:2: ${ABSENT}（ファイルが無い）`])
  })
})

describe("isScannedSource", () => {
  test("docs/history/・docs/research/・.tw/ は参照を探す対象にしない", () => {
    expect(isScannedSource("docs/history/tasks.md")).toBe(false)
    expect(isScannedSource("docs/research/topic.md")).toBe(false)
    expect(isScannedSource(".tw/tasks.json")).toBe(false)
  })

  test("それ以外の docs/・src/・AGENTS.md は対象にする", () => {
    expect(isScannedSource("docs/architecture.md")).toBe(true)
    expect(isScannedSource("src/shared/session/main-view.ts")).toBe(true)
    expect(isScannedSource("AGENTS.md")).toBe(true)
  })
})
