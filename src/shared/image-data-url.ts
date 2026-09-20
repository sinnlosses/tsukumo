// 画面から届いた画像1枚の data URL。**受け取り方は data URL を JSON に載せて WebSocket の
// コマンドで渡す形**（`docs/design.md` 7.1。multipart の POST も生バイトの POST も採らない）。
//
// ここが見るのは**その data URL が読める形か・大きすぎないか**だけで、**どの形式を受け付けるかは
// 呼び出し側が決める**（立ち絵は `.svg` / `.png` / `.gif`、背景は `.png` / `.jpg` / `.webp`。
// 7.1）。両側で共有する契約なのでバイト列には触らず、上限は base64 の長さから計算する。

/** 読めた data URL 1件。`base64` は `,` より後ろ（そのままの文字列）。 */
export type ImageDataUrl = {
  /** `data:` と `;base64` の間（小文字に揃えてある）。形式の判断は呼び出し側の表が行う。 */
  readonly mediaType: string
  readonly base64: string
}

/**
 * data URL の文字列として許す長さ。**デコード後の上限を base64 の長さに直したもの**に、
 * `data:image/svg+xml;base64,` の前置きぶんの余裕を足す。文字列の長さで先に切るので、
 * 巨大な値の中身を見る前に弾ける。
 */
export function maxImageDataUrlLength(maxBytes: number): number {
  return Math.ceil(maxBytes / 3) * 4 + DATA_URL_PREFIX_ALLOWANCE
}

/**
 * data URL を画像1枚として読む。**読めない・大きすぎる**ときは undefined（呼び出し側は
 * 定型文の `error` を返すだけで、届いた値を理由に混ぜない）。
 */
export function parseImageDataUrl(dataUrl: string, maxBytes: number): ImageDataUrl | undefined {
  if (dataUrl.length > maxImageDataUrlLength(maxBytes)) {
    return undefined
  }

  const matched = DATA_URL_PATTERN.exec(dataUrl)
  const mediaType = matched?.[1]
  const base64 = matched?.[2]
  if (mediaType === undefined || base64 === undefined) {
    return undefined
  }

  return decodedBase64Length(base64) > maxBytes
    ? undefined
    : { mediaType: mediaType.toLowerCase(), base64 }
}

const DATA_URL_PREFIX_ALLOWANCE = 100

/**
 * `data:<media type>;base64,<payload>` だけを受け付ける（`;base64` の無い形・`charset` などの
 * 付属の指定が付いた形は受け取らない — 画面が `FileReader.readAsDataURL` で作る形に絞る）。
 */
const DATA_URL_PATTERN = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i

/**
 * base64 の文字列が表すバイト数。**デコードせずに長さから計算する**（両側で共有する契約に
 * バイト列を持ち込まないため）。
 */
function decodedBase64Length(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
  return Math.floor(base64.length / 4) * 3 - padding
}
