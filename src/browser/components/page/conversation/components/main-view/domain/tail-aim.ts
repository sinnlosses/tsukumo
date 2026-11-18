// 吹き出しの尾の根元・向き・長さを、立ち絵の顔の位置から決める。
// 座標はすべて画面（viewport）の座標。測る・描くのは呼ぶ側で、ここは数だけを扱う。

import {
  DEFAULT_FACE_AT,
  type FaceAt,
} from "../../../../../../../shared/character-pack/character-definition.ts"

/** 尾の長さの上限と下限（px）。 */
const TAIL_LENGTH_MAX = 20
const TAIL_LENGTH_MIN = 8
/** 根元の幅の半分（px）。 */
const TAIL_HALF_WIDTH = 6
/** 吹き出しの左下の角の丸み（px）。根元はその内側の真っすぐな所に置く。 */
const CORNER_RADIUS = 4
/** 吹き出しの上の角のそばに根元を置かない余白（px）。 */
const TOP_MARGIN = 16
/**
 * すぐ下の物までの空きがこれ未満なら、下の辺からは出さない（px）。
 * 空きが狭いと下の辺の尾は 10px ほどしか伸びず、顔が斜め下にあると左の角の下でレ点の形に潰れる。左の辺からなら同じ空きでも長さが取れる。
 */
const MIN_GAP_FOR_BOTTOM = 20
/** 下の辺から出すとき、先を根元の中心から横へずらす上限（px）。根元の2点のあいだに収め、尾が角の下へ折れ返る形にしない。 */
const BOTTOM_TIP_SHIFT_MAX = TAIL_HALF_WIDTH - 1
/** 根元の2点を縁の線の内側へ入れる量。塗りで縁の線を覆う（px）。 */
const BASE_INSET = 1.5
/**
 * 塗りだけを根元からさらに吹き出しの内側へ伸ばす量（px）。
 * 縁の線は端末の画素に寄せて描かれ、吹き出しの位置が端数だと最大で半画素ずれるので、根元の位置ちょうどまでの塗りでは縁の線が細く残る。
 */
const FILL_DEPTH = 1.5

export type Point = { readonly x: number; readonly y: number }

export type BubbleRect = {
  readonly left: number
  readonly top: number
  readonly bottom: number
}

export type TailAimInput = {
  readonly bubble: BubbleRect
  readonly face: Point
  /** すぐ下の物までの空き（px）。下に何も無ければ `Number.POSITIVE_INFINITY`。 */
  readonly gapBelow: number
}

export type TailAim = {
  readonly side: "left" | "bottom"
  readonly root: Point
  readonly tip: Point
  /** 根元の2点（吹き出しの縁の線の内側）。 */
  readonly base: readonly [Point, Point]
}

/** パックの `faceAt`（無ければ既定）を、立ち絵の箱と絵の縦横比から画面の座標にする。絵は箱の下端に寄せ、縦横比を保って収まる。 */
export function faceOnScreen(input: {
  readonly box: {
    readonly left: number
    readonly bottom: number
    readonly width: number
    readonly height: number
  }
  readonly naturalWidth: number
  readonly naturalHeight: number
  readonly faceAt?: FaceAt
}): Point {
  const faceAt = input.faceAt ?? DEFAULT_FACE_AT
  const ratio =
    input.naturalWidth > 0 && input.naturalHeight > 0 ? input.naturalWidth / input.naturalHeight : 1
  const width = Math.min(input.box.width, input.box.height * ratio)
  const height = width / ratio
  return {
    x: input.box.left + (input.box.width - width) / 2 + width * faceAt.x,
    y: input.box.bottom - height + height * faceAt.y,
  }
}

/**
 * 尾の塗りと線の `path` の `d`。座標は吹き出しの左上を原点にした局所の座標。
 * 線は2辺（根元の2点から先へ）だけを引き、塗りは根元から吹き出しの内側へ `FILL_DEPTH` だけ伸ばして縁の線を覆いきる。
 */
