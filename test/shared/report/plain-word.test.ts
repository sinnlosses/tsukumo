import { expect, test } from "vitest"

import { PLAIN_WORDS } from "../../../src/shared/report/plain-word.ts"

test("言い換え先は、元の綴りを含まない（含むと言い換えた本文がまた差し戻される）", () => {
  expect(PLAIN_WORDS.filter((word) => word.replacement.includes(word.spelling))).toEqual([])
})

test("長い綴りが、それを含む短い綴りより先に並んでいる", () => {
  expect(
    PLAIN_WORDS.filter((word, index) =>
      PLAIN_WORDS.slice(0, index).some((earlier) => word.spelling.includes(earlier.spelling)),
    ),
  ).toEqual([])
})
