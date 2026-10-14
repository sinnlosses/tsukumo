// 件ごとに撮る窓の大きさを選ぶ判断を検証する。

import { describe, expect, test } from "vitest"

import { CATALOG, sizesOf } from "../../../scripts/capture/lib/catalog-entry.ts"

function entryNamed(name: string) {
  const entry = CATALOG.find((candidate) => candidate.name === name)
  if (entry === undefined) {
    throw new Error(`カタログに無い件: ${name}`)
  }
  return entry
}

describe("sizesOf", () => {
  test("preview の画像の2件は広い窓だけで撮る", () => {
    for (const name of ["question-preview-image", "question-preview-image-missing"]) {
      expect(sizesOf(entryNamed(name)).map((size) => size.name)).toEqual(["wide"])
    }
  })

  test("ほかの件は広い窓と狭い窓の両方を撮る", () => {
    expect(sizesOf(entryNamed("question-preview")).map((size) => size.name)).toEqual([
      "wide",
      "narrow",
    ])
  })
})
