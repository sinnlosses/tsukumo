// 書き込みを止める3つの分岐が、どの経路でも何も書かないことを、入口を実際に起こして確かめる。
// 入口はリポジトリの中のパスしか扱わないので、一時ディレクトリはリポジトリの `.tw/local/`（git の外）に作る。

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { REPOSITORY_ROOT } from "../../../scripts/shared/repository-root.ts"
import { runSubprocess } from "../../fixture/subprocess.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const ENTRY = fileURLToPath(new URL("../../../scripts/dev/rewrite-file.ts", import.meta.url))

const outsideTempDir = useTempDir("rewrite-file-outside")

let directory = ""

beforeEach(() => {
  const parent = join(REPOSITORY_ROOT, ".tw", "local")
  mkdirSync(parent, { recursive: true })
  directory = mkdtempSync(join(parent, "rewrite-file-"))
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

function run(...args: readonly string[]) {
  return runSubprocess(process.execPath, [ENTRY, ...args])
}

function write(name: string, text: string): string {
  const path = join(directory, name)
  writeFileSync(path, text)
  return path
}

describe("replace", () => {
  test("全ファイルを置き換え、件数を出す", async () => {
    const first = write("a.txt", "x x")
    const second = write("b.txt", "x")

    const result = await run("replace", "--from", "x", "--to", "y", first, second)

    expect(result.exitCode).toBe(0)
    expect(readFileSync(first, "utf8")).toBe("y y")
    expect(readFileSync(second, "utf8")).toBe("y")
  })

  test("一致が 0 件のファイルが1つでもあれば、どのファイルにも書かない", async () => {
    const matching = write("a.txt", "x")
    const unmatched = write("b.txt", "z")

    const result = await run("replace", "--from", "x", "--to", "y", matching, unmatched)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain(unmatched)
    expect(readFileSync(matching, "utf8")).toBe("x")
  })

  test("リポジトリの外のパスがあれば、どのファイルにも書かない", async () => {
    const inside = write("a.txt", "x")
    const outside = join(outsideTempDir(), "b.txt")
    writeFileSync(outside, "x")

    const result = await run("replace", "--from", "x", "--to", "y", inside, outside)

    expect(result.exitCode).toBe(1)
    expect(readFileSync(inside, "utf8")).toBe("x")
    expect(readFileSync(outside, "utf8")).toBe("x")
  })
})

describe("expand", () => {
  test("値の1件ごとに、出力先のパスと本文の {{名前}} を展開して書く", async () => {
    const template = write("t.txt", "a {{n}}")
    const values = write("v.json", '[{"n":"1"},{"n":"2"}]')

    const result = await run(
      "expand",
      "--template",
      template,
      "--values",
      values,
      "--out",
      join(directory, "o-{{n}}.txt"),
    )

    expect(result.exitCode).toBe(0)
    expect(readFileSync(join(directory, "o-1.txt"), "utf8")).toBe("a 1")
    expect(readFileSync(join(directory, "o-2.txt"), "utf8")).toBe("a 2")
  })

  test("出力先が1つでも既にあれば、--overwrite なしでは、どの出力先にも書かない", async () => {
    const template = write("t.txt", "a {{n}}")
    const values = write("v.json", '[{"n":"1"},{"n":"2"}]')
    const existing = write("o-2.txt", "old")

    const result = await run(
      "expand",
      "--template",
      template,
      "--values",
      values,
      "--out",
      join(directory, "o-{{n}}.txt"),
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain(existing)
    expect(readFileSync(existing, "utf8")).toBe("old")
    expect(() => readFileSync(join(directory, "o-1.txt"), "utf8")).toThrow("ENOENT")
  })

  test("--overwrite があれば既存のファイルも書き換える", async () => {
    const template = write("t.txt", "a {{n}}")
    const values = write("v.json", '[{"n":"2"}]')
    const existing = write("o-2.txt", "old")

    const result = await run(
      "expand",
      "--template",
      template,
      "--values",
      values,
      "--out",
      join(directory, "o-{{n}}.txt"),
      "--overwrite",
    )

    expect(result.exitCode).toBe(0)
    expect(readFileSync(existing, "utf8")).toBe("a 2")
  })

  test("出力先がリポジトリの外なら、どこにも書かない", async () => {
    const template = write("t.txt", "a {{n}}")
    const values = write("v.json", '[{"n":"1"}]')
    const outsideDirectory = outsideTempDir()

    const result = await run(
      "expand",
      "--template",
      template,
      "--values",
      values,
      "--out",
      join(outsideDirectory, "o-{{n}}.txt"),
    )

    expect(result.exitCode).toBe(1)
    expect(() => readFileSync(join(outsideDirectory, "o-1.txt"), "utf8")).toThrow("ENOENT")
  })
})
