// 面の頭（結論・数の札・合図の行など）とお願いを、欄の Markdown を通さずに描く。
// 結論・数の札・合図の行は値から、お願いは本文の塊を包みの中に並べる。段ごとの所要時間と変更したファイルは Markdown のまま描く。

import clsx from "clsx"
import type { ReactElement } from "react"

import { REPORT_NOTE_KINDS } from "../../../../../../shared/report/report-notation.ts"
import type { MainViewSurfaceHead } from "../../../../../../shared/session/main-view-shape.ts"
import { isBlankText } from "../../../../../../shared/utils/blank-text.ts"
import {
  checksClassName,
  InlineMarkdown,
  NoteLabel,
  noteLeafClassNames,
  statsLeafClassNames,
  textLeafClassNames,
} from "../markdown/markdown.tsx"
import { RegionBox, RegionChunks } from "./body-region.tsx"
import { ChecksVerdict } from "./checks-verdict.tsx"
import { StatCards } from "./stats-leaf.tsx"

/** 頭の欄。結論・数の札・合図の行・残りのどれも無ければ何も描かない。 */
export function HeadRegion(props: { readonly head: MainViewSurfaceHead }): ReactElement {
  const { lead, keyFigures, checks, status } = props.head
  if (
    lead.kind === "none" &&
    keyFigures.length === 0 &&
    checks.kind === "none" &&
    isBlankText(status)
  ) {
    return <></>
  }
  return (
    <RegionBox region={{ kind: "head" }}>
      {lead.kind !== "none" && (
        <div
          className={
            lead.kind === "conclusion"
              ? textLeafClassNames.conclusion
              : textLeafClassNames.conclusionLead
          }
        >
          <p>
            <InlineMarkdown text={lead.text} />
          </p>
        </div>
      )}
      {keyFigures.length > 0 && (
        <div className={statsLeafClassNames.keyFigures}>
          <StatCards items={keyFigures} />
        </div>
      )}
      {(checks.kind === "checks" || !isBlankText(status)) && (
        <div className={checksClassName("status")}>
          {checks.kind === "checks" && <ChecksVerdict view={checks} />}
          <RegionChunks markdown={status} />
        </div>
      )}
    </RegionBox>
  )
}

/** お願いの欄。本文が空なら何も描かない。`id` は合図の行の印が飛ぶ先。 */
export function FavorRegion(props: {
  readonly id: string
  readonly markdown: string
}): ReactElement {
  if (isBlankText(props.markdown)) {
    return <></>
  }
  const label = REPORT_NOTE_KINDS.find(([name]) => name === "note-favor")?.[1] ?? ""
  return (
    <RegionBox region={{ kind: "favor", id: props.id }}>
      <div className={clsx(noteLeafClassNames.note, noteLeafClassNames.noteFavor)}>
        <NoteLabel kindName="note-favor" label={label} />
        <RegionChunks markdown={props.markdown} />
      </div>
    </RegionBox>
  )
}
