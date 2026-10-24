import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { listSourceFiles, SRC_ROOT } from "./source-file.ts"

/** `@keyframes` を名前と、コメントと空白を畳んだ本文に分ける（入れ子の `{}` は数えて閉じる）。 */
function keyframesBodies(css: string): readonly { readonly name: string; readonly body: string }[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "")
  return [...source.matchAll(/@keyframes\s+([^\s{]+)\s*\{/g)].flatMap((match) => {
    const start = (match.index ?? 0) + match[0].length
    let depth = 1
    let end = start
    while (end < source.length && depth > 0) {
      depth += source[end] === "{" ? 1 : source[end] === "}" ? -1 : 0
      end += 1
    }
    const body = source
      .slice(start, end - 1)
      .replace(/\bfrom\b/g, "0%")
      .replace(/\bto\b/g, "100%")
      .replace(/\s+/g, " ")
      .replace(/\s*([{}:;,])\s*/g, "$1")
      .trim()
    return [{ name: match[1] ?? "", body }]
  })
}

/** 中身が同じ `@keyframes` を2つ以上のところに置いている組を、`path: 名前` の行で返す。 */
function duplicateKeyframes(files: ReadonlyMap<string, string>): readonly string[] {
  const byBody = new Map<string, string[]>()
  for (const [path, css] of files) {
    for (const { name, body } of keyframesBodies(css)) {
      byBody.set(body, [...(byBody.get(body) ?? []), `${path}: ${name}`])
    }
  }
  return [...byBody.values()].filter((places) => places.length > 1).map((p) => p.join(" と "))
}

describe("@keyframes", () => {
  it("見本: 名前・空白・コメント・from が違うだけの同じ中身は重複として見つかる", () => {
    const duplicates = duplicateKeyframes(
      new Map([
        ["x.css", "@keyframes a { to { transform: rotate(360deg); } }"],
        ["y.css", "/* c */ @keyframes b{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}"],
        ["z.css", "@keyframes c { to { transform: rotate(360deg); } }"],
      ]),
    )
    expect(duplicates).toHaveLength(1)
    expect(duplicates[0]).toContain("x.css: a")
    expect(duplicates[0]).toContain("z.css: c")
  })

  it("見本: to と 100% で書いた同じ中身は重複として見つかる", () => {
    const duplicates = duplicateKeyframes(
      new Map([
        ["x.css", "@keyframes a { from { opacity: 0 } to { opacity: 1 } }"],
        ["y.css", "@keyframes b { 0% { opacity: 0 } 100% { opacity: 1 } }"],
      ]),
    )
    expect(duplicates).toHaveLength(1)
  })

  it("src/browser/ の *.css（モジュールでないものも）に、中身が同じ @keyframes を2つ置かない", () => {
    const files = new Map(
      listSourceFiles(SRC_ROOT, SRC_ROOT, [".css"])
        .filter((relPath) => relPath.startsWith("browser/"))
        .map((relPath): [string, string] => [
          `src/${relPath}`,
          readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"),
        ]),
    )
    expect(duplicateKeyframes(files).join("\n")).toBe("")
  })
})
