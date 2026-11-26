// 中央の列に広げた地図。会話の流れの上に重なり、入力欄と声の帯は隠さない。
// 箱を押すと、子を持つ箱は潜り（その箱も選ぶ）、子を持たない箱は選ぶだけ。
// 拡大・縮小は「+」「−」とキー（面にフォーカスがあるとき）とピンチ、移動は地のドラッグと2本指のスクロール。

import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  useRef,
  useState,
} from "react"

import type {
  MapBoxIndexEntry,
  MapReady,
  MapView,
  MapViewBox,
} from "../../../shared/architecture-map/map-view.ts"
import { BreadcrumbTrail } from "../../components/ui/breadcrumb-trail/breadcrumb-trail.tsx"
import { Button } from "../../components/ui/button/button.tsx"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { useResizeObservedRef } from "../../hooks/use-observed-ref.ts"
import { rpc } from "../../stores/rpc.ts"
import { ArchitectureMapDiagram } from "./architecture-map-diagram.tsx"
import styles from "./architecture-map-expanded.module.css"
import { mapGeometryOf } from "./architecture-map-geometry.ts"
import { type SelectedBox, useArchitectureMapSelection } from "./architecture-map-selection.ts"
import {
  fitViewport,
  movedViewport,
  type Size,
  type Viewport,
  zoomedAround,
  zoomedViewport,
} from "./architecture-map-viewport.ts"
import { ancestorIdsOf } from "./map-box-lookup.ts"
import { useArchitectureMapOverview } from "./use-architecture-map.ts"
import { useBlockingWheel } from "./use-blocking-wheel.ts"
import { useStageGesture } from "./use-stage-gesture.ts"

const QUESTION = {
  1: "このリポジトリは何で、どんな部分からできていて、外と何をやり取りするか",
  2: "この機能は何を受け持ち、どこから受けてどこへ渡すか",
  3: "このディレクトリには何が置かれ、親の機能の中でどの役か",
} as const satisfies Record<MapView["level"], string>

const NO_FRAME: Size = { width: 0, height: 0 }

/** ピンチの wheel の deltaY を倍率の係数へ直す割り。小さいほど指に敏感に追従する。 */
const PINCH_DIVISOR = 100

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
  const pointers = useRef(new Map<number, Point>())
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
  const asking = selected !== undefined && showsBox(selected.box.id, current.view)
  const frameRef = useResizeObservedRef<HTMLDivElement>(
    (element) => {
      const next = { width: element.clientWidth, height: element.clientHeight }
      setFrame((previous) =>
        previous.width === next.width && previous.height === next.height ? previous : next,
      )
    },
    () => undefined,
  )

  const stageRef = useRef<HTMLDivElement | null>(null)
  const observeStage = (element: HTMLDivElement | null) => {
    stageRef.current = element
    return frameRef(element)
  }
  // イベントの合間に描画が挟まらなくても古い値を掴まないよう、更新は直前の値から重ねる
  const adjust = (change: (from: Viewport) => Viewport) => {
    setAdjustment((previous) => ({
      viewport: change(litSwitch ? viewport : (previous.viewport ?? viewport)),
    }))
  }
  const pinchAt = (factor: number, clientX: number, clientY: number) => {
    const anchor = anchorOf(stageRef.current, clientX, clientY)
    adjust((from) => zoomedAround(from, factor, anchor, content, frame))
  }
  useBlockingWheel(stageRef, (event) => {
    event.preventDefault()
    if (event.ctrlKey) {
      pinchAt(Math.exp(-event.deltaY / PINCH_DIVISOR), event.clientX, event.clientY)
    } else {
      adjust((from) => movedViewport(from, -event.deltaX, -event.deltaY))
    }
  })
  useStageGesture(stageRef, pinchAt)

  const goTo = (next: readonly Step[]) => {
    setTrail(next)
    setAdjustment({})
  }
  // 段は押した順の履歴ではなく、全体から箱までの親子の筋にする（外の箱を押すと筋ごと替わる）
  const dive = async (box: MapViewBox) => {
    try {
      const [response, index] = await Promise.all([
        rpc.architectureMap.view.call({ kind: "focus", box: box.id }),
        rpc.architectureMap.boxes.call(),
      ])
      if (response.kind !== "ready") {
        return
      }
      const step: Step = { title: box.title, view: response.view }
      if (index.kind !== "ready") {
        goTo([...trail, step])
        return
      }
      const ancestors = await Promise.all(
        ancestorIdsOf(index.boxes, box.id).map((id) => stepOf(id, index.boxes, trail)),
      )
      goTo([trail[0] ?? { title: "全体", view: props.overview.view }, ...ancestors.flat(), step])
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
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  // 1つなら今までどおりのドラッグ。2つあるあいだは、距離の比で拡大・縮小し、中点の動きで移動する
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const before = pointers.current.get(event.pointerId)
    if (before === undefined) {
      return
    }
    const after = { x: event.clientX, y: event.clientY }
    pointers.current.set(event.pointerId, after)
    const other = [...pointers.current].find(([id]) => id !== event.pointerId)?.[1]
    if (other === undefined) {
      adjust((from) => movedViewport(from, after.x - before.x, after.y - before.y))
      return
    }
    const beforeGap = distanceOf(before, other)
    const factor = beforeGap > 0 ? distanceOf(after, other) / beforeGap : 1
    const beforeMid = midpointOf(before, other)
    const afterMid = midpointOf(after, other)
    adjust((from) =>
      movedViewport(
        zoomedAround(
          from,
          factor,
          anchorOf(stageRef.current, beforeMid.x, beforeMid.y),
          content,
          frame,
        ),
        afterMid.x - beforeMid.x,
        afterMid.y - beforeMid.y,
      ),
    )
  }
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
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
        ref={observeStage}
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
      </div>
      <div className={styles["expanded-ask"]}>
        {asking ? (
          <>
            <div className={styles["expanded-ask-text"]}>
              <strong className={styles["expanded-ask-title"]}>{selected.box.title}</strong>
              {selected.box.summary !== undefined && (
                <span className={styles["expanded-ask-role"]}>{selected.box.summary}</span>
              )}
            </div>
            <ControlButton
              onClick={() => {
                attachBadge(selected.box)
              }}
            >
              この箱について聞く
            </ControlButton>
          </>
        ) : (
          <span className={styles["expanded-ask-role"]}>箱を選ぶと、その箱について聞ける</span>
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

type Point = { readonly x: number; readonly y: number }

function distanceOf(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function midpointOf(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** 画面上の点を、ステージの左上からの点にする。 */
function anchorOf(stage: HTMLElement | null, clientX: number, clientY: number): Point {
  const rect = stage?.getBoundingClientRect()
  return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }
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

/** 親の箱の段。今の段にあればそれを使い、無ければ引く。引けなければ空。 */
async function stepOf(
  id: string,
  boxes: readonly MapBoxIndexEntry[],
  trail: readonly Step[],
): Promise<readonly Step[]> {
  const known = trail.find((step) => step.view.focus?.id === id)
  if (known !== undefined) {
    return [known]
  }
  const response = await rpc.architectureMap.view.call({ kind: "focus", box: id })
  const title = boxes.find((box) => box.id === id)?.title ?? id
  return response.kind === "ready" ? [{ title, view: response.view }] : []
}
