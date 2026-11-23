// 中央の列に広げた地図。会話の流れの上に重なり、入力欄と声の帯は隠さない。
// 箱を押すと、子を持つ箱は潜り（その箱も選ぶ）、子を持たない箱は選ぶだけ。
// 拡大・縮小は「+」「−」とキー（面にフォーカスがあるとき）、移動は地のドラッグ。ホイールでは動かさない。

import { type KeyboardEvent, type PointerEvent, type ReactElement, useRef, useState } from "react"

import type { MapReady, MapView, MapViewBox } from "../../../shared/architecture-map/map-view.ts"
import { useResizeObservedRef } from "../../hooks/use-observed-ref.ts"
import { rpc } from "../../stores/rpc.ts"
import { ArchitectureMapDiagram } from "./architecture-map-diagram.tsx"
import styles from "./architecture-map-expanded.module.css"
import { type MapBoxRect, mapGeometryOf } from "./architecture-map-geometry.ts"
import { useArchitectureMapSelection } from "./architecture-map-selection.ts"
import {
  fitViewport,
  movedViewport,
  type Size,
  type Viewport,
  zoomedViewport,
} from "./architecture-map-viewport.ts"
import { useArchitectureMapOverview } from "./use-architecture-map.ts"

const QUESTION = {
  1: "このリポジトリは何で、どんな部分からできていて、外と何をやり取りするか",
  2: "この機能は何を受け持ち、どこから受けてどこへ渡すか",
  3: "このディレクトリには何が置かれ、親の機能の中でどの役か",
} as const satisfies Record<MapView["level"], string>

const NO_FRAME: Size = { width: 0, height: 0 }

/** 「この箱について聞く」の欄を置く、面の座標。選んだ箱が今の図に無いときは欄を出さない。 */
type AskPosition =
  | { readonly kind: "at"; readonly x: number; readonly y: number }
  | { readonly kind: "none" }

const ASK_GAP = 8

export function ArchitectureMapExpanded(): ReactElement | false {
  const expanded = useArchitectureMapSelection((state) => state.expanded)
  const overview = useArchitectureMapOverview()
  return expanded && overview.kind === "ready" && <Expanded overview={overview} />
}

type Step = { readonly title: string; readonly view: MapView }

/** 利用者が動かした倍率と位置。無ければ図全体を収める倍率。 */
type Adjustment = { readonly viewport?: Viewport }

/** 開いたときだけ面にフォーカスを置く（キー `+`・`-`・⎋ は面の中でだけ効かせる）。identity を変えないので描き直しで奪い返さない。 */
function focusOnMount(element: HTMLDivElement | null): void {
  element?.focus()
}

