// 使う人が変えられる3色（`ground` / `surface` / `ink`。docs/design.md 13.2 / 13.5 / 13.6）を
// `localStorage` に持つ。**既定値は `src/browser/styles/theme.css` の `:root` にしかない**
// （コーディング規約「`theme.css` 以外に16進の色を書かない」）ので、ここでは「上書きしない」を
// `undefined` で表す。上書きが無いときの実際の色は `readCurrentColor` が
// `getComputedStyle(document.documentElement)` から読む（`:root` の値がそのまま返る。
// 上書き中ならその値が返る）。**JS 側に既定の16進を持たない。**
//
// 検証は1箇所（このモジュール）に封じ込める（`docs/coding-standards.md`「型を迂回する
// キャストを使わない」の境界の考え方）。`localStorage` から読み戻す値・`<input type="color">`
// が渡す値のどちらも、ここでしか型を確定させない。

import { MAX_BACKGROUND_VEIL, MIN_BACKGROUND_VEIL } from "../../../shared/character-background.ts"

export type AppearanceColorKey = "ground" | "surface" | "ink"

export type AppearanceColorOverride = {
  readonly ground: string | undefined
  readonly surface: string | undefined
  readonly ink: string | undefined
}

export const DEFAULT_APPEARANCE_COLOR_OVERRIDE: AppearanceColorOverride = {
  ground: undefined,
  surface: undefined,
  ink: undefined,
}

// `ground` と `ink` の組が本文を読める下限（docs/design.md 13.2「コントラストの下限を守る」）。
// WCAG 2.1 SC 1.4.3（AA、通常テキスト）と同じ 4.5:1 を採る。
export const MIN_CONTRAST = 4.5

const STORAGE_KEY = "tsukumo-appearance-color:v1"
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const TOKEN_NAME: Readonly<Record<AppearanceColorKey, string>> = {
  ground: "--ground",
  surface: "--surface",
  ink: "--ink",
}
const ACCENT_TOKEN_NAME = "--accent"
/**
 * 背景の覆いの不透明度の下限を渡す先（`docs/design.md` 13.8）。**敷くのはキャラビューの領域
 * だけ**なので、読むのは `src/browser/features/layout/layout.module.css` の `.layout-character`
 * 1箇所。パックが書いた `veil` とこの下限の**大きいほう**が効く。
 */
const BACKGROUND_VEIL_FLOOR_TOKEN_NAME = "--character-background-veil-floor"

export function loadAppearanceColorOverride(): AppearanceColorOverride {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return DEFAULT_APPEARANCE_COLOR_OVERRIDE
  }
  if (raw === null) {
    return DEFAULT_APPEARANCE_COLOR_OVERRIDE
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>
      return {
        ground: optionalHexColor(record["ground"]),
        surface: optionalHexColor(record["surface"]),
        ink: optionalHexColor(record["ink"]),
      }
    }
  } catch {
    // 保存値が JSON として壊れている。既定（上書き無し）に落ちる。
  }
  return DEFAULT_APPEARANCE_COLOR_OVERRIDE
}

export function saveAppearanceColorOverride(value: AppearanceColorOverride): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // プライベートウィンドウなどで書けないだけなので、保存できないまま続ける。
  }
}

/**
 * `document.documentElement` に反映する。`undefined` は「上書きしない」＝ 既定に戻す。
 *
 * **背景の覆いの下限（{@link backgroundVeilFloor}）も一緒に差し直す。** 下限はいまの
 * `ground` と `ink` から決まるので、色を変えるたびに計算し直さないと、字を変えたあとに
 * 背景の上の本文が読めなくなる（docs/design.md 13.8）。
 */
export function applyAppearanceColorOverride(value: AppearanceColorOverride): void {
  setOrRemoveToken("ground", value.ground)
  setOrRemoveToken("surface", value.surface)
  setOrRemoveToken("ink", value.ink)
  document.documentElement.style.setProperty(
    BACKGROUND_VEIL_FLOOR_TOKEN_NAME,
    String(backgroundVeilFloor(readCurrentColor("ground"), readCurrentColor("ink"))),
  )
}

/** 今その色に見えている16進値。上書き中ならその値、無ければ `:root` の既定値。 */
export function readCurrentColor(key: AppearanceColorKey): string {
  return readToken(TOKEN_NAME[key])
}

/**
 * 今のキャラクターの色（`--accent`）。**差し色（`outfitAccents`）が定義に無い衣装の
 * `<input type="color">` の初期値**に使う。パックが差した値、無ければ `theme.css` の `:root` の
 * 既定値が返る（**JS 側に既定の16進を持たない**ための読み取り。13.2 / 13.5）。
 */
