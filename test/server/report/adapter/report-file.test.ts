import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { readReportBlockFiles } from "../../../../src/server/report/adapter/report-file.ts"
import type { ReportSection } from "../../../../src/shared/report/report-block.ts"
import { reportOutline, sectionLeaves } from "../../../../src/shared/report/report-outline.ts"
import { reportOfSections } from "../../../fixture/report-event.ts"

const sectionsOf = (paths: readonly string[]) =>
  sectionLeaves(reportOutline(reportOfSections(codeSections(paths)).components))

const codeSections = (paths: readonly string[]): readonly ReportSection[] => [
  {
    heading: "",
    shapeTag: "unspecified",
    blocks: paths.map((path) => ({
      kind: "code" as const,
      language: "text",
      path,
      source: "",
      marks: [],
      fold: "",
      aside: "",
    })),
  },
]

describe("readReportBlockFiles", () => {
  it("読めたファイルの中身を path をキーにして返す", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "tsukumo-report-file-"))
    writeFileSync(join(cwd, "fixture.txt"), "架空の中身")

    const contents = await readReportBlockFiles(cwd, sectionsOf(["fixture.txt"]))

    expect(contents.get("fixture.txt")).toBe("架空の中身")
  })

  it("無い・path が空文字の塊は Map に入らない", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "tsukumo-report-file-"))

    const contents = await readReportBlockFiles(cwd, sectionsOf(["no-such-file.txt", ""]))

    expect(contents.size).toBe(0)
  })

  it("ディレクトリを指す path は読まない", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "tsukumo-report-file-"))
    mkdtempSync(join(cwd, "a-dir-"))

    const contents = await readReportBlockFiles(cwd, sectionsOf(["."]))

    expect(contents.size).toBe(0)
  })

  it("上限（1 MiB）を超えるファイルは読まない", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "tsukumo-report-file-"))
    writeFileSync(join(cwd, "big.txt"), "x".repeat(1024 * 1024 + 1))

    const contents = await readReportBlockFiles(cwd, sectionsOf(["big.txt"]))

    expect(contents.size).toBe(0)
  })

  it("NUL バイトを含むバイナリは読まない", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "tsukumo-report-file-"))
    writeFileSync(join(cwd, "binary.bin"), Buffer.from([0, 1, 2]))

    const contents = await readReportBlockFiles(cwd, sectionsOf(["binary.bin"]))

    expect(contents.size).toBe(0)
  })
})
