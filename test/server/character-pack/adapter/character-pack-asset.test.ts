import { mkdirSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { readCharacterAsset } from "../../../../src/server/character-pack/adapter/character-pack.ts"
import { readPackAt } from "../../../fixture/character-pack-dir.ts"
import { characterPackName } from "../../../fixture/character.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

// フィクスチャは characters/tsukumo-spirit/character.json と同じ形の、手で書いた架空の定義。
const DEFINITION_JSON = JSON.stringify({
  name: "架空の精霊",
  expressions: {
    default: "通常",
    thinking: "作業中",
  },
  portraits: {
    default: "default.svg",
    thinking: "thinking.svg",
  },
})

const PLAUSIBLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>'

const SVG_CONTENT_TYPE = "image/svg+xml; charset=utf-8"

const dir = useTempDir("character-pack-asset")

describe("素材の版（revision）", () => {
  /** 更新時刻（`utimesSync` の秒）。作った時刻より過去の固定値。 */
  const PAST = 1_700_000_000

  /** 全素材の更新時刻を同じ過去に揃え、パックを読む。 */
  function readPackWithAllFilesAt(past: number): ReturnType<typeof readPackAt> {
    writeFileSync(
      join(dir(), "character.json"),
      JSON.stringify({
        portraits: { default: "default.svg" },
        mini: "mini.svg",
        face: "face.svg",
        background: { image: "bg.png" },
        diaryFont: "shodo.woff2",
      }),
    )
    for (const name of ["default.svg", "mini.svg", "face.svg", "bg.png", "shodo.woff2"]) {
      writeFileSync(join(dir(), name), PLAUSIBLE_SVG)
    }
    for (const name of [
      "character.json",
      "default.svg",
      "mini.svg",
      "face.svg",
      "bg.png",
      "shodo.woff2",
    ]) {
      utimesSync(join(dir(), name), past, past)
    }
    return readPackAt(dir())
  }

  it.each(["default.svg", "mini.svg", "face.svg", "bg.png", "shodo.woff2"])(
    "%s だけを差し替えると版が変わる（配る素材はどれも版に入る）",
    (name) => {
      const before = readPackWithAllFilesAt(PAST)

      utimesSync(join(dir(), name), PAST + 50, PAST + 50)

      expect(readPackAt(dir()).revision).not.toBe(before.revision)
    },
  )

  it("定義に挙がっていないファイルを触っても版は変わらない", () => {
    const before = readPackWithAllFilesAt(PAST)
    writeFileSync(join(dir(), "unlisted.svg"), PLAUSIBLE_SVG)

    expect(readPackAt(dir()).revision).toBe(before.revision)
  })
})

describe("readCharacterAsset のファイル名の判断", () => {
  function readFileOf(fileName: string): ReturnType<typeof readCharacterAsset> {
    const pack = readPackAt(dir())
    return readCharacterAsset(pack, [pack], { pack: pack.name, fileName }, undefined)
  }

  it("character.json の portraits にあるファイルを読める", () => {
    writeFileSync(join(dir(), "character.json"), DEFINITION_JSON)
    writeFileSync(join(dir(), "default.svg"), PLAUSIBLE_SVG)

    const file = readFileOf("default.svg")

    expect(file?.contentType).toBe(SVG_CONTENT_TYPE)
    expect(file?.content.toString("utf8")).toBe(PLAUSIBLE_SVG)
  })

  // 中身は見ないので、書体ファイルの実物は使わない（架空のバイト列で足りる）。
  it.each([
    { key: "mini", fileName: "mini.svg", content: PLAUSIBLE_SVG, contentType: SVG_CONTENT_TYPE },
    { key: "face", fileName: "face.svg", content: PLAUSIBLE_SVG, contentType: SVG_CONTENT_TYPE },
    {
      key: "diaryFont",
      fileName: "shodo.woff2",
      content: "not a real font, just bytes",
      contentType: "font/woff2",
    },
  ])("character.json の $key も同じ経路で配れる", ({ key, fileName, content, contentType }) => {
    writeFileSync(
      join(dir(), "character.json"),
      JSON.stringify({ portraits: { default: "default.svg" }, [key]: fileName }),
    )
    writeFileSync(join(dir(), fileName), content)

    const file = readFileOf(fileName)

    expect(file?.content.toString("utf8")).toBe(content)
    expect(file?.contentType).toBe(contentType)
  })

  it("定義に無いファイル名は undefined（呼び出し側が404にする）", () => {
    writeFileSync(join(dir(), "character.json"), DEFINITION_JSON)
    writeFileSync(join(dir(), "secret.svg"), PLAUSIBLE_SVG)

    expect(readFileOf("secret.svg")).toBeUndefined()
  })

  it("`..` を含む要求は、パスから組み立てないので自然に undefined になる", () => {
    writeFileSync(join(dir(), "character.json"), DEFINITION_JSON)

    expect(readFileOf("../character.json")).toBeUndefined()
  })

  it("定義にあってもディスクに無ければ undefined", () => {
    writeFileSync(join(dir(), "character.json"), DEFINITION_JSON)
    // default.svg をわざと置かない。

    expect(readFileOf("default.svg")).toBeUndefined()
  })

  it("定義が無ければ何も配らない", () => {
    expect(readFileOf("default.svg")).toBeUndefined()
  })
})

describe("readCharacterAsset", () => {
  /** 使用中（current）と、使用中以外（other）の2つのパックを置く。 */
  function writeTwoPacks(): {
    readonly current: ReturnType<typeof readPackAt>
    readonly other: ReturnType<typeof readPackAt>
  } {
    const currentDir = join(dir(), "current")
    const otherDir = join(dir(), "other")
    mkdirSync(currentDir)
    mkdirSync(otherDir)
    writeFileSync(join(currentDir, "character.json"), DEFINITION_JSON)
    writeFileSync(join(currentDir, "default.svg"), PLAUSIBLE_SVG)
    writeFileSync(
      join(otherDir, "character.json"),
      JSON.stringify({ portraits: { default: "other.svg" } }),
    )
    writeFileSync(join(otherDir, "other.svg"), PLAUSIBLE_SVG)
    return { current: readPackAt(currentDir), other: readPackAt(otherDir) }
  }

  it("使用中以外のパックの素材も、一覧にある名前なら読める", () => {
    const { current, other } = writeTwoPacks()

    const file = readCharacterAsset(
      current,
      [current, other],
      { pack: characterPackName("other"), fileName: "other.svg" },
      undefined,
    )

    expect(file?.content.toString("utf8")).toBe(PLAUSIBLE_SVG)
  })

  it("`?v=` がそのパックの今の版と一致したときだけ versioned", () => {
    const { current, other } = writeTwoPacks()
    const location = { pack: characterPackName("other"), fileName: "other.svg" }
    const versionedFor = (version?: string): boolean | undefined =>
      readCharacterAsset(current, [current, other], location, version)?.versioned

    expect(versionedFor(other.revision)).toBe(true)
    expect(versionedFor(`${String(other.revision)}0`)).toBe(false)
    expect(versionedFor(undefined)).toBe(false)
  })

  it("版を作れなかったパック（revision が undefined）は、`?v=` が無くても versioned にならない", () => {
    const { current } = writeTwoPacks()
    const noRevision = { ...current, revision: undefined }

    expect(
      readCharacterAsset(
        noRevision,
        [noRevision],
        { pack: characterPackName("current"), fileName: "default.svg" },
        undefined,
      )?.versioned,
    ).toBe(false)
  })

  it("別のパックの定義にしか無いファイル名は undefined（allowlist はパックごと）", () => {
    const { current, other } = writeTwoPacks()

    expect(
      readCharacterAsset(
        current,
        [current, other],
        { pack: characterPackName("other"), fileName: "default.svg" },
        undefined,
      ),
    ).toBeUndefined()
  })

  it("一覧に無いパック名は undefined（名前をパスに使わない）", () => {
    const { current, other } = writeTwoPacks()

    expect(
      readCharacterAsset(
        current,
        [current, other],
        { pack: characterPackName("missing"), fileName: "default.svg" },
        undefined,
      ),
    ).toBeUndefined()
  })
})
