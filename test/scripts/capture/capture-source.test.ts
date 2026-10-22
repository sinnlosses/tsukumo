import { describe, expect, test } from "vitest"

import { sourceOf } from "../../../scripts/capture/lib/capture-source.ts"
import { CATALOG } from "../../../scripts/capture/lib/catalog-entry.ts"
import { imageSceneEntry, launchPlaceOf } from "../../../scripts/capture/lib/catalog-setup.ts"

describe("sourceOf", () => {
  test("URL だけなら URL を開く", () => {
    expect(sourceOf("http://x", undefined, undefined, undefined, undefined)).toEqual({
      kind: "url",
      url: "http://x",
    })
  })

  test("場面の起動先は --cwd が無ければ決めずに残り、--session が無ければ同梱のファイルを読む", () => {
    expect(sourceOf(undefined, "report", 3, undefined, undefined)).toEqual({
      kind: "scene",
      scene: "report",
      until: 3,
      cwd: undefined,
      session: undefined,
    })
  })

  test("--cwd は場面の起動先に、--session は場面を読むファイルになる", () => {
    expect(sourceOf(undefined, "report", undefined, "/scratch/a", "/scratch/s.json")).toEqual({
      kind: "scene",
      scene: "report",
      until: undefined,
      cwd: "/scratch/a",
      session: "/scratch/s.json",
    })
  })

  test("URL と --cwd / --session・場面と URL・場面の無い --until-step / --cwd / --session は読まない", () => {
    expect(sourceOf("http://x", undefined, undefined, "/a", undefined)).toBeUndefined()
    expect(sourceOf("http://x", undefined, undefined, undefined, "/s.json")).toBeUndefined()
    expect(sourceOf("http://x", "report", undefined, undefined, undefined)).toBeUndefined()
    expect(sourceOf(undefined, undefined, 2, undefined, undefined)).toBeUndefined()
    expect(sourceOf(undefined, undefined, undefined, "/a", undefined)).toBeUndefined()
    expect(sourceOf(undefined, undefined, undefined, undefined, "/s.json")).toBeUndefined()
    expect(sourceOf(undefined, undefined, undefined, undefined, undefined)).toBeUndefined()
  })
})

describe("imageSceneEntry", () => {
  test("画像の作業場所を要る場面は、その場面の report-image の件を返す", () => {
    const entry = imageSceneEntry("report-before-after", CATALOG)
    expect(entry?.scene).toBe("report-before-after")
    expect(entry?.workspaceSetup.kind).toBe("report-image")
  })

  test("要らない場面・知らない場面は undefined（作業ツリーで起こす）", () => {
    expect(imageSceneEntry("opening", CATALOG)).toBeUndefined()
    expect(imageSceneEntry("no-such-scene", CATALOG)).toBeUndefined()
  })

  test("演出の扱いは件の skipReveal に従う（打ち切る場面と、演出を撮る場面）", () => {
    expect(imageSceneEntry("report-before-after", CATALOG)?.skipReveal).toBe(true)
    expect(imageSceneEntry("question-preview-image", CATALOG)?.skipReveal).toBe(false)
  })

  test("起こす先は、--cwd があれば渡した先・無ければ画像の件の作業場所・画像の要らない場面は作業ツリー", () => {
    expect(launchPlaceOf("/scratch/a", "report-before-after", CATALOG)).toEqual({
      kind: "given",
      cwd: "/scratch/a",
    })
    expect(launchPlaceOf("/scratch/a", "opening", CATALOG)).toEqual({
      kind: "given",
      cwd: "/scratch/a",
    })
    const image = launchPlaceOf(undefined, "report-before-after", CATALOG)
    expect(image.kind).toBe("image-workspace")
    expect(image.kind === "image-workspace" && image.entry.scene).toBe("report-before-after")
    expect(launchPlaceOf(undefined, "opening", CATALOG)).toEqual({ kind: "repository" })
  })

  test("画像の場面の件は、同じ場面の中で skipReveal が揃っている", () => {
    for (const entry of CATALOG.filter((item) => item.workspaceSetup.kind === "report-image")) {
      expect(imageSceneEntry(entry.scene, CATALOG)?.skipReveal).toBe(entry.skipReveal)
    }
  })
})
