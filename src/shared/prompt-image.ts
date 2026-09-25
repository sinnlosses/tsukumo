// 依頼に添える画像（`docs/requirements.md` 4.10）。**受け取りは貼り付けとドロップだけ**で、
// 画面から届くのは data URL（立ち絵・背景と同じ受け渡しの形。`src/shared/image-data-url.ts`）。
//
// **立ち絵のスキーマを使い回さない。** 立ち絵は `.svg` を受け付けるが、あちらは画面に描くだけで
// モデルへは渡らない。こちらの形式は tsukumo の都合ではなく **API の天井**で、
// `Base64ImageSource.media_type` が取る4つ（png / jpeg / gif / webp）しか渡せない。
//
// **原寸と控えは別の寿命を持つ。** 原寸（{@link PromptImage.full}）はブラウザのメモリ →
// WebSocket の1フレーム → サーバのメモリ → SDK の子プロセス、と流れ、サーバのメモリでは
// **直近の数枚だけ**が棚（`src/server/session-driver/core/prompt-image-shelf.ts`）に残る（記録の窓から出た依頼の
// ぶんと、枚数の上限を超えたぶんはそこで捨てる。ディスクには書かない）。記録（`SessionState`）に
// 載るのは控え（{@link PromptImage.thumbnail}）と、棚の原寸を指す id だけ
// （{@link RecordedPromptImage}）。上限が2つあるのはそのためで、控えのほうが桁違いに小さい
// （`docs/requirements.md` 4.10「会話内容の扱い」）。
//
// ここは両側で共有する契約なので、**検証だけを持ちバイト列には触らない**（base64 を
// 内容ブロックに載せるのは渡す側 = `src/server/session-driver/adapter/sdk-driver.ts`）。

import { z } from "zod"

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

/**
 * 画像1枚（デコード後）の上限。**なぜ 5 MiB か**: API の天井（base64 で1枚 10 MB）の内側で、
 * 利用者が貼るスクリーンショットが収まる幅を取った（`docs/requirements.md` 4.10 の表）。
 */
export const MAX_PROMPT_IMAGE_BYTES = 5 * 1024 * 1024

/** 原寸の data URL の文字列の上限（{@link MAX_PROMPT_IMAGE_BYTES} を base64 の長さに直したもの）。 */
export const MAX_PROMPT_IMAGE_DATA_URL_LENGTH = maxImageDataUrlLength(MAX_PROMPT_IMAGE_BYTES)

/**
 * 控え1枚（デコード後）の上限。**記録に残り続けるのは控えだけ**なので、原寸とは別に、
 * 桁の違う小さな値で切る（雑談の 100 ターンぶん積んでも記録の大きさが暴れない。
 * `docs/requirements.md` 4.10「控えだけを記録に残すので、記録の大きさが上限を持つ」）。
 * 縮めるのはブラウザ側（`src/browser/components/page/conversation/dispatch/prompt-image.ts`）で、**サーバは加工しない**。
 */
export const MAX_PROMPT_IMAGE_THUMBNAIL_BYTES = 128 * 1024

/** 控えの data URL の文字列の上限。 */
export const MAX_PROMPT_IMAGE_THUMBNAIL_DATA_URL_LENGTH = maxImageDataUrlLength(
  MAX_PROMPT_IMAGE_THUMBNAIL_BYTES,
)

/**
 * 1件の依頼に添えられる枚数。**なぜ 2 枚か**: 1枚あたりの上限を緩める代わりに枚数を絞り、
 * リクエスト全体が API の天井（32 MB）に当たらないことを構造で保証する
 * （`docs/requirements.md` 4.10 の表）。
 */
export const MAX_PROMPT_IMAGES = 2

/**
 * 依頼に添える画像1枚。**原寸と控えの対**で、対のまま `prompt` コマンドに乗る。
 * ここから先で2つは別々の道へ分かれる（原寸はモデルと棚へ、控えは記録へ）。
 */
export type PromptImage = {
  /** 原寸の data URL。**モデルへ渡し、あとは棚が直近ぶんだけメモリで持つ。** */
  readonly full: string
  /** 控え（縮めた絵）の data URL。**記録（`SessionState`）に絵として残るのはこちらだけ。** */
  readonly thumbnail: string
}

/**
 * 記録に載る1枚。**控えと、棚の原寸を指す id の組**で、原寸そのものは載らない
 * （`hello` は接続のたびに状態を丸ごと送るので、原寸を載せると数 MiB × 枚数になる）。
 * id が指す原寸は棚から消えていることがある（そのときは {@link PROMPT_IMAGE_PATH_PREFIX} が
 * 404 を返す）。
 */
export type RecordedPromptImage = {
  /** 棚の原寸を指す id（{@link promptImageIdSchema}）。 */
  readonly id: string
  /** 控えの data URL。 */
  readonly thumbnail: string
}

/**
 * 棚の原寸を配る経路の接頭辞（`GET /prompt-image/<id>?t=<起動トークン>`）。**起動トークンが
 * 要る経路**で、WebSocket のフレームには原寸を載せない（押したときだけ取りに行く）。
 */
export const PROMPT_IMAGE_PATH_PREFIX = "/prompt-image/"

/**
 * 原寸を指す id の形。**推測できない値**（`crypto.randomUUID()`）にしてあり、経路で受けた値も
 * これで確かめてから棚を引く。
 */
export const promptImageIdSchema = z.uuid()

/** 原寸1枚の経路（起動トークンは付けない。付けるのは取りに行く側）。 */
export function promptImagePath(id: string): string {
  return `${PROMPT_IMAGE_PATH_PREFIX}${encodeURIComponent(id)}`
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
