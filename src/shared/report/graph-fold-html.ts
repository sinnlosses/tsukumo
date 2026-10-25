// 折り返し配置の図を、`svg` の塊と同じ包みの HTML にする。色は data 属性で運び、見た目は CSS が決める。

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
import { htmlInline } from "./report-inline-markdown.ts"

const MARKER_ID = "report-svg-arrow"

/** 図を `svg` の塊と同じ包みの HTML の1行にする（空行を挟むと Markdown の HTML の塊が切れる）。 */
export function graphFoldHtml(figure: GraphFoldFigure): string {
  const w = String(figure.width)
  const h = String(figure.height)
  const marker =
    `<defs><marker id="${MARKER_ID}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">` +
    `<path d="M0,0 L10,5 L0,10 z"></path></marker></defs>`
  const body = [
    ...figure.frames.map(frameHtml),
    ...figure.paths.map(pathHtml),
    ...figure.boxes.map(boxHtml),
    ...figure.paths.map(pathLabelHtml),
  ].join("")
  return `<div class="svg-figure"><svg data-graph="" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${marker}${body}</svg></div>`
}

function frameHtml(frame: FoldFrame): string {
  const look =
    frame.tone === "none" ? ` data-ground="${String(frame.ground)}"` : ` data-tone="${frame.tone}"`
  const rect = `<rect x="${n(frame.x)}" y="${n(frame.y)}" width="${n(frame.width)}" height="${n(frame.height)}" rx="8" data-frame=""${look}></rect>`
  const title =
    frame.title === ""
      ? ""
      : `<text x="${n(frame.x + 10)}" y="${n(frame.y + 16)}" font-size="${String(NOTE_FONT_SIZE)}" data-sub="">${htmlInline(frame.title)}</text>`
  return rect + title
}

function boxHtml(box: FoldBox): string {
  const look = [
    ...(box.tone === "none" ? [] : [` data-tone="${box.tone}"`]),
    ...(box.change === "unchanged" ? [] : [` data-change="${box.change}"`]),
  ].join("")
  const rx = box.shape === "round" ? box.height / 2 : box.shape === "decision" ? 2 : 6
  const shape =
    box.shape === "decision"
      ? `<polygon points="${decisionPoints(box)}"${look}></polygon>`
      : `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}" rx="${n(rx)}"${look}></rect>`
  const textHeight = box.lines.length * LABEL_LINE_HEIGHT + box.notes.length * NOTE_LINE_HEIGHT
  const top = box.y + (box.height - textHeight) / 2
  const cx = box.x + box.width / 2
  const lines = box.lines.map(
    (line, index) =>
      `<text x="${n(cx)}" y="${n(top + (index + 0.75) * LABEL_LINE_HEIGHT)}" font-size="${String(LABEL_FONT_SIZE)}" text-anchor="middle">${htmlInline(line)}</text>`,
  )
  const notesTop = top + box.lines.length * LABEL_LINE_HEIGHT
  const notes = box.notes.map(
    (line, index) =>
      `<text x="${n(cx)}" y="${n(notesTop + (index + 0.75) * NOTE_LINE_HEIGHT)}" font-size="${String(NOTE_FONT_SIZE)}" text-anchor="middle" data-sub="">${htmlInline(line)}</text>`,
  )
  return shape + lines.join("") + notes.join("")
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
    .map(([x = 0, y = 0]) => `${n(x)},${n(y)}`)
    .join(" ")
}

function pathHtml(path: FoldPath): string {
  const look = [
    ...(path.returns ? [' data-return=""'] : []),
    ...(path.tone === "none" ? [] : [` data-tone="${path.tone}"`]),
    ...(path.change === "unchanged" ? [] : [` data-change="${path.change}"`]),
    ...(path.dashed || path.returns || path.change === "removed"
      ? [' stroke-dasharray="6 4"']
      : []),
  ].join("")
  const points = path.points.map(([x, y]) => `${n(x)},${n(y)}`).join(" ")
  return `<polyline points="${points}" marker-end="url(#${MARKER_ID})"${look}></polyline>`
}

function pathLabelHtml(path: FoldPath): string {
  return path.label
    .map(
      (line, index) =>
        `<text x="${n(path.labelX)}" y="${n(path.labelY + index * EDGE_LINE_HEIGHT)}" font-size="${String(EDGE_FONT_SIZE)}" text-anchor="${path.labelAnchor}" data-sub="">${htmlInline(line)}</text>`,
    )
    .join("")
}

function n(value: number): string {
  return String(Math.round(value * 10) / 10)
}
