import { readFileSync } from "node:fs"
import { posix } from "node:path"

import { describe, expect, it } from "vitest"

import { listConventionTests } from "../../scripts/dev/lib/convention-test.ts"
import { arrayField, descendants, objectField, stringField } from "../../scripts/shared/ast-node.ts"
import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import {
  CONFIG_FILES,
  nonPropsTypeExports,
  readExportUse,
  readRepositorySources,
} from "./export-use.ts"
import { parseSourceProgram } from "./source-file.ts"

const VITEST_CONFIG_FILES = ["vitest.config.ts", "vitest.e2e.config.ts"] as const

// テストの側でない読み手のディレクトリ。
const PRODUCTION_DIRECTORIES = ["src/", "scripts/"] as const

// 値は許す理由。置けるのは、テストだけが読む `<部品>Props` の型の export だけ
// （関数・定数は消すか、本番の口へ寄せるか、概念の名前のファイルへ移す）。
const ALLOWED_TEST_ONLY_EXPORTS = {} as const satisfies Record<string, string>

// 本番の読み手が後続の課題で付くまでの、期限つきの例外（Props の型でなくてよい）。読み手が付いたら外す。
const PENDING_READER_EXPORTS = {} as const satisfies Record<string, string>

const OFFENDER_GUIDE = [
  "テストからしか import されない export がある。次のどれかにする。",
  '- 使い手が後続の課題で付く新部品: PENDING_READER_EXPORTS に "パス#名前": "読み手が付く課題の名前と理由" で足す（読み手が付いたら外す）',
  '- テストだけが読む `<部品>Props` の型: ALLOWED_TEST_ONLY_EXPORTS に "パス#名前": "理由" で足す',
  "- それ以外の関数・定数: 消すか、本番の口へ寄せる",
].join("\n")

const SOURCES = readRepositorySources()

const FOUND_TEST_ONLY_EXPORTS = testOnlyExports(SOURCES, productionReader())

