import { mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  countBySource,
  findHubReferenceDrifts,
  formatHubReferenceDrift,
} from "../../../scripts/document/hub-reference.ts"
import {
  collectHistoryFileReferences,
  collectHubReferences,
  collectMissingFileReferences,
  collectMissingSourcePathReferences,
  collectStrayReferences,
} from "../../../scripts/document/lib/repository-reference.ts"
import {
  formatMissingFileReference,
  formatStrayReference,
} from "../../../scripts/document/section-reference.ts"
import { REPOSITORY_ROOT } from "../../../scripts/shared/repository-root.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"
import { FROZEN_HUB_REFERENCE_COUNTS } from "./lib/frozen-hub-reference.ts"

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

  it("ハブを句付きで指す参照は、凍結した一覧の件数と合う", () => {
    const actual = countBySource(collectHubReferences(REPOSITORY_ROOT))
    expect(
      findHubReferenceDrifts(actual, FROZEN_HUB_REFERENCE_COUNTS).map(formatHubReferenceDrift),
    ).toEqual([])
  })

  it("文書が指す test/・scripts/・src/ のパスはすべて実在する", () => {
    expect(
      collectMissingSourcePathReferences(REPOSITORY_ROOT).map(formatMissingFileReference),
    ).toEqual([])
  })
})

// このファイル自身も拾われる側なので、`docs/` で始まる `.md` のパスは定数から組み立てて書く。
const DOCS = "docs"

const HISTORY = `${DOCS}/history`

describe("作業ツリーから外した記録への参照", () => {
  const tempDir = useTempDir("history-reference")

  it("src/・scripts/・docs/ に tasks.md・progress.md を指す参照が無い", () => {
    expect(collectHistoryFileReferences(REPOSITORY_ROOT)).toEqual([])
  })

  it("src/・scripts/・docs/ の中の参照を拾い、残す記録・ディレクトリ名だけ・history 自身・test/ は拾わない", () => {
    const root = tempDir()
    const files: Record<string, string> = {
      "src/a.ts": `// ${HISTORY}/tasks.md\n`,
      [`${DOCS}/x.md`]: `ok\n${HISTORY}/progress.md\n`,
      [`${DOCS}/keep.md`]: `${HISTORY}/decision.md ${HISTORY}/ ${DOCS}/research/tasks.md\n`,
      [`${HISTORY}/inner.md`]: `${HISTORY}/tasks.md\n`,
      "test/t.ts": `${HISTORY}/tasks.md\n`,
    }
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(join(root, file, ".."), { recursive: true })
      writeFileSync(join(root, file), text)
    }
    expect(
      collectHistoryFileReferences(root).map(({ sourcePath, line }) => `${sourcePath}:${line}`),
    ).toEqual([`${DOCS}/x.md:2`, "src/a.ts:1"])
  })
})

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

  it("test/ のパスは、実在するものを通し、無いものを落とす", () => {
    const root = tempDir()
    mkdirSync(join(root, DOCS), { recursive: true })
    mkdirSync(join(root, "test/scripts/hook"), { recursive: true })
    writeFileSync(join(root, "test/scripts/hook/new-name.test.ts"), "")
    writeFileSync(
      join(root, DOCS, "index.md"),
      "`test/scripts/hook/new-name.test.ts` `test/scripts/hook/old-name.test.ts`\n",
    )
    expect(collectMissingSourcePathReferences(root).map(({ targetPath }) => targetPath)).toEqual([
      "test/scripts/hook/old-name.test.ts",
    ])
  })
})
