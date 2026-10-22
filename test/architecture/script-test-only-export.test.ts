import { readFileSync } from "node:fs"
import { posix } from "node:path"

import { describe, expect, it } from "vitest"

import { DOCUMENT_CHECK_TEST_FILES } from "../../scripts/dev/lib/check-stage.ts"
import { astChildren, astDescendants, astObject, astString } from "./ast-node.ts"
import {
  CONFIG_FILES,
  readRepositorySources,
  readScriptExportUse,
  REPOSITORY_ROOT,
} from "./script-export-use.ts"
import { parseSourceProgram } from "./source-file.ts"

const VITEST_CONFIG_FILES = ["vitest.config.ts", "vitest.e2e.config.ts"] as const

const ALLOWED_TEST_ONLY_EXPORTS = {
  "scripts/capture/lib/capture-page.ts#pressFocusNotice":
    "公開口 applyPreparations は実ブラウザの Page を要るので、--press の届き先の知らせの文面を値で確かめる",
  "scripts/capture/lib/capture-page.ts#settleRender":
    "公開口 settlePage は実ブラウザの Page を要るので、描き直しの待ちを evaluate だけの代役で確かめる",
  "scripts/capture/lib/capture-page.ts#waitUntilStable":
    "公開口 settlePage は本文の領域を撮って比べるので、連続2回の一致で止まる数えを値で確かめる",
  "scripts/capture/lib/capture-page.ts#collectMisses":
    "公開口 applyPreparations は実ブラウザの Page を要るので、外れた手の集め方と打ち切りを値で確かめる",
  "scripts/capture/lib/capture-page.ts#waitForRevealEnd":
    "公開口 settlePage は実ブラウザの Page を要るので、演出の終わりの待ちと上限を evaluate だけの代役で確かめる",
  "scripts/capture/lib/paper-hue.ts#srgbToOklch":
    "公開口 hueFamilies は画全体を色相の族へ畳むので、色の変換を既知の色の値で確かめる",
  "scripts/capture/lib/scene-end.ts#countEventKinds":
    "公開口 watchSceneEvents は WebSocket の受信を要るので、配られた本文のイベントの数えを値で確かめる",
  "scripts/dev/lib/submodule-drift.ts#classifySubmoduleStatus":
    "公開口 alignSubmodules は git を打つので、git submodule status の出力の分類を値で確かめる",
  "scripts/hook/lib/hook-input.ts#parseBashHookCall":
    "公開口 readBashHookCall は標準入力を読むので、hook の入力 JSON の読みを値で確かめる",
  "scripts/shared/instance-location.ts#readLiveInstanceLocations":
    "公開口 findRunningTsukumo はポートの待ち受けを調べるので、所在のファイルと pid の生死の突き合わせだけを確かめる",
  "scripts/shared/e2e-scenario.ts#ROOM_OPENER":
    "E2E の足場の名前の規約を、場面の読み取りと同じ正規表現で確かめる（写すと2つがずれる）",
} as const satisfies Record<string, string>

describe("scripts/ のテストからしか import されない export", () => {
  it("許可リストの外に無い", () => {
    const found = testOnlyExports(readRepositorySources(), productionReader())

    expect(found.filter((key) => !(key in ALLOWED_TEST_ONLY_EXPORTS))).toEqual([])
  })

  it("許可リストの項目は、いまもテストからしか import されない", () => {
    const found = new Set(testOnlyExports(readRepositorySources(), productionReader()))

    expect(Object.keys(ALLOWED_TEST_ONLY_EXPORTS).filter((key) => !found.has(key))).toEqual([])
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
      ["test/setup.ts", 'import { setupOnly } from "../scripts/lib/a.ts"'],
      [
        "test/a.test.ts",
        [
          'import { ONLY_TEST, onlyTest, used, type Argument, type Inner, type Loose } from "../scripts/lib/a.ts"',
          'import { spaced } from "../scripts/lib/spaced.ts"',
          'import { late } from "../scripts/lib/late.ts"',
        ].join("\n"),
      ],
    ])
    const isReader = (path: string): boolean =>
      path.startsWith("scripts/") || path === "test/setup.ts"

    expect(testOnlyExports(sources, isReader).toSorted()).toEqual([
      "scripts/lib/a.ts#Loose",
      "scripts/lib/a.ts#ONLY_TEST",
      "scripts/lib/a.ts#onlyTest",
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
    ...DOCUMENT_CHECK_TEST_FILES,
  ])
  return (path) => path.startsWith("scripts/") || path.startsWith("src/") || readers.has(path)
}

function vitestSetupFiles(): readonly string[] {
  return VITEST_CONFIG_FILES.flatMap((configPath) =>
    astDescendants(parseSourceProgram(readFileSync(`${REPOSITORY_ROOT}/${configPath}`, "utf8")))
      .filter(
        (node) =>
          astString(node, "type") === "Property" &&
          ["globalSetup", "setupFiles"].includes(astString(astObject(node, "key"), "name") ?? ""),
      )
      .flatMap((property) => astChildren(astObject(property, "value"), "elements"))
      .flatMap((element) => astString(element, "value") ?? [])
      .map((path) => posix.normalize(path)),
  )
}

/** `scripts/` の export のうち、テストの側からだけ import されるものを `<パス>#<名前>` で返す。 */
function testOnlyExports(
  sources: ReadonlyMap<string, string>,
  isReader: (path: string) => boolean,
): readonly string[] {
  const use = readScriptExportUse(sources)
  return use.unreadBy(isReader).filter((key) => use.imported.has(key))
}