describe("src/・scripts/ のテストからしか import されない export", () => {
  it("許可リストの外に無い", () => {
    const offenders = FOUND_TEST_ONLY_EXPORTS.filter(
      (key) => !(key in ALLOWED_TEST_ONLY_EXPORTS) && !(key in PENDING_READER_EXPORTS),
    )

    expect(offenders, OFFENDER_GUIDE).toEqual([])
  })

  it("期限つきの例外の項目は、いまもテストからしか import されない（読み手が付いたら外す）", () => {
    const found = new Set(FOUND_TEST_ONLY_EXPORTS)

    expect(Object.keys(PENDING_READER_EXPORTS).filter((key) => !found.has(key))).toEqual([])
  })

  it("許可リストの項目は、いまもテストからしか import されない", () => {
    const found = new Set(FOUND_TEST_ONLY_EXPORTS)

    expect(Object.keys(ALLOWED_TEST_ONLY_EXPORTS).filter((key) => !found.has(key))).toEqual([])
  })

  it("許可リストの項目は、`<部品>Props` の型の export だけ", () => {
    expect(nonPropsTypeExports(Object.keys(ALLOWED_TEST_ONLY_EXPORTS), SOURCES)).toEqual([])
  })

  it("`<部品>Props` の名前の type・interface の export だけを許可リストに置けるものとし、ほかの型・関数・定数は外す", () => {
    const sources = new Map([
      [
        "src/browser/a.tsx",
        [
          "export type ButtonProps = { readonly label: string }",
          "export interface MenuProps { readonly open: boolean }",
          "export const ShadowProps = 1",
          "export function FakeProps(): void {}",
          "export type Loose = string",
          "type LocalProps = string",
        ].join("\n"),
      ],
    ])
    const keys = [
      "ButtonProps",
      "MenuProps",
      "ShadowProps",
      "FakeProps",
      "Loose",
      "LocalProps",
      "Missing",
    ].map((name) => `src/browser/a.tsx#${name}`)

    expect(nonPropsTypeExports([...keys, "src/無い.ts#GoneProps"], sources)).toEqual([
      "src/browser/a.tsx#ShadowProps",
      "src/browser/a.tsx#FakeProps",
      "src/browser/a.tsx#Loose",
      "src/browser/a.tsx#LocalProps",
      "src/browser/a.tsx#Missing",
      "src/無い.ts#GoneProps",
    ])
  })

  it("本番の側の読み手・型注釈から名指される型・まとめて読む import を数え、テストだけが読む export を拾う", () => {
    const sources = new Map([
      [
        "scripts/lib/a.ts",
        [
          "export type Argument = { readonly inner: Inner }",
          "export type Inner = number",
          "export type Loose = string",
          "export function used(argument: Argument): void {}",
          "export function onlyTest(): void {}",
          "export const ONLY_TEST = 1",
          "export function setupOnly(): void {}",
          "export function reexported(): void {}",
        ].join("\n"),
      ],
      ["scripts/lib/spaced.ts", "export function spaced(): void {}"],
      ["scripts/lib/late.ts", "export function late(): void {}"],
      [
        "scripts/entry.ts",
        [
          'import { used } from "./lib/a.ts"',
          'import * as spacedModule from "./lib/spaced.ts"',
          'export { reexported } from "./lib/a.ts"',
          'await import("./lib/late.ts")',
        ].join("\n"),
      ],
      [
        "src/shared/b.ts",
        ["export const READ_BY_SRC = 1", "export const SRC_ONLY_TEST = 1"].join("\n"),
      ],
      ["src/browser/c.ts", 'import { READ_BY_SRC } from "../shared/b.ts"'],
      ["test/setup.ts", 'import { setupOnly } from "../scripts/lib/a.ts"'],
      [
        "test/a.test.ts",
        [
          'import { ONLY_TEST, onlyTest, used, type Argument, type Inner, type Loose } from "../scripts/lib/a.ts"',
          'import { spaced } from "../scripts/lib/spaced.ts"',
          'import { late } from "../scripts/lib/late.ts"',
          'import { READ_BY_SRC, SRC_ONLY_TEST } from "../src/shared/b.ts"',
        ].join("\n"),
      ],
    ])
    const isReader = (path: string): boolean =>
      PRODUCTION_DIRECTORIES.some((directory) => path.startsWith(directory)) ||
      path === "test/setup.ts"

    expect(testOnlyExports(sources, isReader).toSorted()).toEqual([
      "scripts/lib/a.ts#Loose",
      "scripts/lib/a.ts#ONLY_TEST",
      "scripts/lib/a.ts#onlyTest",
      "src/shared/b.ts#SRC_ONLY_TEST",
    ])
  })

  it("vitest の設定から setup のファイルを読む", () => {
    expect(vitestSetupFiles().length).toBeGreaterThan(0)
  })
})

function productionReader(): (path: string) => boolean {
  const readers = new Set<string>([
    ...CONFIG_FILES,
    ...vitestSetupFiles(),
    ...listConventionTests(REPOSITORY_ROOT).filter(
      (path) => !path.startsWith("test/architecture/"),
    ),
  ])
  return (path) =>
    PRODUCTION_DIRECTORIES.some((directory) => path.startsWith(directory)) || readers.has(path)
}

function vitestSetupFiles(): readonly string[] {
  return VITEST_CONFIG_FILES.flatMap((configPath) =>
    descendants(parseSourceProgram(readFileSync(`${REPOSITORY_ROOT}/${configPath}`, "utf8")))
      .filter(
        (node) =>
          stringField(node, "type") === "Property" &&
          ["globalSetup", "setupFiles"].includes(
            stringField(objectField(node, "key"), "name") ?? "",
          ),
      )
      .flatMap((property) => arrayField(objectField(property, "value"), "elements"))
      .flatMap((element) => stringField(element, "value") ?? [])
      .map((path) => posix.normalize(path)),
  )
}

/** テストの側からだけ import される export を `<パス>#<名前>` で返す。 */
function testOnlyExports(
  sources: ReadonlyMap<string, string>,
  isReader: (path: string) => boolean,
): readonly string[] {
  const use = readExportUse(sources)
  return use.unreadBy(isReader).filter((key) => use.imported.has(key))
}
