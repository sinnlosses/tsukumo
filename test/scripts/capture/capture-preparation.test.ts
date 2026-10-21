import { parseArgs } from "node:util"

import { describe, expect, test } from "vitest"

import {
  describeCatalogMiss,
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

  test("--press は値1つのキー名を、ほかの手と書いた順に並べる", () => {
    expect(
      readArguments(["--click", "a", "--press", "Escape", "--wait-after", "b"])?.preparations,
    ).toEqual([
      { kind: "click", selector: "a" },
      { kind: "press", key: "Escape" },
      { kind: "wait", selector: "b" },
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
    expect(() => readArguments(["--foo", "x"])).toThrow("Unknown option '--foo'")
    expect(() => readArguments(["--click"])).toThrow("Option '--click <value>' argument missing")
    expect(() => readArguments(["--advance", "-5"])).toThrow(
      "Option '--advance' argument is ambiguous",
    )
  })
})

describe("describeCatalogMiss", () => {
  test("件の名前と窓の名前を手の説明の前に置く", () => {
    expect(
      describeCatalogMiss("question-multi", "wide", { kind: "click", selector: "button" }),
    ).toBe("当てられなかった: question-multi（wide）: button を押す")
    expect(
      describeCatalogMiss("question-preview-image", "narrow", { kind: "hover", selector: "a" }),
    ).toBe("当てられなかった: question-preview-image（narrow）: a に触れる")
  })

  test("press はキー名を言う", () => {
    expect(describeCatalogMiss("session-resume", "narrow", { kind: "press", key: "Escape" })).toBe(
      "当てられなかった: session-resume（narrow）: Escape キーを押す",
    )
  })
})
