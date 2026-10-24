import { describe, expect, it } from "vitest"

import { nonPropsTypeExports, readExportUse, readRepositorySources } from "./export-use.ts"

// 値は許す理由。置けるのは `<部品>Props` の型の export だけ（関数・定数は消すか本番の口へ寄せる）。
const ALLOWED_UNUSED_EXPORTS = {} as const satisfies Record<string, string>

const SOURCES = readRepositorySources()

const FOUND_UNUSED_EXPORTS = unusedExports(SOURCES)

describe("src/・scripts/・story/ のどこからも import されない export", () => {
  it("許可リストの外に無い", () => {
    expect(FOUND_UNUSED_EXPORTS.filter((key) => !(key in ALLOWED_UNUSED_EXPORTS))).toEqual([])
  })

  it("許可リストの項目は、いまもどこからも import されない", () => {
    const found = new Set(FOUND_UNUSED_EXPORTS)

    expect(Object.keys(ALLOWED_UNUSED_EXPORTS).filter((key) => !found.has(key))).toEqual([])
  })

  it("許可リストの項目は、`<部品>Props` の型の export だけ", () => {
    expect(nonPropsTypeExports(Object.keys(ALLOWED_UNUSED_EXPORTS), SOURCES)).toEqual([])
  })

  it("本番が読む export・テストだけが読む export・型注釈から名指される型・story の入口を除き、誰も読まない export を拾う", () => {
    const sources = new Map([
      [
        "scripts/lib/a.ts",
        [
          "export type Argument = { readonly inner: Inner }",
          "export type Inner = number",
          "export type Option = string",
          "export type Loose = string",
          "export function used(argument: Argument): void {}",
          "export function onlyTest(option: Option): void {}",
          "export function unused(): void {}",
          "export const UNUSED = 1",
        ].join("\n"),
      ],
      ["scripts/entry.ts", 'import { used } from "./lib/a.ts"'],
      [
        "src/shared/b.ts",
        [
          "export const READ_BY_STORY = 1",
          "export const READ_BY_SRC = 1",
          "export function unusedInSrc(): void {}",
        ].join("\n"),
      ],
      ["src/browser/c.ts", 'import { READ_BY_SRC } from "../shared/b.ts"'],
      [
        "story/browser/c.story.tsx",
        [
          'import { READ_BY_STORY } from "../../src/shared/b.ts"',
          "export default {}",
          "export const Shown = {}",
        ].join("\n"),
      ],
      ["test/a.test.ts", 'import { onlyTest } from "../scripts/lib/a.ts"'],
    ])

    expect(unusedExports(sources).toSorted()).toEqual([
      "scripts/lib/a.ts#Loose",
      "scripts/lib/a.ts#UNUSED",
      "scripts/lib/a.ts#unused",
      "src/shared/b.ts#unusedInSrc",
    ])
  })
})

function unusedExports(sources: ReadonlyMap<string, string>): readonly string[] {
  return readExportUse(sources).unreadBy(() => true)
}
