import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  readJsonFile,
  versionedJsonFile,
  writeJsonFile,
} from "../../../../src/server/adapter/lib/json-file.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("json-file")

describe("readJsonFile", () => {
  it("読めないファイルは undefined", () => {
    expect(readJsonFile(join(dir(), "no-such-file.json"))).toBeUndefined()
  })

  it("壊れた JSON は undefined", () => {
    const path = join(dir(), "broken.json")
    writeFileSync(path, "{ 壊れた")
    expect(readJsonFile(path)).toBeUndefined()
  })

  it("書いた値をそのまま読む", () => {
    const path = join(dir(), "value.json")
    writeFileSync(path, JSON.stringify({ name: "架空の値", count: 1 }))
    expect(readJsonFile(path)).toEqual({ name: "架空の値", count: 1 })
  })
})

describe("versionedJsonFile", () => {
  const schema = z.object({ name: z.string(), count: z.number() })
  const open = (path: string, version = 1) => versionedJsonFile({ version, schema, path })

  it("書いて読み戻す（本文に v は含まれない）", () => {
    const path = join(dir(), "versioned.json")
    const file = open(path)
    expect(file.write({ name: "架空の値", count: 2 })).toBe(true)
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ v: 1, name: "架空の値", count: 2 })
    expect(file.read()).toEqual({ name: "架空の値", count: 2 })
  })

  it("ファイルが無ければ undefined", () => {
    expect(open(join(dir(), "none.json")).read()).toBeUndefined()
  })

  it("版が違えば undefined", () => {
    const path = join(dir(), "old.json")
    open(path, 1).write({ name: "架空の値", count: 2 })
    expect(open(path, 2).read()).toBeUndefined()
  })

  it("形が違えば undefined", () => {
    const path = join(dir(), "shape.json")
    writeFileSync(path, JSON.stringify({ v: 1, name: 1 }))
    expect(open(path).read()).toBeUndefined()
  })

  it("書けない場所では write が false", () => {
    const blocked = join(dir(), "blocked-v")
    writeFileSync(blocked, "")
    expect(open(join(blocked, "value.json")).write({ name: "架空の値", count: 2 })).toBe(false)
  })
})

describe("writeJsonFile", () => {
  it("ディレクトリが無ければ作って書く", () => {
    const path = join(dir(), "nested", "value.json")
    writeJsonFile(path, { seq: 1 })
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ seq: 1 })
  })

  it("書けなくても例外を投げない（常駐プロセスを落とさない）", () => {
    const blocked = join(dir(), "blocked")
    writeFileSync(blocked, "")
    const path = join(blocked, "value.json")

    expect(() => writeJsonFile(path, { seq: 1 })).not.toThrow()
  })
})
