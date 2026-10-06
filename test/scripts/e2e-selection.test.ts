import { existsSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, test } from "vitest"

import {
  describeE2eSelection,
  type E2eSelectionSource,
  selectE2eFiles,
} from "../../scripts/lib/e2e-selection.ts"
import { E2E_REGION_ROOTS, E2E_WATCHED_REGIONS } from "../../scripts/lib/e2e-watch.ts"

const CHAT = "test/e2e/chat.test.ts"
const PAGE = "test/e2e/page.test.ts"
const REPORT = "test/e2e/report.test.ts"

const SOURCE = {
  graph: new Map([
    ["src/cli.ts", ["src/server/main.ts"]],
    ["src/server/main.ts", ["src/shared/frame.ts"]],
    ["src/browser/app.tsx", ["src/browser/main-view.tsx", "src/browser/chat-view.tsx"]],
    ["src/browser/main-view.tsx", ["src/browser/turn.tsx", "src/browser/button.tsx"]],
    ["src/browser/chat-view.tsx", ["src/browser/button.tsx"]],
    [REPORT, ["test/e2e/scenario-run.ts", "test/e2e/task-room.ts"]],
    [CHAT, ["test/e2e/scenario-run.ts"]],
    [PAGE, ["test/e2e/scenario-run.ts"]],
    ["test/e2e/scenario-run.ts", ["scripts/lib/fake-process.ts"]],
  ]),
  sources: new Map([
    [REPORT, 'run.open({ scenario: "report-blocks" })'],
    [CHAT, 'run.open({ scenario: "chat-history" })'],
    [PAGE, "run.open({ scenario: `page-${viewport}` })"],
  ]),
  e2eFiles: [CHAT, PAGE, REPORT],
  regionRoots: { main: ["src/browser/main-view.tsx"], chat: ["src/browser/chat-view.tsx"] },
  watchedRegions: { [CHAT]: ["chat"], [PAGE]: "every", [REPORT]: ["main"] },
} satisfies E2eSelectionSource

function select(...changedPaths: string[]) {
  return selectE2eFiles(changedPaths, SOURCE)
}

describe("selectE2eFiles が選ぶファイル", () => {
  test("ブラウザだけが読むファイルは、届く領域を見る E2E とどの領域も見る E2E を選ぶ", () => {
    expect(select("src/browser/turn.tsx")).toEqual({ kind: "files", files: [PAGE, REPORT] })
    expect(select("src/browser/button.tsx")).toEqual({ kind: "files", files: [CHAT, PAGE, REPORT] })
  })

  test("E2E ファイルはそれ自身を選ぶ", () => {
    expect(select(CHAT)).toEqual({ kind: "files", files: [CHAT] })
  })

  test("期待値は、場面の名前かその頭のテンプレートを持つ E2E を選ぶ", () => {
    expect(select("test/e2e/expected/report-blocks.dom.json")).toEqual({
      kind: "files",
      files: [REPORT],
    })
    expect(select("test/e2e/expected/page-wide.messages.json")).toEqual({
      kind: "files",
      files: [PAGE],
    })
  })

  test("E2E の足場の側のファイルは、import で届く元の E2E を選ぶ", () => {
    expect(select("test/e2e/task-room.ts")).toEqual({ kind: "files", files: [REPORT] })
    expect(select("scripts/lib/fake-process.ts")).toEqual({
      kind: "files",
      files: [CHAT, PAGE, REPORT],
    })
  })

  test("文書・単体テスト・E2E から届かない scripts は選ばない", () => {
    expect(
      select(
        "README.md",
        "develop/task/sample.md",
        "test/scripts/sample.test.ts",
        "scripts/check.ts",
      ),
    ).toEqual({ kind: "files", files: [] })
  })

  test("複数の変更は選んだファイルを合わせる", () => {
    expect(select(CHAT, "test/e2e/task-room.ts")).toEqual({ kind: "files", files: [CHAT, REPORT] })
  })
})

describe("selectE2eFiles が全件に倒す変更", () => {
  test.each([
    ["package.json", "E2E の足場"],
    ["vitest.e2e.config.ts", "E2E の足場"],
    ["src/shared/frame.ts", "サーバが読むファイル"],
    ["src/browser/app.tsx", "どの領域の根からも届かないファイル"],
    ["test/e2e/expected/unknown.dom.json", "持ち主の E2E が見つからない期待値"],
    ["test/fixture/fake-session.json", "E2E が実行時に読みうるファイル"],
    ["bin/tsukumo", "選べないパス"],
  ])("%s（%s）", (path, reason) => {
    expect(select(path)).toEqual({ kind: "all", path, reason })
  })

  test("選べるファイルと混ざっていても、1件あれば全件", () => {
    expect(select(CHAT, "package.json")).toEqual({
      kind: "all",
      path: "package.json",
      reason: "E2E の足場",
    })
  })
})

describe("describeE2eSelection", () => {
  test("選んだファイル・全件の理由・省くことを1行で言う", () => {
    expect(describeE2eSelection({ kind: "files", files: [CHAT, PAGE] }, 3)).toBe(
      "E2E: 変えたファイルから 2/3 ファイルを選んだ（chat・page）",
    )
    expect(describeE2eSelection({ kind: "files", files: [CHAT, PAGE, REPORT] }, 3)).toBe(
      "E2E: 変えたファイルから全 3 ファイルを選んだ",
    )
    expect(describeE2eSelection({ kind: "files", files: [] }, 3)).toBe(
      "E2E: 変えたファイルから選ぶものが無いので省く",
    )
    expect(
      describeE2eSelection({ kind: "all", path: "package.json", reason: "E2E の足場" }, 3),
    ).toBe("E2E: 全件（3 ファイル）を流す（package.json: E2E の足場）")
  })
})

describe("見張りの表", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url))

  test("test/e2e/*.test.ts がどれも見ている領域を持つ", () => {
    const e2eFiles = readdirSync(`${root}test/e2e`)
      .filter((name) => name.endsWith(".test.ts"))
      .map((name) => `test/e2e/${name}`)

    expect(Object.keys(E2E_WATCHED_REGIONS).toSorted()).toEqual(e2eFiles.toSorted())
  })

  test("領域の根の部品ファイルがどれも在る", () => {
    const missing = Object.values(E2E_REGION_ROOTS)
      .flat()
      .filter((path) => !existsSync(`${root}${path}`))

    expect(missing).toEqual([])
  })
})
