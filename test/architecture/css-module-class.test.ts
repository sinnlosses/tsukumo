import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  REPORT_DRAWN_MARK_NAMES,
  REPORT_NOTATION_NAMES,
} from "../../src/shared/report/report-notation.ts"
import { cssClassNames } from "../css-class-name.ts"
import { importedPartsOf } from "./css-imported-part.ts"
import { listSourceFiles, resolveRelativeImport, SRC_ROOT } from "./source-file.ts"

describe("CSS Modules の class", () => {
  it("*.css はどれも読まれ、CSS Modules のセレクタに書いた class は tsx から styles で参照されているか、許可リストにある", () => {
    const moduleCssFiles = listSourceFiles(SRC_ROOT, SRC_ROOT, [".module.css"])
    // `.module.css` が `@import` する `.css` は、その入口に束ねられる部品。
    const entryByPart = new Map(
      moduleCssFiles.flatMap((entry) =>
        importedPartsOf(entry).map((part) => [part, entry] as const),
      ),
    )
    expect(entryByPart.size).toBeGreaterThan(0)

    const readersByCss = new Map<string, readonly string[]>()
    for (const relPath of listSourceFiles(SRC_ROOT)) {
      const content = readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")
      for (const importMatch of content.matchAll(
        /import\s+(?:\w+\s+from\s+)?["'](\.[^"']+\.css)["']/g,
      )) {
        const cssRelPath = resolveRelativeImport(relPath, importMatch[1] ?? "")
        readersByCss.set(cssRelPath, [...(readersByCss.get(cssRelPath) ?? []), content])
      }
    }

    // `composes: <名前…> from "<相対パス>"` が名指した class は、その CSS の参照済みに数える。
    const composedClassesByCss = new Map<string, ReadonlySet<string>>()
    for (const cssRelPath of listSourceFiles(SRC_ROOT, SRC_ROOT, [".css"])) {
      const content = readFileSync(`${SRC_ROOT}/${cssRelPath}`, "utf8")
      for (const match of content.matchAll(/composes:\s*([\w\s-]+?)\s+from\s+"(\.[^"]+)"/g)) {
        const target = resolveRelativeImport(cssRelPath, match[2] ?? "")
        composedClassesByCss.set(
          target,
          new Set([...(composedClassesByCss.get(target) ?? []), ...(match[1] ?? "").split(/\s+/)]),
        )
      }
    }

    const offenders = listSourceFiles(SRC_ROOT, SRC_ROOT, [".css"]).flatMap((cssRelPath) => {
      const readers = readersByCss.get(entryByPart.get(cssRelPath) ?? cssRelPath)
      const composed = composedClassesByCss.get(cssRelPath)
      if (readers === undefined && composed === undefined) {
        return [`src/${cssRelPath}: どこからも import・@import されていない`]
      }
      return cssClassNames(readFileSync(`${SRC_ROOT}/${cssRelPath}`, "utf8"))
        .filter(
          (className) =>
            !REPORT_NOTATION_CLASS_NAMES.has(className) &&
            composed?.has(className) !== true &&
            !(readers ?? []).some((content) => isCssClassReferenced(content, className)) &&
            !FOREIGN_CSS_CLASS_PREFIXES.some((prefix) => className.startsWith(prefix)),
        )
        .map((className) => `src/${cssRelPath}: .${className} がどの tsx からも参照されていない`)
    })

    expect(offenders.join("\n")).toBe("")
  })
})

/**
 * 読み手のソースに、class 名が文字列として現れるか。`styles[\`prefix-${x}\`]` のように
 * 後ろを組み立てる綴りは、接頭辞までの一致で参照とみなす。
 * 接頭辞がちょうど `report-` の綴りは名前の表が引くので数えない。
 */
function isCssClassReferenced(content: string, className: string): boolean {
  if (content.includes(`"${className}"`) || content.includes(`.${className}`)) {
    return true
  }
  return [...content.matchAll(/`([\w-]+)\$\{/g)].some(
    (match) => match[1] !== "report-" && className.startsWith(match[1] ?? "\0"),
  )
}

/** `styles[\`report-${name}\`]` が解く、レポートの記法の名前の表。 */
const REPORT_NOTATION_CLASS_NAMES: ReadonlySet<string> = new Set(
  [...REPORT_NOTATION_NAMES, ...REPORT_DRAWN_MARK_NAMES].map((name) => `report-${name}`),
)

// tsx 以外（rehype・CodeMirror・Astryx の stable class）が付ける class と、domain/reveal が生の class 名で選ぶために
// styles を介さず literal で付ける class の接頭辞。
const FOREIGN_CSS_CLASS_PREFIXES = ["cm-", "chart-block", "mermaid", "astryx-"] as const
