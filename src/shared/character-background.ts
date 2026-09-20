// キャラビューに敷く背景（`docs/design.md` 13.8）。**背景はキャラクターパックの持ち物**で、
// `character.json` の `background`（素材のファイル名と覆いの不透明度）から来る。効くのは
// キャラビューだけで、メインビュー・サイドバー・入力欄には敷かない（読む面の地は誰が来ても
// 同じにする。13.1 原則1）。
//
// ここが持つのは**「無い」を畳む境界**の1つ。定義ファイルも画面から届く画像も外部由来なので、
// 読めない値・範囲外の値をここで既定に落とし、外へは
// {@link CharacterBackground}（image と veil が必ずある形）か undefined（背景なし）だけを出す。
//
// **可読性は覆いの不透明度で担保する**（13.8）。画像は地（`ground` 一色）の覆いの下に敷き、
// 見えるのは最大でも 30%。**0.7 を下回る値は受け取らずに引き上げる** — 背景は「出さない」より
// 「薄く出す」ほうが書いた人の意図に近いため（受け取らずに既定へ落とす `accent` と違う）。
// いまの地と字の色で 0.7 では足りないとき、どこまで引き上げるかは描く側が決める
// （`src/browser/features/character-screen/appearance-color.ts`）。

import { maxImageDataUrlLength, parseImageDataUrl } from "./image-data-url.ts"

/**
 * 背景1つ分。**`image` はファイル名（定義側）か `/character/<file>` の URL（画面に渡す側）**で、
 * どちらを持つかは作った人が知っている（`portraits` と同じ扱い。`src/shared/character.ts` の
 * `toCharacterInfo` がファイル名を URL に変える）。
 */
export type CharacterBackground = {
  readonly image: string
  /** 覆い（`ground` 一色）の不透明度。{@link MIN_BACKGROUND_VEIL} 〜 {@link MAX_BACKGROUND_VEIL}。 */
  readonly veil: number
}

/**
 * 覆いの不透明度の下限（13.8）。既定の3色では 0.66 が境目（0.65 で 4.35 と
 * `MIN_CONTRAST` を下回る）なので、その外側の切りのよい値を採る。
 */
export const MIN_BACKGROUND_VEIL = 0.7

/**
 * `veil` を省略したときの不透明度。**下限ちょうどには置かない** — 下限に置くと字の色を
 * 少し変えただけで引き上げが起き、書いた `veil` と見え方がずれる（13.8）。
 */
export const DEFAULT_BACKGROUND_VEIL = 0.75

/** 覆いで画像が完全に隠れる端。**引き上げが行き止まらない**ことを保証する上限（13.8）。 */
export const MAX_BACKGROUND_VEIL = 1

/** 画面から受け取れる背景の形式。ファイル名の拡張子にもそのまま使う（`.gif` は入れない。7.1）。 */
export type BackgroundFormat = "png" | "jpg" | "webp"

/** 背景1枚（デコード後）の上限。立ち絵と同じ（`docs/design.md` 7.1 の表）。 */
export const MAX_BACKGROUND_BYTES = 2 * 1024 * 1024

/** data URL の文字列の上限（{@link MAX_BACKGROUND_BYTES} を base64 の長さに直したもの）。 */
export const MAX_BACKGROUND_DATA_URL_LENGTH = maxImageDataUrlLength(MAX_BACKGROUND_BYTES)

/** 画面から届いた背景1枚。`base64` は data URL の `,` より後ろ（そのままの文字列）。 */
export type BackgroundImage = {
  readonly format: BackgroundFormat
  readonly base64: string
}

/**
 * `character.json` の `background` を読む。**読めない形・素材のファイル名が無い（使えない）ときは
 * undefined**（＝背景なし。既定の絵には落ちない。素材はリポジトリに同梱しない。
 * `docs/requirements.md` 2.2）。`veil` は {@link toBackgroundVeil} が必ず帯の中に収める。
 */
export function toCharacterBackground(value: unknown): CharacterBackground | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined
  }

  const record = value as Record<string, unknown>
  const image = record["image"]
  if (typeof image !== "string" || !isBackgroundFileName(image)) {
    return undefined
  }
  return { image, veil: toBackgroundVeil(record["veil"]) }
}

/**
 * 届いた `veil` を帯（{@link MIN_BACKGROUND_VEIL} 〜 {@link MAX_BACKGROUND_VEIL}）の中に収める。
 * **数でない・有限でない値は既定**（{@link DEFAULT_BACKGROUND_VEIL}）に落ち、**範囲外の数は
 * いちばん近い端へ寄せる**（下限を下回る値は引き上げる。上の「可読性は覆いで担保する」）。
 */
export function toBackgroundVeil(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_BACKGROUND_VEIL
  }
  return Math.min(Math.max(value, MIN_BACKGROUND_VEIL), MAX_BACKGROUND_VEIL)
}

/**
 * 背景の素材として扱ってよいファイル名か。**定義ファイルに書かれた名前も外部由来**なので、
 * ここで形を確かめてから `/character/<file>` の URL にする:
 *
 * - 使えるのは半角英数字と `.` `_` `-` だけ（パスの区切り・空白・引用符・括弧が入らないので、
 *   ディレクトリを跨ぐ名前にも、CSS の `url()` を抜け出す名前にもならない）
 * - 拡張子は `.png` / `.jpg` / `.jpeg` / `.webp` のどれか（7.1。`.gif` と `.svg` は入れない）
 */
export function isBackgroundFileName(name: string): boolean {
  return (
    BACKGROUND_FILE_NAME_PATTERN.test(name) &&
    BACKGROUND_FILE_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension))
  )
}

/**
 * data URL を背景1枚として読む。**読めない・受け付けない種類・大きすぎる**ときは undefined
 * （立ち絵と同じ扱い。`src/shared/portrait-image.ts`）。
 */
export function parseBackgroundImage(dataUrl: string): BackgroundImage | undefined {
  const image = parseImageDataUrl(dataUrl, MAX_BACKGROUND_BYTES)
  if (image === undefined) {
    return undefined
  }

  const format = BACKGROUND_FORMAT_BY_MEDIA_TYPE[image.mediaType]
  return format === undefined ? undefined : { format, base64: image.base64 }
}

/**
 * 書き込む先のファイル名。**形式からだけ組み立てる**ので、届いた文字列がパスの一部にならない
 * （立ち絵と同じ考え方。`docs/design.md` 7.1）。差し替えは同じ名前の上書きになる。
 */
export function backgroundFileName(format: BackgroundFormat): string {
  return `${BACKGROUND_FILE_BASE_NAME}.${format}`
}

const BACKGROUND_FILE_BASE_NAME = "background"

const BACKGROUND_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/

const BACKGROUND_FILE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const

const BACKGROUND_FORMAT_BY_MEDIA_TYPE: Readonly<Record<string, BackgroundFormat>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}
