import { parseArgs } from "node:util"

import { describe, expect, test } from "vitest"

import {
  collectMisses,
  describeCatalogMiss,
  PREPARATION_OPTIONS,
  type Preparation,
  readPreparations,
} from "../../../../scripts/capture/lib/capture-preparation.ts"

const click = (selector: string): Preparation => ({ kind: "click", selector })

/** `missing` のセレクタの手だけ当たらない。試した順を `tried` に残す。 */
function applier(missing: readonly string[]): {
  apply: (step: Preparation) => Promise<boolean>
  tried: string[]
} {
  const tried: string[] = []
  return {
    tried,
    apply: (step) => {
      if (step.kind === "click") {
        tried.push(step.selector)
        return Promise.resolve(!missing.includes(step.selector))
      }
      return Promise.resolve(true)
    },
  }
}

describe("collectMisses", () => {
  test("全部当たれば空", async () => {
    const { apply } = applier([])
    expect(await collectMisses([click("a"), click("b")], apply, "continue")).toEqual([])
  })

  test("continue は外れを控えて残りも試す", async () => {
    const { apply, tried } = applier(["b"])
    const missed = await collectMisses([click("a"), click("b"), click("c")], apply, "continue")
    expect(missed).toEqual([click("b")])
    expect(tried).toEqual(["a", "b", "c"])
  })

  test("stop は最初の外れで打ち切る", async () => {
    const { apply, tried } = applier(["b"])
    const missed = await collectMisses([click("a"), click("b"), click("c")], apply, "stop")
    expect(missed).toEqual([click("b")])
    expect(tried).toEqual(["a", "b"])
  })

  test("手が無ければ空", async () => {
    const { apply } = applier([])
    expect(await collectMisses([], apply, "stop")).toEqual([])
  })
})

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

  test("--scroll-element は直後の位置引数を px にし、その token を使ったと返す", () => {
    const result = readArguments(["--click", "a", "--scroll-element", "ul", "40", "--hover", "b"])
    expect(result?.preparations).toEqual([
      { kind: "click", selector: "a" },
      { kind: "scroll-element", selector: "ul", top: 40 },
      { kind: "hover", selector: "b" },
    ])
    expect([...(result?.textTokenIndexes ?? [])]).toEqual([2])
    expect(readArguments(["--scroll-element", "ul", "0"])?.preparations).toEqual([
      { kind: "scroll-element", selector: "ul", top: 0 },
    ])
  })

  test("--scroll-element の px が無い・数でない・小数のときは崩れた引数", () => {
    expect(readArguments(["--scroll-element", "ul"])).toBeUndefined()
    expect(readArguments(["--scroll-element", "ul", "--click", "b"])).toBeUndefined()
    for (const bad of ["abc", "1.5", ""]) {
      expect(readArguments(["--scroll-element", "ul", bad])).toBeUndefined()
    }
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

  test("scroll-element は転がす先の px を言う", () => {
    expect(
      describeCatalogMiss("task-board", "wide", {
        kind: "scroll-element",
        selector: "ul",
        top: 40,
      }),
    ).toBe("当てられなかった: task-board（wide）: ul を 40px まで転がす")
  })

  test("press はキー名を言う", () => {
    expect(describeCatalogMiss("session-resume", "narrow", { kind: "press", key: "Escape" })).toBe(
      "当てられなかった: session-resume（narrow）: Escape キーを押す",
    )
  })
})
