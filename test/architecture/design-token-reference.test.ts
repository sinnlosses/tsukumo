import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { REPOSITORY_SCAN_TIMEOUT_MS } from "../fixture/repository-scan-timeout.ts"
import { cssDefinitions, tsDefinitions, undefinedReferences } from "./design-token-reference.ts"
import { listSourceFiles, SRC_ROOT } from "./source-file.ts"

describe("design-token-reference", () => {
  it(
    "src/browser/ の CSS の var(--名)（予備値なし）が、どこかの CSS の宣言か TS の差し込みに定義を持つ",
    () => {
      const read = (relPath: string) => readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")
      const browser = (extensions: readonly string[]) =>
        listSourceFiles(SRC_ROOT, SRC_ROOT, extensions).filter((relPath) =>
          relPath.startsWith("browser/"),
        )
      const cssByFile = new Map(browser([".css"]).map((relPath) => [relPath, read(relPath)]))
      const definitions = new Set([
        ...[...cssByFile.values()].flatMap(cssDefinitions),
        ...browser([".ts", ".tsx"]).flatMap((relPath) => tsDefinitions(read(relPath))),
      ])

      expect(
        undefinedReferences(cssByFile, definitions).join("\n"),
        "定義の無い変数を var() で参照している。消したトークンの参照が残っていないか見て、theme.css に足すか参照を直す",
      ).toBe("")
    },
    REPOSITORY_SCAN_TIMEOUT_MS,
  )

  it("定義の無い参照を落とし、予備値つきの参照と、TS で差す変数・CSS の局所定義を通す", () => {
    const css = new Map([
      ["a.css", ".a { color: var(--missing); gap: var(--gone, 4px); width: var(--from-ts); }"],
      ["b.css", "/* var(--in-comment) */ .b { --local: 1px; height: var(--local); }"],
    ])
    const definitions = new Set([
      ...[...css.values()].flatMap(cssDefinitions),
      ...tsDefinitions(`const style = { "--from-ts": "1px" }`),
    ])

    expect(undefinedReferences(css, definitions)).toEqual(["a.css: --missing"])
  })
})
