import { describe, expect, it } from "vitest"

import { readRepositorySources, readScriptExportUse } from "./script-export-use.ts"

const ALLOWED_UNUSED_EXPORTS = {} as const satisfies Record<string, string>

const FOUND_UNUSED_EXPORTS = unusedExports(readRepositorySources())

describe("scripts/ のどこからも import されない export", () => {
  it("許可リストの外に無い", () => {
    expect(FOUND_UNUSED_EXPORTS.filter((key) => !(key in ALLOWED_UNUSED_EXPORTS))).toEqual([])
  })

  it.skipIf(Object.keys(ALLOWED_UNUSED_EXPORTS).length === 0)(
    "許可リストの項目は、いまもどこからも import されない",
    () => {
      const found = new Set(FOUND_UNUSED_EXPORTS)

      expect(Object.keys(ALLOWED_UNUSED_EXPORTS).filter((key) => !found.has(key))).toEqual([])
    },
  )

  it("本番が読む export・テストだけが読む export・型注釈から名指される型を除き、誰も読まない export を拾う", () => {
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
      ["test/a.test.ts", 'import { onlyTest } from "../scripts/lib/a.ts"'],
    ])

    expect(unusedExports(sources).toSorted()).toEqual([
      "scripts/lib/a.ts#Loose",
      "scripts/lib/a.ts#UNUSED",
      "scripts/lib/a.ts#unused",
    ])
  })
})

function unusedExports(sources: ReadonlyMap<string, string>): readonly string[] {
  return readScriptExportUse(sources).unreadBy(() => true)
}
