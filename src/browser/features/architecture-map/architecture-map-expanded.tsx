// 中央の列に広げた地図。会話の流れの上に重なり、入力欄と声の帯は隠さない。
// 箱を押すと、子を持つ箱は潜り（その箱も選ぶ）、子を持たない箱は選ぶだけ。
// 拡大・縮小は「+」「−」とキー（面にフォーカスがあるとき）、移動は地のドラッグ。ホイールでは動かさない。

import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  useRef,
  useState,
} from "react"

import type { MapReady, MapView, MapViewBox } from "../../../shared/architecture-map/map-view.ts"
import { BreadcrumbTrail } from "../../components/ui/breadcrumb-trail/breadcrumb-trail.tsx"
import { Button } from "../../components/ui/button/button.tsx"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { useResizeObservedRef } from "../../hooks/use-observed-ref.ts"
import { rpc } from "../../stores/rpc.ts"
import { ArchitectureMapDiagram } from "./architecture-map-diagram.tsx"
import styles from "./architecture-map-expanded.module.css"
import { type MapBoxRect, mapGeometryOf } from "./architecture-map-geometry.ts"
import { type SelectedBox, useArchitectureMapSelection } from "./architecture-map-selection.ts"
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

function Expanded(props: { readonly overview: MapReady }): ReactElement {
  const collapse = useArchitectureMapSelection((state) => state.collapse)
  const selected = useArchitectureMapSelection((state) => state.selected)
  const selectBox = useArchitectureMapSelection((state) => state.selectBox)
  const attachBadge = useArchitectureMapSelection((state) => state.attachBadge)
  const lit = useArchitectureMapSelection((state) => state.lit)
  const litView = useArchitectureMapSelection((state) => state.litView)
  const [trail, setTrail] = useState<readonly Step[]>(() =>
    trailForPointed(props.overview.view, selected),
  )
  const [seenSelected, setSeenSelected] = useState(selected)
  const [frame, setFrame] = useState<Size>(NO_FRAME)
  const [adjustment, setAdjustment] = useState<Adjustment>({})
  const drag = useRef({ active: false, x: 0, y: 0 })
  // 開いたときだけ面にフォーカスを置く（キー `+`・`-`・⎋ は面の中でだけ効かせる）
  const dialogRef = useRef<HTMLDivElement>(null)
  useMountEffect(() => {
    dialogRef.current?.focus()
  })

  // 会話で選ばれた箱が今の図に無いときは、段を「全体 → 親の図」に替える（描画の途中で state を直すのは、選びが替わった回だけ）
  if (selected !== seenSelected) {
    setSeenSelected(selected)
    if (selected?.by === "conversation" && !showsBox(selected.box.id, trail.at(-1)?.view)) {
      setTrail(trailForPointed(props.overview.view, selected))
      setAdjustment({})
    }
  }

  const trailTop = trail.at(-1) ?? { title: "全体", view: props.overview.view }
  // 触れているバッジの箱が今の図の箱に無いときは、その箱がある図に一時的に替える（段は動かさない）
  // 焦点（潜った箱）は図に描かれないので、焦点の箱も替える側に数える
  const litSwitch =
    lit !== undefined && litView !== undefined && !trailTop.view.boxes.some((box) => box.id === lit)
  const current = litSwitch ? { title: trailTop.title, view: litView } : trailTop
  const content = mapGeometryOf(current.view, "full")
  const viewport = litSwitch
    ? fitViewport(content, frame)
    : (adjustment.viewport ?? fitViewport(content, frame))
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
      ref={dialogRef}
      onKeyDown={onKeyDown}
    >
      <div className={styles["expanded-head"]}>
        <BreadcrumbTrail
          variant="default"
          label="地図の段"
          crumbs={trail.map((step, index) => ({
            key: `${String(index)}:${step.title}`,
            title: step.title,
            onSelect: () => {
              goTo(trail.slice(0, index + 1))
              // 押した段が「今いる段」の表示に替わって押した要素が消えるので、キー（⎋・+・-）の届き先を面へ戻す
              dialogRef.current?.focus()
            },
          }))}
        />
        <div className={styles["expanded-controls"]}>
          <ControlButton
            ariaLabel="縮小"
            onClick={() => {
              zoom("out")
            }}
          >
            −
          </ControlButton>
          <ControlButton
            ariaLabel="拡大"
            onClick={() => {
              zoom("in")
            }}
          >
            +
          </ControlButton>
          <ControlButton
            ariaLabel="全体を収める"
            onClick={() => {
              setAdjustment({})
            }}
          >
            全体
          </ControlButton>
          <ControlButton onClick={collapse}>流れに戻る</ControlButton>
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
            {...(lit === undefined ? {} : { litId: lit })}
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
            <ControlButton
              onClick={() => {
                attachBadge(selected.box)
              }}
            >
              この箱について聞く
            </ControlButton>
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

function ControlButton(props: {
  readonly ariaLabel?: string
  readonly onClick: () => void
  readonly children: ReactNode
}): ReactElement {
  return (
    <Button
      variant="outline"
      size="label"
      pressed="none"
      disabled={false}
      disclosure={{ kind: "none" }}
      {...(props.ariaLabel === undefined ? {} : { ariaLabel: props.ariaLabel })}
      className=""
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  )
}

/** 箱が図の箱か、図の焦点（潜った箱）か。 */
function showsBox(id: string, view?: MapView): boolean {
  return view !== undefined && (view.boxes.some((box) => box.id === id) || view.focus?.id === id)
}

/**
 * 会話で選ばれた箱が全体の図に無いとき、その箱がある図（親の図）へ潜った段にする。
 * それ以外は「全体」だけ。
 */
function trailForPointed(overview: MapView, selected?: SelectedBox): readonly Step[] {
  const whole: Step = { title: "全体", view: overview }
  if (selected?.by !== "conversation" || showsBox(selected.box.id, overview)) {
    return [whole]
  }
  const { focus } = selected.view
  return focus === undefined ? [whole] : [whole, { title: focus.title, view: selected.view }]
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
