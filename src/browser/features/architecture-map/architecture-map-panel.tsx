// サイドバーの「地図」のタブの中身。頭はミニマップと「広げる」、その下は選んだ箱の名前と縮尺、
// 役割（summary）・目的（purpose）・概要（overview）の順で、置き場・数（ファイル・子モジュール）・用語・つながりを小さく添える。
// 何も選んでいないときはリポジトリの概要を出す。地図が読めないときは理由の1行だけを出す。

import { type ReactElement, useState } from "react"

import type { MapUnreadableReason } from "../../../shared/architecture-map/architecture-map.ts"
import type {
  MapReady,
  MapView,
  MapViewAdr,
  MapViewBox,
} from "../../../shared/architecture-map/map-view.ts"
import {
  BreadcrumbTrail,
  type Crumb,
} from "../../components/ui/breadcrumb-trail/breadcrumb-trail.tsx"
import { Button } from "../../components/ui/button/button.tsx"
import { useSession } from "../../stores/session.ts"
import { ArchitectureMapDiagram } from "./architecture-map-diagram.tsx"
import styles from "./architecture-map-panel.module.css"
import { type SelectedBox, useArchitectureMapSelection } from "./architecture-map-selection.ts"
import { MapBoxCounts } from "./map-box-count.tsx"
import { MAP_LEVEL_TEXT } from "./map-box-mention.ts"
import { useArchitectureMapOverview } from "./use-architecture-map.ts"

const UNREADABLE_TEXT = {
  "not-json": "地図のファイルが壊れていて読めません（JSON ではありません）",
  "off-contract": "地図のファイルが壊れていて読めません（契約に沿っていません）",
  "too-large": "地図のファイルが大きすぎて読めません",
  "read-failed": "地図のファイルを開けませんでした",
  "newer-version": "地図のファイルが新しい版で、この画面は読めません",
} as const satisfies Record<MapUnreadableReason, string>

export function ArchitectureMapPanel(): ReactElement {
  const response = useArchitectureMapOverview()
  if (response?.kind === "unreadable") {
    return <p className={styles["panel-notice"]}>{UNREADABLE_TEXT[response.reason]}</p>
  }
  if (response?.kind !== "ready") {
    return <p className={styles["panel-notice"]}>地図はありません</p>
  }
  return <ReadyPanel ready={response} />
}

function ReadyPanel(props: { readonly ready: MapReady }): ReactElement {
  const selected = useArchitectureMapSelection((state) => state.selected)
  const selectBox = useArchitectureMapSelection((state) => state.selectBox)
  const clearSelection = useArchitectureMapSelection((state) => state.clearSelection)
  const expand = useArchitectureMapSelection((state) => state.expand)
  const lit = useArchitectureMapSelection((state) => state.lit)
  const litView = useArchitectureMapSelection((state) => state.litView)
  const { view } = props.ready
  // 会話で指された箱は、その箱がある図（中・小の箱は親の図）で描く。画面で選んだときは全体の図のまま
  const baseView = selected?.by === "conversation" ? selected.view : view
  // 触れているバッジの箱が今の図に無いときは、その箱がある図に一時的に替える
  const shownView =
    lit !== undefined && litView !== undefined && !baseView.boxes.some((box) => box.id === lit)
      ? litView
      : baseView
  return (
    <div className={styles["panel"]}>
      <BreadcrumbTrail
        variant="supporting"
        label="地図の段"
        crumbs={crumbsOf({
          overview: view,
          selected,
          select: (box) => {
            selectBox({ box, view, by: "screen" })
          },
          clear: clearSelection,
        })}
      />
      <div className={styles["panel-head"]}>
        <div className={styles["panel-minimap"]}>
          <ArchitectureMapDiagram
            view={shownView}
            form="mini"
            {...(selected === undefined ? {} : { selectedId: selected.box.id })}
            {...(lit === undefined ? {} : { litId: lit })}
            onSelect={(box) => {
              selectBox({ box, view: shownView, by: "screen" })
            }}
          />
        </div>
        <Button
          variant="ghost"
          size="label"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          className={styles["panel-expand"]}
          onClick={expand}
        >
          広げる
        </Button>
      </div>
      {selected === undefined ? (
        <RepositoryDescription overview={props.ready.overview} />
      ) : (
        <BoxDescription box={selected.box} view={selected.view} />
      )}
    </div>
  )
}

/**
 * 「全体」＋選んだ箱の親（その箱がある図の焦点）＋選んだ箱。
 * 「全体」は選びを外し、親の段は全体の図にある箱ならその箱を選び、無ければ選びを外す。
 */
