// 画像の塊（`image`）を HTML に組む。画像の取り出し元と `src` 属性もここが持つ。

import type { ReportBlock } from "./report-block.ts"
import { captionedMarkdown } from "./report-caption.ts"
import { reportImagePath, type ReportImageSize } from "./report-image.ts"
import { htmlAttribute, htmlInlineWithCode } from "./report-inline-markdown.ts"

/**
 * `image` の塊の画像をどこから読むか。
 * `shelved` は描いた `report` の呼び出しの id で棚を引く。`sizes` はサーバが棚に置いたときに測れた画像の寸法で、無いパスの画像は寸法を付けない。
 * `unshelved` はサーバが棚に置けなかった・寸法を測れなかったパスで、その画像は `src` を付けず最初から「出せない」の札になる。
 * `none` は棚に置いていない本文で、画像は「出せない」の札になる。
 */
export type ReportImageSource =
  | {
      readonly kind: "shelved"
      readonly toolUseId: string
      readonly sizes: readonly ReportImageSize[]
      readonly unshelved: readonly string[]
    }
  | { readonly kind: "none" }

/**
 * 画像1枚と、その下の題の行。`src` は棚を引く経路で、棚に置いていない本文では付けない（描く側が「出せない」の札にする）。
 * `notes` があれば、画像の横に1始まりの番号を振った説明の並びを置き、包みは縮めない。
 */
export function imageMarkdown(
  block: Extract<ReportBlock, { readonly kind: "image" }>,
  imageSource: ReportImageSource,
  ordinal: number,
): string {
  const caption = block.caption.trim()
  const alt = htmlAttribute(pictureAltOf(block.caption))
  const image = `<img${reportImageAttributes(imageSource, block.path)} alt="${alt}">`
  const annotated = block.notes.length > 0
  return captionedMarkdown({
    kind: "figure",
    ordinal,
    title: caption,
    body: annotated
      ? `<div class="image-notes">${image}${imageNoteListMarkdown(block.notes)}</div>`
      : image,
    bodyFormat: "html",
    fit: !annotated,
  })
}

/**
 * `img` の `src` 属性と、寸法が分かれば `width`・`height` 属性（前の空白つき）。
 * 棚に置いていない本文では空にし、描く側が「出せない」の札にする。
 */
export function reportImageAttributes(imageSource: ReportImageSource, path: string): string {
  const props = reportImageProps(imageSource, path)
  if (props.src === undefined) {
    return ""
  }
  const src = ` src="${htmlAttribute(props.src)}"`
  return props.size === undefined
    ? src
    : `${src} width="${String(props.size.width)}" height="${String(props.size.height)}"`
}

/**
 * 画像の `src` と、分かれば画素の寸法。棚に置いていない本文・棚に置けなかったパスは `src` を持たない（描く側が「出せない」の札にする）。
 */
export function reportImageProps(
  imageSource: ReportImageSource,
  path: string,
): {
  readonly src: string | undefined
  readonly size: { readonly width: number; readonly height: number } | undefined
} {
  if (imageSource.kind === "none" || imageSource.unshelved.includes(path)) {
    return { src: undefined, size: undefined }
  }
  const size = imageSource.sizes.find((candidate) => candidate.path === path)
  return {
    src: reportImagePath(imageSource.toolUseId, path),
    size: size === undefined ? undefined : { width: size.width, height: size.height },
  }
}

/** `image` の代替テキスト。題が空なら「画面の画像」。 */
export function pictureAltOf(caption: string): string {
  const text = caption.trim()
  return text === "" ? "画面の画像" : text
}

function imageNoteListMarkdown(notes: readonly string[]): string {
  const items = notes.map(
    (note, index) =>
      `<li><span class="image-note-number" aria-hidden="true">${String(index + 1)}</span>` +
      `<span class="image-note-text">${htmlInlineWithCode(note)}</span></li>`,
  )
  return `<ol class="image-note-list">${items.join("")}</ol>`
}
