// 依頼に添える画像（`docs/requirements.md` 4.10）。**受け取りは貼り付けとドロップだけ**で、
// 画面から届くのは data URL（立ち絵・背景と同じ受け渡しの形。`src/shared/image-data-url.ts`）。
//
// **立ち絵のスキーマを使い回さない。** 立ち絵は `.svg` を受け付けるが、あちらは画面に描くだけで
// モデルへは渡らない。こちらの形式は tsukumo の都合ではなく **API の天井**で、
// `Base64ImageSource.media_type` が取る4つ（png / jpeg / gif / webp）しか渡せない。
//
// **原寸と控えは別の寿命を持つ。** 原寸（{@link PromptImage.full}）はブラウザのメモリ →
// WebSocket の1フレーム → サーバのメモリ → SDK の子プロセス、と流れるだけで**どこにも残らず**、
// 記録（`SessionState`）に載るのは控え（{@link PromptImage.thumbnail}）だけ。上限が2つあるのは
// そのためで、控えのほうが桁違いに小さい（`docs/requirements.md` 4.10「会話内容の扱い」）。
//
// ここは両側で共有する契約なので、**検証だけを持ちバイト列には触らない**（base64 を
// 内容ブロックに載せるのは渡す側 = `src/server/adapter/sdk-driver.ts`）。

import { maxImageDataUrlLength, parseImageDataUrl } from "./image-data-url.ts"

/**
 * 受け付ける形式（メディアタイプ）。**API の天井そのもの**で、`Base64ImageSource.media_type` が
 * この4つしか取らない（`.svg` は渡せない）。SDK の型と同じ値であることは、`sdk-driver.ts` が
 * 内容ブロックを組み立てるところで tsc が確かめる。
 */
export const PROMPT_IMAGE_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const

export type PromptImageMediaType = (typeof PROMPT_IMAGE_MEDIA_TYPES)[number]

/** 画像1枚（デコード後）の上限。立ち絵・背景と同じ値（`docs/requirements.md` 4.10 の表）。 */
export const MAX_PROMPT_IMAGE_BYTES = 2 * 1024 * 1024

/** 原寸の data URL の文字列の上限（{@link MAX_PROMPT_IMAGE_BYTES} を base64 の長さに直したもの）。 */
export const MAX_PROMPT_IMAGE_DATA_URL_LENGTH = maxImageDataUrlLength(MAX_PROMPT_IMAGE_BYTES)

/**
 * 控え1枚（デコード後）の上限。**記録に残り続けるのは控えだけ**なので、原寸とは別に、
 * 桁の違う小さな値で切る（雑談の 100 ターンぶん積んでも記録の大きさが暴れない。
 * `docs/requirements.md` 4.10「控えだけを記録に残すので、記録の大きさが上限を持つ」）。
 * 縮めるのはブラウザ側（`src/browser/lib/prompt-image.ts`）で、**サーバは加工しない**。
 */
export const MAX_PROMPT_IMAGE_THUMBNAIL_BYTES = 128 * 1024

/** 控えの data URL の文字列の上限。 */
export const MAX_PROMPT_IMAGE_THUMBNAIL_DATA_URL_LENGTH = maxImageDataUrlLength(
  MAX_PROMPT_IMAGE_THUMBNAIL_BYTES,
)

/** 1件の依頼に添えられる枚数（`docs/requirements.md` 4.10 の表）。 */
export const MAX_PROMPT_IMAGES = 4

/**
 * 依頼に添える画像1枚。**原寸と控えの対**で、対のまま `prompt` コマンドに乗る。
 * ここから先で2つは別々の道へ分かれる（原寸はモデルへ、控えは記録へ）。
 */
export type PromptImage = {
  /** 原寸の data URL。**モデルへ渡すだけで、送った時点で手放す。** */
  readonly full: string
  /** 控え（縮めた絵）の data URL。**記録（`SessionState`）に残るのはこちらだけ。** */
  readonly thumbnail: string
}

/** 読めた画像1枚。`base64` は data URL の `,` より後ろ（そのままの文字列）。 */
export type PromptImageSource = {
  readonly mediaType: PromptImageMediaType
  readonly base64: string
}

/**
 * data URL を原寸の画像1枚として読む。**読めない・受け付けない種類・大きすぎる**ときは
 * undefined（呼び出し側は定型文の `error` を返すだけで、届いた値を理由に混ぜない）。
 */
export function parsePromptImage(dataUrl: string): PromptImageSource | undefined {
  return toPromptImageSource(dataUrl, MAX_PROMPT_IMAGE_BYTES)
}

/**
 * data URL を控えの画像1枚として読む。形式の表は原寸と同じで、**上限だけが違う**
 * （{@link MAX_PROMPT_IMAGE_THUMBNAIL_BYTES}）。
 */
export function parsePromptImageThumbnail(dataUrl: string): PromptImageSource | undefined {
  return toPromptImageSource(dataUrl, MAX_PROMPT_IMAGE_THUMBNAIL_BYTES)
}

/** 外から届いた文字列が {@link PROMPT_IMAGE_MEDIA_TYPES} のいずれかか（`File.type` の検査に使う）。 */
export function isPromptImageMediaType(value: string): value is PromptImageMediaType {
  return PROMPT_IMAGE_MEDIA_TYPES.some((mediaType) => mediaType === value)
}

function toPromptImageSource(dataUrl: string, maxBytes: number): PromptImageSource | undefined {
  const image = parseImageDataUrl(dataUrl, maxBytes)
  if (image === undefined) {
    return undefined
  }
  return isPromptImageMediaType(image.mediaType)
    ? { mediaType: image.mediaType, base64: image.base64 }
    : undefined
}
