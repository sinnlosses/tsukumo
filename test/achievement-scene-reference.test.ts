import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

// 成果の振り返りで「数えられない・読めない」場面の名前は、要件定義の「数えられない・読めないとき」の表の
// 1か所だけに書く。ほかの文書は節の名前で引く。場面の名前は表の「場面」列から読む。

const DOCS_ROOT = fileURLToPath(new URL("../docs", import.meta.url))
const CANON_FILE = "requirements.md"
const SECTION_HEADING = "#### 数えられない・読めないとき"

function readSceneNames(canon: string): readonly string[] {
  const body = canon.split(`\n${SECTION_HEADING}\n`)[1]?.split(/\n#{2,4} /)[0] ?? ""
  return body
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .map((line) => line.split("|")[1]?.trim() ?? "")
    .filter((name) => name !== "")
}

function listMarkdownFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === "history" ? [] : listMarkdownFiles(path)
    }
    return entry.name.endsWith(".md") ? [path] : []
  })
}

describe("数えられない・読めないときの場面の名前", () => {
  const sceneNames = readSceneNames(readFileSync(join(DOCS_ROOT, CANON_FILE), "utf8"))

  it("正典の表から場面の名前を読める", () => {
    expect(sceneNames.length).toBeGreaterThanOrEqual(2)
  })

  it("正典のほかの文書に場面の名前を書かない", () => {
    const copies = listMarkdownFiles(DOCS_ROOT)
      .filter((path) => relative(DOCS_ROOT, path) !== CANON_FILE)
      .flatMap((path) => {
        const text = readFileSync(path, "utf8")
        return sceneNames
          .filter((name) => text.includes(name))
          .map((name) => `${relative(DOCS_ROOT, path)}: ${name}`)
      })
    expect(copies).toEqual([])
  })
})