function Expanded(props: { readonly overview: MapReady }): ReactElement {
  const collapse = useArchitectureMapSelection((state) => state.collapse)
  const selected = useArchitectureMapSelection((state) => state.selected)
  const selectBox = useArchitectureMapSelection((state) => state.selectBox)
  const attachBadge = useArchitectureMapSelection((state) => state.attachBadge)
  const [trail, setTrail] = useState<readonly Step[]>([
    { title: "全体", view: props.overview.view },
  ])
  const [frame, setFrame] = useState<Size>(NO_FRAME)
  const [adjustment, setAdjustment] = useState<Adjustment>({})
  const drag = useRef({ active: false, x: 0, y: 0 })

  const current = trail.at(-1) ?? { title: "全体", view: props.overview.view }
  const content = mapGeometryOf(current.view, "full")
  const viewport = adjustment.viewport ?? fitViewport(content, frame)
  const askAt = askPositionOf(current.view, content.rects, viewport, selected?.box.id)
  const frameRef = useResizeObservedRef<HTMLDivElement>(
    (element) => {
      const next = { width: element.clientWidth, height: element.clientHeight }
      setFrame((previous) =>
        previous.width === next.width && previous.height === next.height ? previous : next,
      )
    },
    () => undefined,
  )

  const goTo = (next: readonly Step[]) => {
    setTrail(next)
    setAdjustment({})
  }
  const dive = async (box: MapViewBox) => {
    try {
      const response = await rpc.architectureMap.view.call({ kind: "focus", box: box.id })
      if (response.kind === "ready") {
        goTo([...trail, { title: box.title, view: response.view }])
      }
    } catch {
      // 引けなかったときは今の図に留まる（箱は選んだまま）
    }
  }
  const onSelect = (box: MapViewBox) => {
    selectBox({ box, view: current.view, by: "screen" })
    if (box.hasChildren) {
      void dive(box)
    }
  }
  const zoom = (direction: "in" | "out") => {
    setAdjustment({ viewport: zoomedViewport(viewport, direction, content, frame) })
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      collapse()
    } else if (event.key === "+") {
      zoom("in")
    } else if (event.key === "-") {
      zoom("out")
    }
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { active: true, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const from = drag.current
    if (!from.active) {
      return
    }
    drag.current = { active: true, x: event.clientX, y: event.clientY }
    setAdjustment({
      viewport: movedViewport(viewport, event.clientX - from.x, event.clientY - from.y),
    })
  }
  const onPointerEnd = () => {
    drag.current = { active: false, x: 0, y: 0 }
  }

  return (
    <div
      className={styles["expanded"]}
      role="dialog"
      aria-modal="false"
      aria-label="アーキテクチャの地図"
      tabIndex={-1}
      ref={focusOnMount}
      onKeyDown={onKeyDown}
    >
      <div className={styles["expanded-head"]}>
        <nav className={styles["expanded-crumbs"]} aria-label="地図の段">
          {trail.map((step, index) => (
            <span key={`${String(index)}:${step.title}`} className={styles["expanded-crumb"]}>
              {index > 0 && <span aria-hidden="true">›</span>}
              <button
                type="button"
                className={styles["expanded-button"]}
                aria-current={index === trail.length - 1 ? "location" : undefined}
                onClick={() => {
                  goTo(trail.slice(0, index + 1))
                }}
              >
                {step.title}
              </button>
            </span>
          ))}
        </nav>
        <div className={styles["expanded-controls"]}>
          <button
            type="button"
            className={styles["expanded-button"]}
            aria-label="縮小"
            onClick={() => {
              zoom("out")
            }}
          >
            −
          </button>
          <button
            type="button"
            className={styles["expanded-button"]}
            aria-label="拡大"
            onClick={() => {
              zoom("in")
            }}
          >
            +
          </button>
          <button
            type="button"
            className={styles["expanded-button"]}
            aria-label="全体を収める"
            onClick={() => {
              setAdjustment({})
            }}
          >
            全体
          </button>
          <button type="button" className={styles["expanded-button"]} onClick={collapse}>
            流れに戻る
          </button>
        </div>
      </div>
      <div
        ref={frameRef}
        className={styles["expanded-stage"]}
        data-testid="architecture-map-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div
          className={styles["expanded-content"]}
          data-scale={viewport.scale}
          style={{
            transform: `translate(${String(viewport.x)}px, ${String(viewport.y)}px) scale(${String(viewport.scale)})`,
          }}
        >
          <ArchitectureMapDiagram
            view={current.view}
            form="full"
            {...(selected === undefined ? {} : { selectedId: selected.box.id })}
            onSelect={onSelect}
          />
        </div>
        {selected !== undefined && askAt.kind === "at" && (
          <div
            className={styles["expanded-ask"]}
            style={{ left: `${String(askAt.x)}px`, top: `${String(askAt.y)}px` }}
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
          >
            <strong className={styles["expanded-ask-title"]}>{selected.box.title}</strong>
            {selected.box.summary !== undefined && (
              <span className={styles["expanded-ask-role"]}>{selected.box.summary}</span>
            )}
            <button
              type="button"
              className={styles["expanded-button"]}
              onClick={() => {
                attachBadge(selected.box)
              }}
            >
              この箱について聞く
            </button>
          </div>
        )}
      </div>
      <p className={styles["expanded-legend"]}>
        <span>{QUESTION[current.view.level]}</span>
        <span>矢印の数は import の本数</span>
      </p>
    </div>
  )
}

/**
 * 選んだ箱が今の図の箱なら、その矩形の右の縁の横。今の図の焦点（潜った箱）なら面の左上。
 * どちらでもなければ欄を出さない。
 */
function askPositionOf(
  view: MapView,
  rects: ReadonlyMap<string, MapBoxRect>,
  viewport: Viewport,
  selectedId?: string,
): AskPosition {
  const rect = selectedId === undefined ? undefined : rects.get(selectedId)
  if (rect !== undefined && view.boxes.some((box) => box.id === selectedId)) {
    return {
      kind: "at",
      x: viewport.x + (rect.x + rect.width) * viewport.scale + ASK_GAP,
      y: viewport.y + rect.y * viewport.scale,
    }
  }
  return view.focus !== undefined && view.focus.id === selectedId
    ? { kind: "at", x: ASK_GAP, y: ASK_GAP }
    : { kind: "none" }
}
