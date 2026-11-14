import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  MOTION_TOKENS,
  RADIUS_TOKENS,
  SHADOW_TOKENS,
  SPACE_TOKENS,
} from "../../../../../src/browser/components/app/design/design-token-list.ts"

const FAMILY_PATTERN = /^\s+(--(?:space|radius|shadow|motion)-[\w-]+):/gm

function declaredNames(): readonly string[] {
  const css = readFileSync(`${process.cwd()}/src/browser/styles/theme.css`, "utf8")
  return [...css.matchAll(FAMILY_PATTERN)].map((match) => match[1] ?? "")
}

const LISTED = [...SPACE_TOKENS, ...RADIUS_TOKENS, ...SHADOW_TOKENS, ...MOTION_TOKENS].map(
  (token) => token.name,
)

describe("見本帳のトークン", () => {
  it("余白・角丸・影・動きのトークンは、theme.css の宣言と見本帳の一覧が過不足なく一致する", () => {
    expect(LISTED.toSorted()).toEqual(declaredNames().toSorted())
  })

  it("一覧に1つ足りないと突き合わせが落ちる", () => {
    expect(LISTED.slice(1).toSorted()).not.toEqual(declaredNames().toSorted())
  })
})
