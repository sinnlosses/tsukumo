import { parseArgs } from "node:util"

import { describe, expect, test } from "vitest"

import {
  PREPARATION_OPTIONS,
  readPreparations,
} from "../../../scripts/capture/lib/capture-preparation.ts"

function readArguments(args: readonly string[]) {
  const { tokens } = parseArgs({
    args: [...args],
    strict: true,
    allowPositionals: true,
    tokens: true,
    options: { ...PREPARATION_OPTIONS, out: { type: "string" } },
  })
  return readPreparations(tokens)
}

describe("readPreparations", () => {
  test("--click・--hover・--hash・--wait-after は値1つを使う", () => {
    expect(
      readArguments(["--click", "button", "--hover", "a", "--hash", "#diary"])?.preparations,
    ).toEqual([
      { kind: "click", selector: "button" },
      { kind: "hover", selector: "a" },
      { kind: "hash", hash: "#diary" },
    ])
    expect(readArguments(["--wait-after", "[role=table]"])?.preparations).toEqual([
      { kind: "wait", selector: "[role=table]" },
    ])
  })

  test("書いた順を保ち、準備でない旗は飛ばす", () => {
    expect(
      readArguments(["--out", "x.png", "--hover", "a", "--click", "b", "--hover", "c"])
        ?.preparations,
    ).toEqual([
      { kind: "hover", selector: "a" },
      { kind: "click", selector: "b" },
      { kind: "hover", selector: "c" },
    ])
  })

  test("--type は直後の位置引数を2つ目の値にし、その token を使ったと返す", () => {
    const result = readArguments(["--click", "a", "--type", "textarea", "/", "--hover", "b"])
    expect(result?.preparations).toEqual([
      { kind: "click", selector: "a" },
      { kind: "type", selector: "textarea", text: "/" },
      { kind: "hover", selector: "b" },
    ])
    expect([...(result?.textTokenIndexes ?? [])]).toEqual([2])
  })

  test("--type の2つ目の値が無い（末尾・次が旗）ときは崩れた引数", () => {
    expect(readArguments(["--type", "textarea"])).toBeUndefined()
    expect(readArguments(["--type", "textarea", "--click", "b"])).toBeUndefined()
  })

  test("--advance は正の整数のミリ秒を読む", () => {
    expect(readArguments(["--advance", "130000"])?.preparations).toEqual([
      { kind: "advance", ms: 130000 },
    ])
    for (const bad of ["0", "1.5", "abc"]) {
      expect(readArguments(["--advance", bad])).toBeUndefined()
    }
  })

  test("知らない旗と値の無い旗は parseArgs の段で落ちる", () => {
    expect(() => readArguments(["--foo", "x"])).toThrow()
    expect(() => readArguments(["--click"])).toThrow()
    expect(() => readArguments(["--advance", "-5"])).toThrow()
  })
})
