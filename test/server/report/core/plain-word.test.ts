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

test("長い綴りが、それを含む短い綴りより先に並んでいる", () => {
  expect(
    PLAIN_WORDS.filter((word, index) =>
      PLAIN_WORDS.slice(0, index).some((earlier) => word.spelling.includes(earlier.spelling)),
    ),
  ).toEqual([])
})
