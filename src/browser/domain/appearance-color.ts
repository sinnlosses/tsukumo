// 使う人が変えられる3色（`ground` / `surface` / `ink`）を `localStorage` に持つ。
// 既定値は `theme.css` の `:root` にしかないので、ここでは「上書きしない」を `undefined` で表し、JS 側に既定の16進を持たない。
// 上書きが無いときの実際の色は `readCurrentColor` が `getComputedStyle(document.documentElement)` から読む。
//
// `localStorage` から読み戻す値・`<input type="color">` が渡す値のどちらも、型を確定させるのはここだけ。

import { isPlainObject } from "remeda"
import { z } from "zod"

import {
  MAX_BACKGROUND_VEIL,
  MIN_BACKGROUND_VEIL,
} from "../../shared/character-pack/character-background.ts"
import { localPreference } from "../utils/local-preference.ts"
import { relativeLuminance } from "./relative-luminance.ts"

export type AppearanceColorKey = "ground" | "surface" | "ink"

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .brand<"HexColor">()

/** `#rrggbb` の6桁であることを検査済みの色。作れるのは、このファイルの検査（{@link parseHexColor}、保存値の読み戻し）だけ。 */
export type HexColor = z.infer<typeof hexColorSchema>

export type AppearanceColorOverride = {
  readonly ground: HexColor | undefined
  readonly surface: HexColor | undefined
  readonly ink: HexColor | undefined
}

export const DEFAULT_APPEARANCE_COLOR_OVERRIDE: AppearanceColorOverride = {
  ground: undefined,
  surface: undefined,
  ink: undefined,
}

// `ground` と `ink` の組が本文を読める下限。WCAG 2.1 SC 1.4.3（AA、通常テキスト）と同じ 4.5:1 を採る。
const MIN_CONTRAST = 4.5

const TOKEN_NAME = {
  ground: "--ground",
  surface: "--surface",
  ink: "--ink",
} as const satisfies Record<AppearanceColorKey, string>
const ACCENT_TOKEN_NAME = "--accent"
/**
 * 背景の覆いの不透明度の下限を渡す先。
 * 読むのは `conversation-layout.module.css` の `.layout-ground` 1箇所で、パックが書いた `veil` とこの下限の大きいほうが効く。
 */
const BACKGROUND_VEIL_FLOOR_TOKEN_NAME = "--character-background-veil-floor"

// 3色は項ごとに畳む（1色が壊れていても他の色は生かす）。キーが欠けた項は `undefined` として項の schema に渡す。
const hexColorOrUndefined = z.union([hexColorSchema, z.undefined()]).catch(undefined)

const preference = localPreference(
  "tsukumo-appearance-color:v1",
  z.preprocess(
    (stored) =>
      isPlainObject(stored)
        ? { ground: stored["ground"], surface: stored["surface"], ink: stored["ink"] }
        : stored,
    z.object({
      ground: hexColorOrUndefined,
      surface: hexColorOrUndefined,
      ink: hexColorOrUndefined,
    }),
  ),
  DEFAULT_APPEARANCE_COLOR_OVERRIDE,
)

export const loadAppearanceColorOverride: () => AppearanceColorOverride = preference.load

export const saveAppearanceColorOverride: (value: AppearanceColorOverride) => void = preference.save

/**
 * `document.documentElement` に反映する。`undefined` は「上書きしない」＝ 既定に戻す。
 *
 * 背景の覆いの下限（{@link backgroundVeilFloor}）も一緒に差し直す。
 * 下限はいまの `ground` と `ink` から決まるので、色を変えるたびに計算し直さないと、字を変えたあとに背景の上の本文が読めなくなる。
 */
export function applyAppearanceColorOverride(value: AppearanceColorOverride): void {
  setOrRemoveToken("ground", value.ground)
  setOrRemoveToken("surface", value.surface)
  setOrRemoveToken("ink", value.ink)
  const ground = parseHexColor(readCurrentColor("ground"))
  const ink = parseHexColor(readCurrentColor("ink"))
  if (ground === undefined || ink === undefined) {
    document.documentElement.style.removeProperty(BACKGROUND_VEIL_FLOOR_TOKEN_NAME)
    return
  }
  document.documentElement.style.setProperty(
    BACKGROUND_VEIL_FLOOR_TOKEN_NAME,
    String(backgroundVeilFloor(ground, ink)),
  )
}

/** 今その色に見えている16進値。上書き中ならその値、無ければ `:root` の既定値。 */
export function readCurrentColor(key: AppearanceColorKey): string {
  return readToken(TOKEN_NAME[key])
}

/**
 * 今のキャラクターの色（`--accent`）。差し色が定義に無いパックの `<input type="color">` の初期値に使う。
 * パックが差した値、無ければ `theme.css` の `:root` の既定値が返る。
 */
export function readAccentColor(): string {
  return readToken(ACCENT_TOKEN_NAME)
}

/**
 * 1色を変えようとした結果。受け取らなかったときは理由を持つので、画面は黙って元の色に戻すのではなく、なぜ効かなかったかを出せる。
 * `low-contrast` の `key` は変えようとした側（`ground` か `ink`）。
 */
