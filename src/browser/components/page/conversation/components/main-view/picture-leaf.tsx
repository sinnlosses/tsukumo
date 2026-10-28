// `Picture`（画面の画像1枚）を Markdown に戻さず直接描く。
// 画像は棚（`/report-image/`）の経路だけを取り出し元にし、読めないときは既存の部品が「出せない」の札を出す。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import {
  pictureAltOf,
  type ReportImageSource,
  reportImageProps,
} from "../../../../../../shared/report/report-image-markdown.ts"
import { plainInline } from "../../../../../../shared/report/report-inline-markdown.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { figureClassName, InlineCodeText, ReportImage } from "../markdown/markdown.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

export function PictureLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
  readonly imageSource: ReportImageSource
}): ReactElement {
  const { part, value, imageSource } = props
  if (part.component !== "Picture") {
    return <></>
  }
  const image = (
    <PictureImage
      imageSource={imageSource}
      path={part.path}
      alt={pictureAltOf(part.caption)}
      region={undefined}
    />
  )
  const annotated = part.notes.length > 0
  return (
    <FoldedLeafFrame
      value={value}
      title={part.caption.trim()}
      fit={!annotated}
      fold={part.fold}
      swap={false}
    >
      {annotated ? (
        <div className={figureClassName("image-notes")}>
          {image}
          <ol className={figureClassName("image-note-list")}>
            {part.notes.map((note, index) => (
              <li key={`${String(index)}:${note}`}>
                <span className={figureClassName("image-note-number")} aria-hidden="true">
                  {index + 1}
                </span>
                <span className={figureClassName("image-note-text")}>
                  <InlineCodeText text={note} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        image
      )}
    </FoldedLeafFrame>
  )
}

/**
 * 棚の画像1枚。`src` を持たない（棚に置いていない・置けなかった）画像は、`ReportImage` が「出せない」の札にする。
 * `alt` の先頭の字が前後の見分けに使われる。
 */
export function PictureImage(props: {
  readonly imageSource: ReportImageSource
  readonly path: string
  readonly alt: string
  /** 変わった場所の枠を運ぶ `data-change-region` の値。 */
  readonly region: string | undefined
}): ReactElement {
  const { src, size } = reportImageProps(props.imageSource, props.path)
  return (
    <ReportImage
      src={src}
      alt={plainInline(props.alt)}
      width={size?.width}
      height={size?.height}
      data-change-region={props.region}
    />
  )
}
