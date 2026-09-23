import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import {
  applyAppearanceColorOverride,
  backgroundVeilFloor,
  changeAppearanceColor,
  DEFAULT_APPEARANCE_COLOR_OVERRIDE,
  loadAppearanceColorOverride,
  readCurrentColor,
  saveAppearanceColorOverride,
  type AppearanceColorOverride,
  MIN_CONTRAST,
} from "../../../src/browser/lib/appearance-color.ts"
import {
  MAX_BACKGROUND_VEIL,
  MIN_BACKGROUND_VEIL,
} from "../../../src/shared/character-background.ts"

const STORAGE_KEY = "tsukumo-appearance-color:v1"

/**
 * 覆いの下に1色の画像があるときの地と、字のコントラスト比（テスト側で独立に計算する。
 * 実装と同じ式を書き写すのではなく、WCAG の定義そのままを短く書く）。
 */
function contrastOfVeiled(ground: string, image: string, veil: number, ink: string): number {
  const mixed = [1, 3, 5].map(
    (at) =>
      Number.parseInt(ground.slice(at, at + 2), 16) * veil +
      Number.parseInt(image.slice(at, at + 2), 16) * (1 - veil),
  )
  const luminance = (channels: readonly number[]): number =>
    [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
      const channel = (channels[index] ?? 0) / 255
      return (
        sum + weight * (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      )
    }, 0)
  const inkChannels = [1, 3, 5].map((at) => Number.parseInt(ink.slice(at, at + 2), 16))
  const [lighter, darker] = [luminance(mixed), luminance(inkChannels)].sort((a, b) => b - a)
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}

// 本物の theme.css は読み込まないので、「上書きが無いときの既定値」だけを疑似 :root として
// 用意する（`<style>` 要素。カスケードの優先度は inline style より低いので、
// `removeProperty` で上書きを外したときに正しくここへ戻る。inline style で直接シミュレート
// すると「既定」と「上書き」の区別が付けられない）。
let themeStyleElement: HTMLStyleElement | undefined

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY)
  document.documentElement.style.removeProperty("--ground")
  document.documentElement.style.removeProperty("--surface")
  document.documentElement.style.removeProperty("--ink")
  themeStyleElement = document.createElement("style")
  themeStyleElement.textContent = ":root { --ground: #191720; --surface: #221f2b; --ink: #e8e3ea; }"
  document.head.appendChild(themeStyleElement)
})

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
  document.documentElement.style.removeProperty("--ground")
  document.documentElement.style.removeProperty("--surface")
  document.documentElement.style.removeProperty("--ink")
  themeStyleElement?.remove()
  themeStyleElement = undefined
})

describe("loadAppearanceColorOverride", () => {
  it("何も保存していなければ既定（上書き無し）を返す", () => {
    expect(loadAppearanceColorOverride()).toEqual(DEFAULT_APPEARANCE_COLOR_OVERRIDE)
  })

  it("保存した値をそのまま読み戻す", () => {
    const saved: AppearanceColorOverride = { ground: "#000000", surface: undefined, ink: "#ffffff" }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    expect(loadAppearanceColorOverride()).toEqual(saved)
  })

  it("壊れた JSON は既定へ落ちる", () => {
    localStorage.setItem(STORAGE_KEY, "{not json")
    expect(loadAppearanceColorOverride()).toEqual(DEFAULT_APPEARANCE_COLOR_OVERRIDE)
  })

  it("16進として不正な値は既定（undefined）へ落ちる", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ground: "red", surface: 1, ink: "#zzzzzz" }))
    expect(loadAppearanceColorOverride()).toEqual(DEFAULT_APPEARANCE_COLOR_OVERRIDE)
  })
})

describe("saveAppearanceColorOverride / applyAppearanceColorOverride", () => {
  it("保存した値を loadAppearanceColorOverride で読み戻せる", () => {
    const value: AppearanceColorOverride = { ground: "#101010", surface: undefined, ink: "#eeeeee" }
    saveAppearanceColorOverride(value)
    expect(loadAppearanceColorOverride()).toEqual(value)
  })

  it("documentElement の CSS カスタムプロパティに反映する", () => {
    applyAppearanceColorOverride({ ground: "#123456", surface: "#654321", ink: undefined })
    expect(readCurrentColor("ground")).toBe("#123456")
    expect(readCurrentColor("surface")).toBe("#654321")
    // ink は上書き無し（undefined）。既定に落ちて --ink の値（このテストでは疑似 :root）が残る。
    expect(readCurrentColor("ink")).toBe("#e8e3ea")
  })
})

