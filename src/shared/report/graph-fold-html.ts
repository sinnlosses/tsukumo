// 折り返し配置の図を、`svg` の塊と同じ包みの値と HTML にする。色は data 属性で運び、見た目は CSS が決める。

import {
  EDGE_FONT_SIZE,
  EDGE_LINE_HEIGHT,
  LABEL_FONT_SIZE,
  LABEL_LINE_HEIGHT,
  NOTE_FONT_SIZE,
  NOTE_LINE_HEIGHT,
  type FoldBox,
  type FoldFrame,
  type FoldPath,
  type GraphFoldFigure,
} from "./graph-fold-figure.ts"
import type { GraphChange, GraphTone } from "./graph-source.ts"
import { htmlInline } from "./report-inline-markdown.ts"

const MARKER_ID = "report-svg-arrow"

type MarkedTone = Exclude<GraphTone, "none">

type MarkedChange = Exclude<GraphChange, "unchanged">

/** 字1行。座標は小数1桁に丸めた数。`sub` は弱い色の字。 */
export type FoldText = {
  readonly x: number
  readonly y: number
  readonly fontSize: number
  readonly anchor: "start" | "middle" | "end" | undefined
  readonly sub: boolean
  readonly text: string
}

export type FoldFrameDrawing = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** 色の目印のある群は `tone`、無い群は地の色の番号 `ground`。 */
  readonly look:
    | { readonly kind: "tone"; readonly tone: MarkedTone }
    | { readonly kind: "ground"; readonly ground: number }
  readonly title: FoldText | undefined
}

export type FoldBoxDrawing = {
  readonly body:
    | {
        readonly kind: "rect"
        readonly x: number
        readonly y: number
        readonly width: number
        readonly height: number
        readonly rx: number
      }
    | { readonly kind: "polygon"; readonly points: string }
  readonly tone: MarkedTone | undefined
  readonly change: MarkedChange | undefined
  /** 名前の行、続けて説明の行。 */
  readonly texts: readonly FoldText[]
}

export type FoldPathDrawing = {
  readonly points: string
  readonly returns: boolean
  readonly tone: MarkedTone | undefined
  readonly change: MarkedChange | undefined
  readonly dashed: boolean
  readonly labels: readonly FoldText[]
}

export type GraphFoldDrawing = {
  readonly width: number
  readonly height: number
  readonly arrowMarkerId: string
  readonly frames: readonly FoldFrameDrawing[]
  readonly paths: readonly FoldPathDrawing[]
  readonly boxes: readonly FoldBoxDrawing[]
}

/** 折り返しの図を、描く要素ごとの値にする（座標は小数1桁に丸める）。 */
export function graphFoldDrawingOf(figure: GraphFoldFigure): GraphFoldDrawing {
  return {
    width: figure.width,
    height: figure.height,
    arrowMarkerId: MARKER_ID,
    frames: figure.frames.map(frameDrawing),
    paths: figure.paths.map(pathDrawing),
    boxes: figure.boxes.map(boxDrawing),
  }
}

/** 図を `svg` の塊と同じ包みの HTML の1行にする（空行を挟むと Markdown の HTML の塊が切れる）。 */
export function graphFoldHtml(figure: GraphFoldFigure): string {
  const drawing = graphFoldDrawingOf(figure)
  const w = String(drawing.width)
  const h = String(drawing.height)
  const marker =
    `<defs><marker id="${drawing.arrowMarkerId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">` +
    `<path d="M0,0 L10,5 L0,10 z"></path></marker></defs>`
  const body = [
    ...drawing.frames.map(frameHtml),
    ...drawing.paths.map(pathHtml),
    ...drawing.boxes.map(boxHtml),
    ...drawing.paths.flatMap((path) => path.labels.map(textHtml)),
  ].join("")
  return `<div class="svg-figure"><svg data-graph="" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${marker}${body}</svg></div>`
}

function frameDrawing(frame: FoldFrame): FoldFrameDrawing {
  return {
    x: rounded(frame.x),
    y: rounded(frame.y),
    width: rounded(frame.width),
    height: rounded(frame.height),
    look:
      frame.tone === "none"
        ? { kind: "ground", ground: frame.ground }
        : { kind: "tone", tone: frame.tone },
    title:
      frame.title === ""
        ? undefined
        : {
            x: rounded(frame.x + 10),
            y: rounded(frame.y + 16),
            fontSize: NOTE_FONT_SIZE,
            anchor: undefined,
            sub: true,
            text: frame.title,
          },
  }
}

