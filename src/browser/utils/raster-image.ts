// 画像の data URL を、モデルへ渡せる形式（png・jpeg・gif・webp）にそろえる。
// svg だけはモデルが受け取れないので、`<canvas>` に描いて png に直す（外部の変換コマンドを使わない）。
//
// 直せなかったとき（読めない・canvas が書き出しを拒む）は例外を投げず undefined を返す。

/** svg を描く長辺（px）。svg は拡大しても崩れないので、元の寸法によらずこの大きさに描く。 */
const RASTER_LONG_SIDE = 1024

export async function promptReadyDataUrl(dataUrl: string): Promise<string | undefined> {
  if (!dataUrl.toLowerCase().startsWith("data:image/svg+xml")) {
    return dataUrl
  }
  try {
    const image = new Image()
    image.src = dataUrl
    await image.decode()
    const { width, height } = rasterSize(image.naturalWidth, image.naturalHeight)
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (context === null) {
      return undefined
    }
    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL("image/png")
  } catch {
    return undefined
  }
}

/** 縦横比を保って長辺を {@link RASTER_LONG_SIDE} にした寸法。寸法を持たない svg は正方形。 */
function rasterSize(
  naturalWidth: number,
  naturalHeight: number,
): { readonly width: number; readonly height: number } {
  if (naturalWidth === 0 || naturalHeight === 0) {
    return { width: RASTER_LONG_SIDE, height: RASTER_LONG_SIDE }
  }
  const scale = RASTER_LONG_SIDE / Math.max(naturalWidth, naturalHeight)
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  }
}
