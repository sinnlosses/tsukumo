import { expect, test } from "vitest"

import { PLAIN_WORDS } from "../../../../src/server/report/core/plain-word.ts"

test("言い換え先は、元の綴りを含まない（含むと言い換えた本文がまた差し戻される）", () => {
  expect(PLAIN_WORDS.filter((word) => word.replacement.includes(word.spelling))).toEqual([])
})

test("面・葉は複合語の綴りで登録し、単独の綴りは登録しない", () => {
  const spellings = PLAIN_WORDS.map((word) => word.spelling)
  expect(spellings).not.toContain("面")
  expect(spellings).not.toContain("葉")
})

test("節は複合語の綴りで登録し、単独の綴りは登録しない", () => {
  const spellings = PLAIN_WORDS.map((word) => word.spelling)
  expect(spellings).not.toContain("節")
  expect(spellings).toEqual(
    expect.arrayContaining(["レポートの節", "見出しの無い節", "節の塊", "節が2つ以上"]),
  )
})

test("棚・台本は複合語の綴りで登録し、単独の綴りと別の意味の語（棚卸し・再現の台本）は登録しない", () => {
  const spellings = PLAIN_WORDS.map((word) => word.spelling)
  expect(spellings).not.toContain("棚")
  expect(spellings).not.toContain("台本")
  expect(spellings).toEqual(
    expect.arrayContaining(["画像の棚", "棚から", "台本の完了", "台本の中の委譲先"]),
  )
})

test("札は複合語の綴りで登録し、単独の綴りは登録しない", () => {
  const spellings = PLAIN_WORDS.map((word) => word.spelling)
  expect(spellings).not.toContain("札")
  expect(spellings).toEqual(
    expect.arrayContaining([
      "プラン使用量の札",
      "使用量の札",
      "答え待ちの札",
      "おすすめの札",
      "お伺いの札",
      "働くあいだの札",
      "メインビューの札",
      "いまの作業の札",
      "コンテキストの札",
      "結果の札",
      "提案の札",
      "始め方の札",
      "数の札",
      "浮かぶ札",
      "吊り札",
      "卒業の札",
      "形の札",
      "変更の札",
      "部屋の名前の札",
      "セッションの札",
      "絞り込みの札",
      "等幅の札",
      "出典の札",
      "列挙型の札",
    ]),
  )
})

test("長い綴りが、それを含む短い綴りより先に並んでいる", () => {
  expect(
    PLAIN_WORDS.filter((word, index) =>
      PLAIN_WORDS.slice(0, index).some((earlier) => word.spelling.includes(earlier.spelling)),
    ),
  ).toEqual([])
})
