// 依頼に添えた画像の控え（縮めた絵）を作る。
//
// 縮めるのはここ（ブラウザ側）だけで、サーバは画像を加工しない。

import { parsePromptImageThumbnail } from "../../../../../shared/session-driver/prompt-image.ts"

/**
 * 控えの長いほうの辺（px）。送ったあとの控えは吹き出しの幅いっぱいに描くので、広い画面の吹き出し（約 600px）を2倍の画面で引き伸ばさない大きさにする。
 * 札にも控えにも、この1枚をそのまま出す。
 */
const THUMBNAIL_MAX_EDGE_PX = 1280

/** 控えの形式。受け付ける4つのうち、同じ絵をいちばん小さく持てるもの。 */
const THUMBNAIL_MEDIA_TYPE = "image/webp"

/** 書き出す品質を高いほうから試す順。字の多い絵が上限（`MAX_PROMPT_IMAGE_THUMBNAIL_BYTES`）を超えたら1段ずつ下げる。 */
const THUMBNAIL_QUALITIES = [0.9, 0.8, 0.6, 0.4] as const

/**
 * 原寸（data URL か、置き場の原寸を配る経路の URL）から控えを作る。
 * 長いほうの辺を {@link THUMBNAIL_MAX_EDGE_PX} に収め、上限に収まったものだけを返す（読めない・どの品質でも収まらなければ undefined）。
 */
export async function shrinkToThumbnail(full: string): Promise<string | undefined> {
  const decoded = await decodeImage(full)
  if (decoded === undefined) {
    return undefined
  }

  const longestEdge = Math.max(decoded.naturalWidth, decoded.naturalHeight)
  if (longestEdge === 0) {
    return undefined
  }

  const scale = Math.min(1, THUMBNAIL_MAX_EDGE_PX / longestEdge)
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(decoded.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(decoded.naturalHeight * scale))

  const context = canvas.getContext("2d")
  if (context === null) {
    return undefined
  }
  context.imageSmoothingQuality = "high"
  context.drawImage(decoded, 0, 0, canvas.width, canvas.height)

  for (const quality of THUMBNAIL_QUALITIES) {
    const thumbnail = canvas.toDataURL(THUMBNAIL_MEDIA_TYPE, quality)
    if (parsePromptImageThumbnail(thumbnail) !== undefined) {
      return thumbnail
    }
  }
  return undefined
}

/** 画像を読み込んだ `<img>`。読めなければ undefined（例外にしない）。 */
function decodeImage(source: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const image = new Image()
    image.addEventListener("load", () => {
      resolve(image)
    })
    image.addEventListener("error", () => {
      resolve(undefined)
    })
    image.src = source
  })
}