export function readAccentColor(): string {
  return readToken(ACCENT_TOKEN_NAME)
}

/**
 * 使う人が1色を変えようとしたときの境界。**`ground` / `ink` は組で検証し、下回ったら
 * その1色を受け取らない**（docs/design.md 13.2 / 13.6）。`surface` はコントラストの対象外
 * （13.2 は `ground` と `ink` の組しか挙げていない）。
 *
 * **受け取らないだけで、それまでの上書きは消さない。** 消すと「地を決めたあとに字で
 * 読めない色を試したら、地の設定まで失われる」ことになる。返す `current` は設定時に
 * 検証を通っているので、そのまま残しても読める組であることは保たれる。
 */
export function changeAppearanceColor(
  current: AppearanceColorOverride,
  key: AppearanceColorKey,
  value: string,
): AppearanceColorOverride {
  if (!isValidHexColor(value)) {
    return current
  }
  if (key === "surface") {
    return { ...current, surface: value }
  }

  const ground = key === "ground" ? value : readCurrentColor("ground")
  const ink = key === "ink" ? value : readCurrentColor("ink")
  if (contrastRatio(ground, ink) < MIN_CONTRAST) {
    return current
  }
  return { ...current, [key]: value }
}

/**
 * 背景（docs/design.md 13.8）の覆いの不透明度の下限。**画像の中身を1ピクセルも読まずに
 * 決める**: 覆いの下の色は必ず `ground` と画像の色を結ぶ線分の上に来るので、線分の端
 * （真っ白・真っ黒）で {@link MIN_CONTRAST} を満たせば、どんな画像でも満たす。
 *
 * 定義の側の下限（`MIN_BACKGROUND_VEIL`）から 0.01 ずつ上げ、**両端とも満たす最初の値**を返す。
 * `ground` と `ink` の組は 13.2 の境界が 4.5 以上に保っているので、覆いが不透明になる端
 * （`MAX_BACKGROUND_VEIL`）まで上げれば必ず満たせる（＝引き上げが行き止まらない）。
 */
export function backgroundVeilFloor(ground: string, ink: string): number {
  const inkLuminance = relativeLuminance(ink)
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

function optionalHexColor(value: unknown): string | undefined {
  return isValidHexColor(value) ? value : undefined
}

function isValidHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value)
}

function setOrRemoveToken(key: AppearanceColorKey, value: string | undefined): void {
  if (value === undefined) {
    document.documentElement.style.removeProperty(TOKEN_NAME[key])
  } else {
    document.documentElement.style.setProperty(TOKEN_NAME[key], value)
  }
}

/** WCAG 2.1 のコントラスト比（1〜21）。 */
function contrastRatio(hexA: string, hexB: string): number {
  return contrastOfLuminance(relativeLuminance(hexA), relativeLuminance(hexB))
}

function contrastOfLuminance(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return (lighter + 0.05) / (darker + 0.05)
}

function relativeLuminance(hex: string): number {
  return luminanceOfChannels(
    channelByte(hex, RED_AT),
    channelByte(hex, GREEN_AT),
    channelByte(hex, BLUE_AT),
  )
}

/**
 * 覆い（`ground` 一色を `veil` の不透明度にしたもの）の下に、全チャンネルが `channel` の画像が
 * あるときの地の相対輝度。**合成は sRGB のまま**（ブラウザの重ね合わせと同じ）。
 */
function veiledLuminance(ground: string, channel: number, veil: number): number {
  const mixed = (at: number): number => channelByte(ground, at) * veil + channel * (1 - veil)
  return luminanceOfChannels(mixed(RED_AT), mixed(GREEN_AT), mixed(BLUE_AT))
}

function luminanceOfChannels(red: number, green: number, blue: number): number {
  return 0.2126 * srgbChannel(red) + 0.7152 * srgbChannel(green) + 0.0722 * srgbChannel(blue)
}

/** 0〜255 のチャンネル値を、WCAG の式が使う線形の値にする。 */
function srgbChannel(value: number): number {
  const channel = value / 255
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function channelByte(hex: string, start: number): number {
  return Number.parseInt(hex.slice(start, start + 2), 16)
}

const [RED_AT, GREEN_AT, BLUE_AT] = [1, 3, 5]

/**
 * 覆いの下でいちばん危ない画像の色（真っ白と真っ黒）を、チャンネル値で持つ。**16進では
 * 書かない**（16進を書いてよいのは `src/browser/styles/theme.css` だけ）。
 */
const WORST_IMAGE_CHANNELS = [0, 255] as const

/** 覆いの不透明度を刻む細かさ（1/100 刻みで探す）。 */
const VEIL_STEPS = 100
