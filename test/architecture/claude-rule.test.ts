// .claude/rules/*.md の paths: の glob が、リポジトリのファイルに当たることの検査。

import { readdirSync, readFileSync } from "node:fs"
import { matchesGlob } from "node:path"

import { describe, expect, it } from "vitest"

import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import { runSubprocessOrThrow } from "../fixture/subprocess.ts"

const RULES_DIR = `${REPOSITORY_ROOT}/.claude/rules`

type Rule = { readonly name: string; readonly content: string }

describe(".claude/rules の paths", () => {
  it("各ルールの paths: の glob が、git ls-files の1件以上に当たる", async () => {
    const rules = readdirSync(RULES_DIR)
      .filter((name) => name.endsWith(".md"))
      .map((name) => ({ name, content: readFileSync(`${RULES_DIR}/${name}`, "utf8") }))
    const listing = await runSubprocessOrThrow(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      { cwd: REPOSITORY_ROOT },
    )

    expect(unmatchedGlobs(rules, listing.split("\n").filter(Boolean))).toEqual([])
  })

  it("当たるファイルが無い glob（src/shared/**/*.tsx）を与えると unmatchedGlobs が返す", () => {
    const rules: readonly Rule[] = [
      {
        name: "a.md",
        content: '---\npaths:\n  - "src/shared/**/*.tsx"\n  - "src/**/*.{ts,tsx}"\n---\n# a\n',
      },
      { name: "b.md", content: "# frontmatter なし\n" },
      { name: "c.md", content: "---\ntitle: x\n---\n# paths なし\n" },
    ]

    expect(unmatchedGlobs(rules, ["src/shared/x.ts", "src/browser/y.tsx"])).toEqual([
      "a.md: src/shared/**/*.tsx",
    ])
  })

  it("波括弧と ** の glob を読み取れる", () => {
    const content = '---\npaths:\n  - "src/**/*.{ts,tsx}"\n  - "docs/**/*.md"\n---\n# x\n'

    expect(pathGlobs(content)).toEqual(["src/**/*.{ts,tsx}", "docs/**/*.md"])
    expect(pathGlobs("# frontmatter なし\n")).toEqual([])
  })
})

/** どのファイルにも当たらない glob を「ルール名: glob」で返す。 */
function unmatchedGlobs(rules: readonly Rule[], files: readonly string[]): readonly string[] {
  return rules.flatMap(({ name, content }) =>
    pathGlobs(content)
      .filter((glob) => !files.some((file) => matchesGlob(file, glob)))
      .map((glob) => `${name}: ${glob}`),
  )
}

/** frontmatter の `paths:` に並ぶ `- "…"` を順に返す。frontmatter か `paths:` が無ければ空。 */
function pathGlobs(content: string): readonly string[] {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)?.[1]
  if (frontmatter === undefined) {
    return []
  }
  const block = /^paths:\n((?:[ \t]+-[^\n]*\n?)*)/m.exec(frontmatter)?.[1] ?? ""
  return [...block.matchAll(/^\s*-\s*"([^"]+)"/gm)].flatMap(([, glob]) => glob ?? [])
}
