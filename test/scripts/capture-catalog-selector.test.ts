// 撮影の件のセレクタ `[class*="名前_"]` の名前が、CSS Modules に class として定義されているか、
// `[aria-label="値"]`・`[aria-label^="値"]` の値と `has-text("字")` の字が src か疑似セッションに現れるかを確かめる。
// 撮影の件は `pnpm run check` で走らないので、class を消した変更が件を黙って壊す。

import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, test } from "vitest"

import { cssClassNames } from "../css-module-loader.ts"

const SRC_DIR = fileURLToPath(new URL("../../src/", import.meta.url))
const CAPTURE_SOURCES = [new URL("../../scripts/capture-catalog.ts", import.meta.url)]

const SELECTOR_CLASS_PATTERN = /\[class\*="([^"]+)_"\]/g

describe("撮影の件のセレクタの class", () => {
  const selectorNames = CAPTURE_SOURCES.flatMap((url) =>
    [...readFileSync(url, "utf8").matchAll(SELECTOR_CLASS_PATTERN)].flatMap(
      ([, name]) => name ?? [],
    ),
  )

  test("セレクタに書いた class の名前を1つ以上読めている", () => {
    expect(selectorNames.length).toBeGreaterThan(0)
  })

  test("すべて src の *.module.css に定義がある", () => {
    const defined = new Set(
      readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
        .filter((file) => file.endsWith(".module.css"))
        .flatMap((file) => cssClassNames(readFileSync(`${SRC_DIR}${file}`, "utf8"))),
    )

    expect(selectorNames.filter((name) => !defined.has(name))).toEqual([])
  })
})

const SELECTOR_ARIA_LABEL_PATTERN = /\[aria-label\^?="([^"]+)"\]/g
const FAKE_SESSION_TEXT = readFileSync(
  new URL("../fixture/fake-session.json", import.meta.url),
  "utf8",
)
const SRC_SOURCES = readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
  .map((file) => readFileSync(`${SRC_DIR}${file}`, "utf8"))

describe("撮影の件のセレクタの aria-label", () => {
  const labels = CAPTURE_SOURCES.flatMap((url) =>
    [...readFileSync(url, "utf8").matchAll(SELECTOR_ARIA_LABEL_PATTERN)].flatMap(
      ([, label]) => label ?? [],
    ),
  )

  test("セレクタに書いた aria-label の値を1つ以上読めている", () => {
    expect(labels.length).toBeGreaterThan(0)
  })

  test("すべて src か疑似セッションの本文に現れる", () => {
    const texts = [...SRC_SOURCES, FAKE_SESSION_TEXT]

    expect(labels.filter((label) => !texts.some((text) => text.includes(label)))).toEqual([])
  })
})

const SELECTOR_HAS_TEXT_PATTERN = /has-text\("([^"]+)"\)/g

describe("撮影の件のセレクタの has-text", () => {
  const phrases = CAPTURE_SOURCES.flatMap((url) =>
    [...readFileSync(url, "utf8").matchAll(SELECTOR_HAS_TEXT_PATTERN)].flatMap(
      ([, phrase]) => phrase ?? [],
    ),
  )

  test("セレクタに書いた has-text の文字を1つ以上読めている", () => {
    expect(phrases.length).toBeGreaterThan(0)
  })

  test("すべて src か疑似セッションの本文に現れる", () => {
    const text = [...SRC_SOURCES, FAKE_SESSION_TEXT].join("\n")

    expect(phrases.filter((phrase) => !endsRenderedText(phrase).test(text))).toEqual([])
  })
})

// 字の塊（引用符か JSX の `>` で始まり、引用符か `<` で終わる）の末尾に当たるものだけを数える。
// コメントや aria-label の値に同じ字が混ざっても通さないため。
// 字の途中や改行した JSX の字にしか無いときは落ちるので、そのときはセレクタの字を塊の末尾に合わせる。
function endsRenderedText(phrase: string): RegExp {
  const opening = "(?<!(?:aria-label|ariaLabel)=)[\"'`>]"
  const beforePhrase = "[^\"'`<>\\n]*"
  const closing = "[\"'`<]"
  return new RegExp(`${opening}${beforePhrase}${escapeRegExp(phrase)}${closing}`)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