function crumbsOf(args: {
  readonly overview: MapView
  readonly selected?: SelectedBox
  readonly select: (box: MapViewBox) => void
  readonly clear: () => void
}): readonly Crumb[] {
  const whole: Crumb = { key: "whole", title: "全体", onSelect: args.clear }
  const { selected } = args
  if (selected === undefined) {
    return [whole]
  }
  const { focus } = selected.view
  const parent: readonly Crumb[] =
    focus === undefined || focus.id === selected.box.id
      ? []
      : [
          {
            key: `parent:${focus.id}`,
            title: focus.title,
            onSelect: () => {
              const box = args.overview.boxes.find((candidate) => candidate.id === focus.id)
              if (box === undefined) {
                args.clear()
              } else {
                args.select(box)
              }
            },
          },
        ]
  return [
    whole,
    ...parent,
    { key: `box:${selected.box.id}`, title: selected.box.title, onSelect: args.clear },
  ]
}

function RepositoryDescription(props: { readonly overview?: string }): ReactElement {
  return (
    <section className={styles["panel-body"]} aria-label="リポジトリの概要">
      <h3 className={styles["panel-title"]}>リポジトリ</h3>
      {props.overview !== undefined && <p className={styles["panel-text"]}>{props.overview}</p>}
    </section>
  )
}

function BoxDescription(props: { readonly box: MapViewBox; readonly view: MapView }): ReactElement {
  const { box, view } = props
  const parent = box.level === 3 ? view.focus : undefined
  const paths = box.foldedPaths ?? box.paths
  const terms = box.links?.terms ?? []
  const connections = connectionsOf(box.id, view)
  const adrs = box.adrs ?? []
  return (
    <section className={styles["panel-body"]} aria-label={`${box.title}の説明`}>
      <h3 className={styles["panel-title"]}>
        {box.title}
        <span className={styles["panel-level"]}>{MAP_LEVEL_TEXT[box.level]}</span>
      </h3>
      {parent !== undefined && (
        <p className={styles["panel-parent"]}>
          {parent.title}
          {parent.summary !== undefined && `（${parent.summary}）`}の中
        </p>
      )}
      {box.summary !== undefined && <p className={styles["panel-text"]}>{box.summary}</p>}
      {box.purpose !== undefined && <p className={styles["panel-text"]}>{box.purpose}</p>}
      {box.overview !== undefined && <p className={styles["panel-text"]}>{box.overview}</p>}
      {paths.length > 0 && <PathList key={box.id} paths={paths} />}
      {!box.external && <MapBoxCounts fileCount={box.fileCount} childCount={box.childCount} />}
      {terms.length > 0 && <SmallList label="用語" items={terms} />}
      {connections.length > 0 && <SmallList label="つながり" items={connections} />}
      {adrs.length > 0 && <AdrList adrs={adrs} />}
    </section>
  )
}

const PATHS_SHOWN_COUNT = 3

/** 畳んだパス。3件を超えるときは先頭 3件と「ほか n 件」の行にし、押すと全部を出す。 */
function PathList(props: { readonly paths: readonly string[] }): ReactElement {
  const [opened, setOpened] = useState(false)
  const hiddenCount = props.paths.length - PATHS_SHOWN_COUNT
  const folded = hiddenCount > 0 && !opened
  return (
    <>
      <SmallList
        label="パス"
        items={folded ? props.paths.slice(0, PATHS_SHOWN_COUNT) : props.paths}
      />
      {folded && (
        <Button
          variant="ghost"
          size="label"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          className={styles["panel-expand"]}
          onClick={() => {
            setOpened(true)
          }}
        >
          {`ほか ${String(hiddenCount)} 件`}
        </Button>
      )}
    </>
  )
}

/** 決定の記録。行（番号と題）を押すと、そのファイルをエディタで開く。 */
function AdrList(props: { readonly adrs: readonly MapViewAdr[] }): ReactElement {
  const dispatch = useSession((session) => session.dispatch)
  return (
    <div className={styles["panel-small"]}>
      <span className={styles["panel-small-label"]}>ADR</span>
      {props.adrs.map((adr) => (
        <Button
          key={adr.path}
          variant="ghost"
          size="label"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          className={styles["panel-adr"]}
          onClick={() => {
            void dispatch.host.openFile({ path: adr.path })
          }}
        >
          {adr.number === undefined ? adr.title : `${adr.number} ${adr.title}`}
        </Button>
      ))}
    </div>
  )
}

function SmallList(props: {
  readonly label: string
  readonly items: readonly string[]
}): ReactElement {
  return (
    <div className={styles["panel-small"]}>
      <span className={styles["panel-small-label"]}>{props.label}</span>
      <span>{props.items.join("・")}</span>
    </div>
  )
}

/** 箱が端のエッジを相手ごとに束ねた本数。 */
function connectionsOf(id: string, view: MapView): readonly string[] {
  const titleOf = (otherId: string) =>
    view.boxes.find((box) => box.id === otherId)?.title ?? otherId
  return view.edges.flatMap((edge) => {
    if (edge.from === id) {
      return [`${titleOf(edge.to)}へ ${String(edge.count)}本`]
    }
    return edge.to === id ? [`${titleOf(edge.from)}から ${String(edge.count)}本`] : []
  })
}