function boxDrawing(box: FoldBox): FoldBoxDrawing {
  const rx = box.shape === "round" ? box.height / 2 : box.shape === "decision" ? 2 : 6
  const textHeight = box.lines.length * LABEL_LINE_HEIGHT + box.notes.length * NOTE_LINE_HEIGHT
  const top = box.y + (box.height - textHeight) / 2
  const cx = box.x + box.width / 2
  const notesTop = top + box.lines.length * LABEL_LINE_HEIGHT
  return {
    body:
      box.shape === "decision"
        ? { kind: "polygon", points: decisionPoints(box) }
        : {
            kind: "rect",
            x: rounded(box.x),
            y: rounded(box.y),
            width: rounded(box.width),
            height: rounded(box.height),
            rx: rounded(rx),
          },
    tone: box.tone === "none" ? undefined : box.tone,
    change: box.change === "unchanged" ? undefined : box.change,
    texts: [
      ...box.lines.map((line, index): FoldText => ({
        x: rounded(cx),
        y: rounded(top + (index + 0.75) * LABEL_LINE_HEIGHT),
        fontSize: LABEL_FONT_SIZE,
        anchor: "middle",
        sub: false,
        text: line,
      })),
      ...box.notes.map((line, index): FoldText => ({
        x: rounded(cx),
        y: rounded(notesTop + (index + 0.75) * NOTE_LINE_HEIGHT),
        fontSize: NOTE_FONT_SIZE,
        anchor: "middle",
        sub: true,
        text: line,
      })),
    ],
  }
}

function pathDrawing(path: FoldPath): FoldPathDrawing {
  return {
    points: path.points.map(([x, y]) => `${rounded(x)},${rounded(y)}`).join(" "),
    returns: path.returns,
    tone: path.tone === "none" ? undefined : path.tone,
    change: path.change === "unchanged" ? undefined : path.change,
    dashed: path.dashed || path.returns || path.change === "removed",
    labels: path.label.map((line, index): FoldText => ({
      x: rounded(path.labelX),
      y: rounded(path.labelY + index * EDGE_LINE_HEIGHT),
      fontSize: EDGE_FONT_SIZE,
      anchor: path.labelAnchor,
      sub: true,
      text: line,
    })),
  }
}

function frameHtml(frame: FoldFrameDrawing): string {
  const look =
    frame.look.kind === "ground"
      ? ` data-ground="${String(frame.look.ground)}"`
      : ` data-tone="${frame.look.tone}"`
  const rect = `<rect x="${String(frame.x)}" y="${String(frame.y)}" width="${String(frame.width)}" height="${String(frame.height)}" rx="8" data-frame=""${look}></rect>`
  return rect + (frame.title === undefined ? "" : textHtml(frame.title))
}

function boxHtml(box: FoldBoxDrawing): string {
  const look = [
    ...(box.tone === undefined ? [] : [` data-tone="${box.tone}"`]),
    ...(box.change === undefined ? [] : [` data-change="${box.change}"`]),
  ].join("")
  const shape =
    box.body.kind === "polygon"
      ? `<polygon points="${box.body.points}"${look}></polygon>`
      : `<rect x="${String(box.body.x)}" y="${String(box.body.y)}" width="${String(box.body.width)}" height="${String(box.body.height)}" rx="${String(box.body.rx)}"${look}></rect>`
  return shape + box.texts.map(textHtml).join("")
}

/** `font-size`・`text-anchor`・`data-sub` の順に属性を書く。 */
function textHtml(text: FoldText): string {
  const anchor = text.anchor === undefined ? "" : ` text-anchor="${text.anchor}"`
  const sub = text.sub ? ' data-sub=""' : ""
  return `<text x="${String(text.x)}" y="${String(text.y)}" font-size="${String(text.fontSize)}"${anchor}${sub}>${htmlInline(text.text)}</text>`
}

/** 分岐の箱は左右の端を尖らせた六角形（字の入る幅を菱形より広く取れる）。 */
function decisionPoints(box: FoldBox): string {
  const inset = Math.min(16, box.height / 2)
  const right = box.x + box.width
  const middle = box.y + box.height / 2
  const bottom = box.y + box.height
  return [
    [box.x + inset, box.y],
    [right - inset, box.y],
    [right, middle],
    [right - inset, bottom],
    [box.x + inset, bottom],
    [box.x, middle],
  ]
    .map(([x = 0, y = 0]) => `${rounded(x)},${rounded(y)}`)
    .join(" ")
}

function pathHtml(path: FoldPathDrawing): string {
  const look = [
    ...(path.returns ? [' data-return=""'] : []),
    ...(path.tone === undefined ? [] : [` data-tone="${path.tone}"`]),
    ...(path.change === undefined ? [] : [` data-change="${path.change}"`]),
    ...(path.dashed ? [' stroke-dasharray="6 4"'] : []),
  ].join("")
  return `<polyline points="${path.points}" marker-end="url(#${MARKER_ID})"${look}></polyline>`
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10
}
