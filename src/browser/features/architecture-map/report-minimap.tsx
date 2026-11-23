// レポートの「変えたファイル」の節に置くミニマップ。地図の図の縮小版に、変えた箱を件数つきで色づける。
// 箱を押すと、変えたファイルの一覧をその箱の分に絞る（絞りは置く側が持つ）。

import type { ReactElement } from "react"

import type { ChangedFile } from "../../../shared/report/changed-file.ts"
import { changedBoxCountsOf, type ReportMap } from "../../../shared/report/report-map.ts"
import { ArchitectureMapDiagram } from "./architecture-map-diagram.tsx"
import { useArchitectureMapSelection } from "./architecture-map-selection.ts"

export function ReportMinimap(props: {
  readonly map: ReportMap
  readonly changed: readonly ChangedFile[]
  readonly selectedId?: string
  readonly onSelect: (boxId: string) => void
}): ReactElement {
  const lit = useArchitectureMapSelection((state) => state.lit)
  return (
    <ArchitectureMapDiagram
      view={props.map.view}
      form="report"
      changes={changedBoxCountsOf(props.map, props.changed)}
      {...(props.selectedId === undefined ? {} : { selectedId: props.selectedId })}
      {...(lit === undefined ? {} : { litId: lit })}
      onSelect={(box) => {
        props.onSelect(box.id)
      }}
    />
  )
}