export function tailPath(
  aim: TailAim,
  bubble: BubbleRect,
): { readonly fill: string; readonly stroke: string } {
  const local = (point: Point): string =>
    `${(point.x - bubble.left).toFixed(1)} ${(point.y - bubble.top).toFixed(1)}`
  const inward = (point: Point): Point =>
    aim.side === "left"
      ? { x: point.x + FILL_DEPTH, y: point.y }
      : { x: point.x, y: point.y - FILL_DEPTH }
  const [start, end] = aim.base
  return {
    fill: `M${local(inward(start))} L${local(start)} L${local(aim.tip)} L${local(end)} L${local(inward(end))} Z`,
    stroke: `M${local(start)} L${local(aim.tip)} L${local(end)}`,
  }
}

/** 尾を顔へ向ける。顔が横にあるか下の空きが狭いときは左の辺から、そうでなければ下の辺から出す。 */
export function tailAim(input: TailAimInput): TailAim {
  const { bubble, face, gapBelow } = input
  const sideways = Math.abs(face.x - bubble.left) >= Math.abs(face.y - bubble.bottom)
  const side = sideways || gapBelow < MIN_GAP_FOR_BOTTOM ? "left" : "bottom"
  const root: Point =
    side === "left"
      ? {
          x: bubble.left,
          y: Math.min(
            bubble.bottom - CORNER_RADIUS - TAIL_HALF_WIDTH,
            Math.max(bubble.top + TOP_MARGIN + TAIL_HALF_WIDTH, face.y),
          ),
        }
      : { x: bubble.left + CORNER_RADIUS + TAIL_HALF_WIDTH + CORNER_RADIUS, y: bubble.bottom }
  const distance = Math.hypot(face.x - root.x, face.y - root.y)
  const toFace =
    distance === 0
      ? { x: -1, y: 0 }
      : { x: (face.x - root.x) / distance, y: (face.y - root.y) / distance }
  const unit = side === "left" ? tiltedOutwardAtMost45(toFace) : toFace
  // 先が下の物の縁を越えない長さ。左の辺から出すときも、下へ向くぶんだけ縮める。
  const reach = side === "left" ? bubble.bottom + gapBelow - 2 - root.y : gapBelow - 3
  const room = unit.y > 0.2 && Number.isFinite(gapBelow) ? reach / unit.y : TAIL_LENGTH_MAX
  const length = Math.max(TAIL_LENGTH_MIN, Math.min(TAIL_LENGTH_MAX, room, distance - 12))
  const shift = unit.x * length
  const tip = {
    x:
      root.x +
      (side === "bottom"
        ? Math.max(-BOTTOM_TIP_SHIFT_MAX, Math.min(BOTTOM_TIP_SHIFT_MAX, shift))
        : shift),
    y: root.y + unit.y * length,
  }
  const base: readonly [Point, Point] =
    side === "left"
      ? [
          { x: bubble.left + BASE_INSET, y: root.y - TAIL_HALF_WIDTH },
          { x: bubble.left + BASE_INSET, y: root.y + TAIL_HALF_WIDTH },
        ]
      : [
          { x: root.x + TAIL_HALF_WIDTH, y: bubble.bottom - BASE_INSET },
          { x: root.x - TAIL_HALF_WIDTH, y: bubble.bottom - BASE_INSET },
        ]
  return { side, root, tip, base }
}

/**
 * 左の辺の尾の向きを、外（左）から上下へ45度以内に寄せる。
 * 顔が真下寄りや右下にあると、そのままでは尾が縁に沿う細い棘になるか、吹き出しの内側へ向く。
 */
function tiltedOutwardAtMost45(unit: Point): Point {
  if (-unit.x >= Math.abs(unit.y)) {
    return unit
  }
  return { x: -Math.SQRT1_2, y: unit.y < 0 ? -Math.SQRT1_2 : Math.SQRT1_2 }
}