describe("backgroundVeilFloor", () => {
  it("既定の3色では下限（0.7）のまま引き上げない", () => {
    expect(backgroundVeilFloor("#191720", "#e8e3ea")).toBe(MIN_BACKGROUND_VEIL)
  })

  it("地と字が下限ぎりぎりの組では、覆いを不透明まで引き上げる（行き止まらない）", () => {
    // #767676 と #ffffff の比はちょうど 4.5 前後。覆いを薄くするとどちらの端でも割るので、
    // 上限まで上がる。
    expect(backgroundVeilFloor("#767676", "#ffffff")).toBe(MAX_BACKGROUND_VEIL)
  })

  it("引き上げた覆いは、画像が真っ白でも真っ黒でも 4.5 を満たす", () => {
    const ground = "#3a3a3a"
    const ink = "#ffffff"
    const veil = backgroundVeilFloor(ground, ink)

    expect(veil).toBeGreaterThanOrEqual(MIN_BACKGROUND_VEIL)
    for (const image of ["#ffffff", "#000000"]) {
      expect(contrastOfVeiled(ground, image, veil, ink)).toBeGreaterThanOrEqual(MIN_CONTRAST)
    }
  })

  it("documentElement に下限を差す（背景を敷く CSS が読む）", () => {
    applyAppearanceColorOverride(DEFAULT_APPEARANCE_COLOR_OVERRIDE)

    expect(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--character-background-veil-floor")
        .trim(),
    ).toBe(String(MIN_BACKGROUND_VEIL))
  })
})

describe("changeAppearanceColor", () => {
  it("読める組み合わせはそのまま受け取る", () => {
    const next = changeAppearanceColor(DEFAULT_APPEARANCE_COLOR_OVERRIDE, "ground", "#000000")
    expect(next).toEqual({ ground: "#000000", surface: undefined, ink: undefined })
  })

  it("surface はコントラストの対象外で、そのまま受け取る", () => {
    const next = changeAppearanceColor(DEFAULT_APPEARANCE_COLOR_OVERRIDE, "surface", "#e8e3ea")
    expect(next).toEqual({ ground: undefined, surface: "#e8e3ea", ink: undefined })
  })

  it("16進として不正な値は無視して現在の値を返す", () => {
    const current: AppearanceColorOverride = {
      ground: "#000000",
      surface: undefined,
      ink: undefined,
    }
    expect(changeAppearanceColor(current, "ground", "not-a-color")).toEqual(current)
  })

  it("ground を ink と同じ色にしようとすると受け取らない", () => {
    // 疑似 :root: --ink は #e8e3ea。ground をそれと同じ色にしようとする。
    const current: AppearanceColorOverride = {
      ground: undefined,
      surface: "#222222",
      ink: undefined,
    }
    const next = changeAppearanceColor(current, "ground", "#e8e3ea")
    expect(next).toEqual({ ground: undefined, surface: "#222222", ink: undefined })
  })

  it("ink を ground と同じ色にしようとすると受け取らない", () => {
    const current: AppearanceColorOverride = {
      ground: undefined,
      surface: undefined,
      ink: undefined,
    }
    const next = changeAppearanceColor(current, "ink", "#191720")
    expect(next).toEqual(DEFAULT_APPEARANCE_COLOR_OVERRIDE)
  })

  it("受け取らなかったとき、それまでの上書きは消さない", () => {
    // 地を先に決めてから、字に「その地と同じ色」を入れて弾かせる。**弾くのは新しい1色だけ**で、
    // 先に決めた地まで失われてはいけない（実機で地の設定ごと消えるのを見つけて直した）。
    const afterGround = changeAppearanceColor(
      DEFAULT_APPEARANCE_COLOR_OVERRIDE,
      "ground",
      "#101820",
    )
    expect(afterGround.ground).toBe("#101820")
    applyAppearanceColorOverride(afterGround)

    const rejected = changeAppearanceColor(afterGround, "ink", "#101820")

    expect(rejected).toEqual(afterGround)
  })

  it("読めるところまで離れた色は受け取る", () => {
    // #f5f5f5 と疑似 :root の --ground（#191720）のコントラスト比は 16 超で下限を大きく超える。
    const next = changeAppearanceColor(DEFAULT_APPEARANCE_COLOR_OVERRIDE, "ink", "#f5f5f5")
    expect(next).toEqual({ ground: undefined, surface: undefined, ink: "#f5f5f5" })
  })
})
