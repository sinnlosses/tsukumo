import { describe, expect, it } from "vitest"

import { listSourceFiles, SRC_ROOT } from "./source-file.ts"

// `src/browser/` の深さの上限（`docs/architecture/directory.md`「ページの形」）。
// 深さは `src/browser/` からファイルの置かれたディレクトリまでのディレクトリの数。
const MAX_BROWSER_DEPTH = 6

const MAX_DEEP_DIRECTORY_EXCEPTIONS = 120

// 上限を超えたまま残っている、深さ 7 のディレクトリ（`browser/` からの相対パス）。
// この下のファイルは深さを数えない。移し終えたら一覧から消す。
const DEEP_DIRECTORY_EXCEPTIONS: ReadonlySet<string> = new Set([
  "components/page/conversation/components/main-view/components/aside-thread",
  "components/page/conversation/components/main-view/components/current-step",
  "components/page/conversation/components/main-view/components/head-notice",
  "components/page/conversation/components/main-view/components/inquiry-jump-float",
  "components/page/conversation/components/main-view/components/mini-portrait",
  "components/page/conversation/components/main-view/components/phase-list",
  "components/page/conversation/components/main-view/components/question-record",
  "components/page/conversation/components/main-view/components/report",
  "components/page/conversation/components/main-view/components/report-head",
  "components/page/conversation/components/main-view/components/report-outline",
  "components/page/conversation/components/main-view/components/request-block",
  "components/page/conversation/components/main-view/components/selection-ask",
  "components/page/conversation/components/main-view/components/turn",
  "components/page/conversation/components/main-view/components/turn-card-head",
  "components/page/conversation/components/main-view/components/turn-failure-block",
  "components/page/conversation/components/main-view/components/turn-list",
  "components/page/conversation/components/main-view/components/welcome",
  "components/page/conversation/components/main-view/components/work-strip",
])

describe("src/browser/ の深さ", () => {
  it(`src/browser/ のファイルは、除外の一覧の下を除いて深さ ${String(MAX_BROWSER_DEPTH)} 以内`, () => {
    const files = browserFiles()
    expect(files.length).toBeGreaterThan(0)

    const offenders = files
      .filter((path) => browserDepthOf(path) > MAX_BROWSER_DEPTH && !isUnderException(path))
      .map((path) => `src/browser/${path}（深さ ${String(browserDepthOf(path))}）`)

    expect(offenders.join("\n")).toBe("")
  })

  it("除外の一覧の各件の下に、深さが上限を超えるファイルが残っている", () => {
    const deepFiles = browserFiles().filter((path) => browserDepthOf(path) > MAX_BROWSER_DEPTH)

    const staleExceptions = [...DEEP_DIRECTORY_EXCEPTIONS].filter(
      (directory) => !deepFiles.some((path) => path.startsWith(`${directory}/`)),
    )

    expect(staleExceptions.join("\n")).toBe("")
  })

  it(`除外の一覧は ${String(MAX_DEEP_DIRECTORY_EXCEPTIONS)} 件以下`, () => {
    expect(DEEP_DIRECTORY_EXCEPTIONS.size).toBeLessThanOrEqual(MAX_DEEP_DIRECTORY_EXCEPTIONS)
  })
})

/** `src/browser/` の下の `.ts` / `.tsx` / `.css`（`browser/` からの相対パス）。 */
function browserFiles(): readonly string[] {
  const browserRoot = `${SRC_ROOT}/browser`
  return listSourceFiles(browserRoot, browserRoot, [".ts", ".tsx", ".css"])
}

function browserDepthOf(path: string): number {
  return path.split("/").length - 1
}

function isUnderException(path: string): boolean {
  return [...DEEP_DIRECTORY_EXCEPTIONS].some((directory) => path.startsWith(`${directory}/`))
}