export type AppearanceColorChange =
  | { readonly kind: "accepted"; readonly override: AppearanceColorOverride }
  | { readonly kind: "invalid-color" }
  | { readonly kind: "low-contrast"; readonly key: "ground" | "ink" }

/** 変えようとした色の相手側として比べる、今その色に見えている `ground` と `ink`（{@link readCurrentColor} の値）。 */
export type ShownColors = {
  readonly ground: string
  readonly ink: string
}

/**
 * 使う人が1色を変えようとしたときの境界。
 * `ground` / `ink` は組で検証し、下回ったらその1色を受け取らない。`surface` はコントラストの対象外。
 *
 * 受け取らないだけで、それまでの上書きは消さない。
 * 消すと「地を決めたあとに字で読めない色を試したら、地の設定まで失われる」ことになる。
 * `current` は設定時に検証を通っているので、そのまま残しても読める組であることは保たれる。
 */
export function changeAppearanceColor(
  current: AppearanceColorOverride,
  key: AppearanceColorKey,
  value: string,
  shown: ShownColors,
): AppearanceColorChange {
  const color = parseHexColor(value)
  if (color === undefined) {
    return { kind: "invalid-color" }
  }
  if (key === "surface") {
    return { kind: "accepted", override: { ...current, surface: color } }
  }

  const ground = key === "ground" ? color : parseHexColor(shown.ground)
  const ink = key === "ink" ? color : parseHexColor(shown.ink)
  if (ground === undefined || ink === undefined) {
    return { kind: "invalid-color" }
  }
  if (contrastRatio(ground, ink) < MIN_CONTRAST) {
    return { kind: "low-contrast", key }
  }
  return { kind: "accepted", override: { ...current, [key]: color } }
}

/**
 * 背景の覆いの不透明度の下限。画像の中身を1ピクセルも読まずに決める。
 * 覆いの下の色は必ず `ground` と画像の色を結ぶ線分の上に来るので、線分の端（真っ白・真っ黒）で {@link MIN_CONTRAST} を満たせば、どんな画像でも満たす。
 *
 * 定義の側の下限（`MIN_BACKGROUND_VEIL`）から 0.01 ずつ上げ、両端とも満たす最初の値を返す。
 * `ground` と `ink` の組は境界が 4.5 以上に保っているので、覆いが不透明になる端（`MAX_BACKGROUND_VEIL`）まで上げれば必ず満たせる（引き上げが行き止まらない）。
 */
function backgroundVeilFloor(ground: HexColor, ink: HexColor): number {
  const inkLuminance = hexLuminance(ink)
  for (let step = MIN_BACKGROUND_VEIL * VEIL_STEPS; step < VEIL_STEPS; step += 1) {
    const veil = step / VEIL_STEPS
    const readable = WORST_IMAGE_CHANNELS.every(
      (channel) =>
        contrastOfLuminance(veiledLuminance(ground, channel, veil), inkLuminance) >= MIN_CONTRAST,
    )
    if (readable) {
      return veil
    }
  }
  return MAX_BACKGROUND_VEIL
}

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function parseHexColor(value: unknown): HexColor | undefined {
  const parsed = hexColorSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function setOrRemoveToken(key: AppearanceColorKey, value: HexColor | undefined): void {
  if (value === undefined) {
    document.documentElement.style.removeProperty(TOKEN_NAME[key])
  } else {
    document.documentElement.style.setProperty(TOKEN_NAME[key], value)
  }
}

/** WCAG 2.1 のコントラスト比（1〜21）。 */
function contrastRatio(hexA: HexColor, hexB: HexColor): number {
  return contrastOfLuminance(hexLuminance(hexA), hexLuminance(hexB))
}

function contrastOfLuminance(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return (lighter + 0.05) / (darker + 0.05)
}

function hexLuminance(hex: HexColor): number {
  return relativeLuminance(
    channelByte(hex, RED_AT) / 255,
    channelByte(hex, GREEN_AT) / 255,
    channelByte(hex, BLUE_AT) / 255,
  )
}

/**
 * 覆い（`ground` 一色を `veil` の不透明度にしたもの）の下に、全チャンネルが `channel` の画像が
 * あるときの地の相対輝度。合成は sRGB のまま（ブラウザの重ね合わせと同じ）。
 */
function veiledLuminance(ground: HexColor, channel: number, veil: number): number {
  const mixed = (at: number): number => channelByte(ground, at) * veil + channel * (1 - veil)
  return relativeLuminance(mixed(RED_AT) / 255, mixed(GREEN_AT) / 255, mixed(BLUE_AT) / 255)
}

function channelByte(hex: HexColor, start: number): number {
  return Number.parseInt(hex.slice(start, start + 2), 16)
}

const [RED_AT, GREEN_AT, BLUE_AT] = [1, 3, 5]

/** 覆いの下でいちばん危ない画像の色（真っ白と真っ黒）を、チャンネル値で持つ（16進を書いてよいのは `theme.css` だけ）。 */
const WORST_IMAGE_CHANNELS = [0, 255] as const

const VEIL_STEPS = 100
