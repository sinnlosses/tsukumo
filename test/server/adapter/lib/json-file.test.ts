import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { readJsonFile, writeJsonFile } from "../../../../src/server/adapter/lib/json-file.ts"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-json-file-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("readJsonFile", () => {
  it("読めないファイルは undefined", () => {
    expect(readJsonFile(join(dir, "no-such-file.json"))).toBeUndefined()
  })

  it("壊れた JSON は undefined", () => {
    const path = join(dir, "broken.json")
    writeFileSync(path, "{ 壊れた")
    expect(readJsonFile(path)).toBeUndefined()
  })

  it("書いた値をそのまま読む", () => {
    const path = join(dir, "value.json")
    writeFileSync(path, JSON.stringify({ name: "架空の値", count: 1 }))
    expect(readJsonFile(path)).toEqual({ name: "架空の値", count: 1 })
  })
})

describe("writeJsonFile", () => {
  it("ディレクトリが無ければ作って書く", () => {
    const path = join(dir, "nested", "value.json")
    writeJsonFile(path, { seq: 1 })
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ seq: 1 })
  })

  it("書けなくても例外を投げない（常駐プロセスを落とさない）", () => {
    const blocked = join(dir, "blocked")
    writeFileSync(blocked, "")
    const path = join(blocked, "value.json")

    expect(() => writeJsonFile(path, { seq: 1 })).not.toThrow()
  })

  it("書き込み先がディレクトリで塞がっていても例外を投げない", () => {
    const path = join(dir, "value.json")
    mkdirSync(path)
    expect(() => writeJsonFile(path, { seq: 1 })).not.toThrow()
  })
})
