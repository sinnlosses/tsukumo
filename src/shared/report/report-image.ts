// `image` の塊の画像を配る経路の形。サーバの配り口と、描く側の許可リスト・部品が同じ形を読む。
//
// 経路は `report` の呼び出しの id と、塊に書かれたままのパスの組で棚を引く鍵で、ファイルの場所を読ませる口ではない。

import { z } from "zod"

/** `GET /report-image/<toolUseId>/<path>?t=<起動トークン>` の接頭辞。 */
export const REPORT_IMAGE_PATH_PREFIX = "/report-image/"

/** 許可リストが `img` の `src` に通す値。接頭辞で始まる値だけに当たる。 */
export const REPORT_IMAGE_SRC_PATTERN = /^\/report-image\//

/** 画像に対する%で持つ、変わった場所の枠。 */
export type ImageRegion = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** サーバが棚に置いた画像の、書かれたままのパスと画素の幅・高さ。 */
export type ReportImageSize = {
  readonly path: string
  readonly width: number
  readonly height: number
}

/** 許可リストが `img` の `width`・`height` に通す値。 */
export const REPORT_IMAGE_SIZE_PATTERN = /^[1-9]\d{0,5}$/

/**
 * `img` が枠を運ぶ属性の名前（hast のプロパティ名は `dataChangeRegion`）。
 * 会話の画面の4領域が名乗る `data-region` とは別の名前にする。
 */
export const IMAGE_REGION_ATTRIBUTE = "data-change-region"

/** 許可リストが `data-change-region` に通す値。`left,top,width,height` の非負の10進。 */
export const IMAGE_REGION_PATTERN = /^\d+(?:\.\d+)?(?:,\d+(?:\.\d+)?){3}$/

/** 枠を `data-change-region` の値に書き出す。小数は4桁で丸める。 */
export function formatImageRegion(region: ImageRegion): string {
  return [region.left, region.top, region.width, region.height]
    .map((value) => String(Number(value.toFixed(4))))
    .join(",")
}

/** `data-change-region` の値を枠に読む。形が崩れていれば undefined。 */
export function parseImageRegion(value: unknown): ImageRegion | undefined {
  if (typeof value !== "string" || !IMAGE_REGION_PATTERN.test(value)) {
    return undefined
  }
  const [left, top, width, height] = value.split(",").map(Number)
  return left === undefined || top === undefined || width === undefined || height === undefined
    ? undefined
    : { left, top, width, height }
}

/** 経路のパスの部分の長さの上限（デコードした後）。 */
const MAX_REPORT_IMAGE_ROUTE_PATH_LENGTH = 1024

const reportImageToolUseIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)

/** スキームか `//` で始まる行き先（外部の URL・`data:`）。 */
const NOT_LOCAL_URL = /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/

/**
 * 質問の preview の Markdown の画像の行き先のうち、棚から引くもの（手元のファイルのパス）か。
 * サーバが棚に置くパスを拾うときと、ブラウザが `src` を棚の経路に替えるときの両方がこれで決める。
 */
export function isShelvedImageUrl(url: string): boolean {
  return url !== "" && !NOT_LOCAL_URL.test(url)
}

/** 1枚の経路（起動トークンは付けない。付けるのは取りに行く側）。 */
export function reportImagePath(toolUseId: string, path: string): string {
  return `${REPORT_IMAGE_PATH_PREFIX}${encodeURIComponent(toolUseId)}/${encodeURIComponent(path)}`
}

/** 接頭辞より後ろを鍵の組に読む。形が崩れていれば undefined（配る側が 404 にする）。 */
export function readReportImageRoute(
  rest: string,
): { readonly toolUseId: string; readonly path: string } | undefined {
  const slash = rest.indexOf("/")
  if (slash < 0) {
    return undefined
  }
  const toolUseId = reportImageToolUseIdSchema.safeParse(rest.slice(0, slash))
  const path = decodedRoutePart(rest.slice(slash + 1))
  if (!toolUseId.success || path === undefined) {
    return undefined
  }
  return path === "" || path.length > MAX_REPORT_IMAGE_ROUTE_PATH_LENGTH
    ? undefined
    : { toolUseId: toolUseId.data, path }
}

function decodedRoutePart(encoded: string): string | undefined {
  try {
    return decodeURIComponent(encoded)
  } catch {
    return undefined
  }
}
