// `cd` を追った作業ディレクトリの遷移を、関数で確かめる。

import { describe, expect, test } from "vitest"

import { parseShellCommand } from "../../../../scripts/hook/lib/shell-command.ts"
import {
  directoryAfter,
  directoryAfterUnsure,
  locatePath,
  type WorkingDirectory,
} from "../../../../scripts/hook/lib/working-directory.ts"

const KNOWN: WorkingDirectory = { kind: "known", path: "/work/tree/sub" }
const UNKNOWN: WorkingDirectory = { kind: "unknown" }

function after(command: string, directory: WorkingDirectory): WorkingDirectory {
  return parseShellCommand(command).reduce(
    (current, simple) => directoryAfter(simple, current),
    directory,
  )
}

describe("directoryAfter", () => {
  test("決まっているとき cd の絶対パスと相対パスは決まったまま", () => {
    expect(after("cd /elsewhere", KNOWN)).toEqual({ kind: "known", path: "/elsewhere" })
    expect(after("cd ../other", KNOWN)).toEqual({ kind: "known", path: "/work/tree/other" })
  })

  test("決まっているときでも cd - ・変数・popd・引数2つは決まらない", () => {
    expect(after("cd -", KNOWN)).toEqual(UNKNOWN)
    expect(after("cd $X", KNOWN)).toEqual(UNKNOWN)
    expect(after("popd", KNOWN)).toEqual(UNKNOWN)
    expect(after("cd a b", KNOWN)).toEqual(UNKNOWN)
  })

  test("決まらないとき cd の絶対パスで決まり、相対パスでは決まらないまま", () => {
    expect(after("cd /elsewhere", UNKNOWN)).toEqual({ kind: "known", path: "/elsewhere" })
    expect(after("cd sub", UNKNOWN)).toEqual(UNKNOWN)
  })

  test("cd 以外のコマンドでは変わらない", () => {
    expect(after("ls -la", KNOWN)).toEqual(KNOWN)
    expect(after("ls -la", UNKNOWN)).toEqual(UNKNOWN)
  })
})

describe("directoryAfterUnsure", () => {
  test("cd 系は決まらず、それ以外は変わらない", () => {
    const unsure = (command: string, directory: WorkingDirectory): WorkingDirectory =>
      parseShellCommand(command).reduce(
        (current, simple) => directoryAfterUnsure(simple, current),
        directory,
      )
    expect(unsure("cd /elsewhere", KNOWN)).toEqual(UNKNOWN)
    expect(unsure("ls", KNOWN)).toEqual(KNOWN)
  })
})

describe("locatePath", () => {
  const locations = (directory: WorkingDirectory): readonly string[] =>
    parseShellCommand("tee ./a.txt /abs.txt").flatMap((simple) =>
      simple.argv.slice(1).map((word) => locatePath(word, directory, "/work/tree")),
    )

  test("作業ディレクトリが決まらないと相対パスは unknown、絶対パスは解く", () => {
    expect(locations(UNKNOWN)).toEqual(["unknown", "outside"])
  })

  test("作業ディレクトリが決まっていれば相対パスを解く", () => {
    expect(locations(KNOWN)).toEqual(["inside", "outside"])
  })
})
