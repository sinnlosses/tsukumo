import { mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  collectMissingFileReferences,
  collectStrayReferences,
} from "../../../scripts/document/lib/repository-reference.ts"
import {
  formatMissingFileReference,
  formatStrayReference,
} from "../../../scripts/document/section-reference.ts"
import { REPOSITORY_ROOT } from "../../../scripts/shared/repository-root.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

// 正典の節を「ファイル名＋番号＋「句」」で引いている参照が、参照先に残っているかを0件に保つ。
// `docs/` の節を削る・移したときに、引かれていた句が消えたことをここで知る（拾う形と照合の
// 強さは `findSectionReferences` に書いてある）。「」の無い素のパスは、指すファイルがあるかを0件に保つ。一覧を見るだけなら
// `node scripts/document/find-stray-reference.ts`。

describe("節の参照", () => {
  it("引いている句はすべて参照先のファイルに残っている", () => {
    expect(collectStrayReferences(REPOSITORY_ROOT).map(formatStrayReference)).toEqual([])
  })

  it("docs/ 以下の .md を指すパスはすべて実在する", () => {
    expect(collectMissingFileReferences(REPOSITORY_ROOT).map(formatMissingFileReference)).toEqual(
      [],
    )
  })
})

// このファイル自身も拾われる側なので、`docs/` で始まる `.md` のパスは定数から組み立てて書く。
const DOCS = "docs"

describe("読む対象の集め方", () => {
  const tempDir = useTempDir("reference-scan")

  it("依存物・vendor・シンボリックリンクは読まず、ドットで始まるディレクトリの中は読む", () => {
    const root = tempDir()
    const files: Record<string, string> = {
      [`${DOCS}/index.md`]: `${DOCS}/missing-plain.md\n`,
      ".claude/rules/rule.md": `${DOCS}/missing-dot.md\n`,
      "node_modules/pkg/readme.md": `${DOCS}/missing-skipped.md\n`,
      "vendor/lib/readme.md": `${DOCS}/missing-vendor.md\n`,
      "external/x.md": `${DOCS}/missing-ext.md\n`,
      "external/vendor/y.md": `${DOCS}/missing-normal-vendor.md\n`,
      ".claude/node_modules/p/readme.md": `${DOCS}/missing-dot-parent.md\n`,
      ".claude/x/.m/vendor/w.md": `${DOCS}/missing-nested-vendor.md\n`,
      ".claude/.git/g.md": `${DOCS}/missing-dot-git.md\n`,
      [`${DOCS}/.m/dist/z.md`]: `${DOCS}/missing-dot-dist.md\n`,
    }
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(join(root, file, ".."), { recursive: true })
      writeFileSync(join(root, file), text)
    }
    symlinkSync(join(root, "external/x.md"), join(root, DOCS, "linked.md"))
    symlinkSync(join(root, "external"), join(root, DOCS, "linkdir"))
    expect(
      collectMissingFileReferences(root)
        .map(({ targetPath }) => targetPath)
        .toSorted(),
    ).toEqual([`${DOCS}/missing-dot.md`, `${DOCS}/missing-ext.md`, `${DOCS}/missing-plain.md`])
  })
})
