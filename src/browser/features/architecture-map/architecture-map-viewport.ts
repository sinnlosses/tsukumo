// 広げた地図の倍率と位置。純粋な関数だけで、拡大・縮小は枠の中心を動かさない。
// 図全体を枠に収める倍率を基準に、上限は 2、下限は収まる倍率と 0.25 の小さい方。

export type Size = { readonly width: number; readonly height: number }

export type Viewport = {
  readonly scale: number
  /** 図の左上の、枠の左上からのずれ（px）。 */
  readonly x: number
  readonly y: number
}

const ZOOM_STEP = 1.25
const MAX_SCALE = 2
const MIN_SCALE_CAP = 0.25

/** 図全体を枠に収め、枠の中央に置く。 */
export function fitViewport(content: Size, frame: Size): Viewport {
  return centered(fitScale(content, frame), content, frame)
}

export function zoomedViewport(
  viewport: Viewport,
  direction: "in" | "out",
  content: Size,
  frame: Size,
): Viewport {
  const factor = direction === "in" ? ZOOM_STEP : 1 / ZOOM_STEP
  return zoomedAround(viewport, factor, { x: frame.width / 2, y: frame.height / 2 }, content, frame)
}

/** 枠の左上からの点 `anchor` の下の図の位置を動かさず、倍率を `factor` 倍にする。上限と下限で止まる。 */
export function zoomedAround(
  viewport: Viewport,
  factor: number,
  anchor: { readonly x: number; readonly y: number },
  content: Size,
  frame: Size,
): Viewport {
  const fit = fitScale(content, frame)
  const scale = Math.min(MAX_SCALE, Math.max(Math.min(fit, MIN_SCALE_CAP), viewport.scale * factor))
  const ratio = scale / viewport.scale
  return {
    scale,
    x: anchor.x - (anchor.x - viewport.x) * ratio,
    y: anchor.y - (anchor.y - viewport.y) * ratio,
  }
}

export function movedViewport(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy }
}

function fitScale(content: Size, frame: Size): number {
  if (content.width <= 0 || content.height <= 0 || frame.width <= 0 || frame.height <= 0) {
    return 1
  }
  return Math.min(MAX_SCALE, frame.width / content.width, frame.height / content.height)
}

function centered(scale: number, content: Size, frame: Size): Viewport {
  return {
    scale,
    x: (frame.width - content.width * scale) / 2,
    y: (frame.height - content.height * scale) / 2,
  }
}
