// 本文とセリフの `{{map: <ID>}}` を箱のバッジで描く。
// 地図が無い・読めない・届く前・知らない ID は、印の元の字のまま返す。

import { Fragment, type ReactElement, type ReactNode } from "react"

import type { MapBoxIndexEntry } from "../../../shared/architecture-map/map-view.ts"
import { parseInlineMarks } from "../../../shared/report/inline-mark.ts"
import { useArchitectureMapSelection } from "./architecture-map-selection.ts"
import { MapBoxBadge } from "./map-box-badge.tsx"
import { resolveMapBox } from "./map-box-lookup.ts"
import styles from "./map-box-mark.module.css"
import { lightBoxView } from "./point-box.ts"
import { useArchitectureMapBoxes } from "./use-architecture-map.ts"

type MapBoxMarkProps = {
  readonly id: string
  /** 箱に解けないときに出す、印の元の字。 */
  readonly source: string
}

export function MapBoxMark({ id, source }: MapBoxMarkProps): ReactElement {
  const index = useArchitectureMapBoxes()
  if (index.kind !== "ready") {
    return <>{source}</>
  }
  const lookup = resolveMapBox(index.boxes, id)
  return lookup.kind === "found" ? <TouchableBadge box={lookup.box} /> : <>{source}</>
}

type MapMarkTextProps = {
  readonly text: string
}

/** 文の中の `map` の印だけを箱のバッジにし、ほかの印・壊れた印・字は元の字のまま返す。 */
export function MapMarkText({ text }: MapMarkTextProps): ReactElement {
  if (!text.includes("{{")) {
    return <>{text}</>
  }
  return (
    <>
      {segmentsWithOffset(text).map(({ segment, offset }) => (
        <Fragment key={offset}>{segmentNode(segment)}</Fragment>
      ))}
    </>
  )
}

/**
 * 触れる・フォーカスで地図の同じ箱を光らせる（選びは変えず、指された回数も足さない）。
 * セリフの行の押す動作（表情を遡る）へ届かないよう、押下・クリック・キーは止める。
 */
function TouchableBadge(props: { readonly box: MapBoxIndexEntry }): ReactElement {
  const setLit = useArchitectureMapSelection((state) => state.setLit)
  const clearLit = useArchitectureMapSelection((state) => state.clearLit)
  const touch = () => {
    setLit(props.box.id)
    void lightBoxView(props.box)
  }
  return (
    <button
      type="button"
      className={styles["mark"]}
      onPointerEnter={touch}
      onFocus={touch}
      onPointerLeave={clearLit}
      onBlur={clearLit}
      onMouseDown={(event) => {
        event.stopPropagation()
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.stopPropagation()
        touch()
      }}
    >
      <MapBoxBadge badge={props.box} />
    </button>
  )
}

type InlineSegment = ReturnType<typeof parseInlineMarks>[number]

/** 各要素の文字を連ねると入力に戻るので、入力の中の開始位置が要素ごとに決まった key になる。 */
function segmentsWithOffset(text: string): readonly {
  readonly segment: InlineSegment
  readonly offset: number
}[] {
  return parseInlineMarks(text).reduce<{
    readonly parts: readonly { readonly segment: InlineSegment; readonly offset: number }[]
    readonly next: number
  }>(
    (acc, segment) => ({
      parts: [...acc.parts, { segment, offset: acc.next }],
      next: acc.next + segmentLength(segment),
    }),
    { parts: [], next: 0 },
  ).parts
}

function segmentLength(segment: InlineSegment): number {
  return (segment.kind === "mark" ? segment.source : segment.text).length
}

function segmentNode(segment: InlineSegment): ReactNode {
  if (segment.kind === "mark") {
    return segment.mark.kind === "map" ? (
      <MapBoxMark id={segment.mark.id} source={segment.source} />
    ) : (
      segment.source
    )
  }
  return segment.text
}
