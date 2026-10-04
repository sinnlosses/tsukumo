import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { writeFileAtomic } from "../../../../src/server/adapter/lib/atomic-file.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("atomic-file")

describe("writeFileAtomic", () => {
  it("書いた中身をそのまま読める", () => {
    const path = join(dir(), "value.json")
    writeFileAtomic(path, "架空の中身")
    expect(readFileSync(path, "utf8")).toBe("架空の中身")
  })

  it("既存のファイルを置き換え、一時ファイルを残さない", () => {
    const path = join(dir(), "value.json")
    writeFileSync(path, "古い中身")
    writeFileAtomic(path, "新しい中身")
    expect(readFileSync(path, "utf8")).toBe("新しい中身")
    expect(readdirSync(dir())).toEqual(["value.json"])
  })

  it("置き換えに失敗したら例外を投げ、一時ファイルを残さず元も変えない", () => {
    const path = join(dir(), "occupied")
    mkdirSync(path)
    writeFileSync(join(path, "inner.txt"), "元の中身")
    expect(() => writeFileAtomic(path, "新しい中身")).toThrow()
    expect(readdirSync(dir())).toEqual(["occupied"])
    expect(readFileSync(join(path, "inner.txt"), "utf8")).toBe("元の中身")
  })

  it("書けない場所では例外を投げる", () => {
    expect(() => writeFileAtomic(join(dir(), "no-such-dir", "value.json"), "中身")).toThrow()
  })
})
