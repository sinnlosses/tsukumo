// `image` の塊の画像を配る経路の形。サーバの配り口と、描く側の許可リスト・部品が同じ形を読む。
//
// 経路は `report` の呼び出しの id と、塊に書かれたままのパスの組で棚を引く鍵で、ファイルの場所を読ませる口ではない。

import { z } from "zod"

/** `GET /report-image/<toolUseId>/<path>?t=<起動トークン>` の接頭辞。 */
export const REPORT_IMAGE_PATH_PREFIX = "/report-image/"

/** 許可リストが `img` の `src` に通す値。接頭辞で始まる値だけに当たる。 */
export const REPORT_IMAGE_SRC_PATTERN = /^\/report-image\//

/** 経路のパスの部分の長さの上限（デコードした後）。 */
const MAX_REPORT_IMAGE_ROUTE_PATH_LENGTH = 1024

const reportImageToolUseIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)

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
