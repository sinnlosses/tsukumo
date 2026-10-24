// 出している中身が変わったら（自分で前後へ移った・新しいターンに連れていかれた・地図とレポートを入れ替えた）、その先頭から読ませるフック。
// 過去のやり取りへ移って戻ったときは、そのやり取りで最後に読んでいた見出しの位置から見せる（ページを開いているあいだだけ覚える）。
//
// `scrollTop` ではなく `scrollIntoView` を使う。
// 実際に転がる祖先は、広い画面も狭い画面（≤760px）も `main[data-region="main"]` で、ページ自身は転がらない。
// `scrollIntoView` は「どの祖先が転がっているか」を呼ぶ側が知らなくても、転がる祖先を全部たどって動かす。
// 読み位置を戻すときは差を測って動かすので、転がる祖先を自分で探す（`scrollerOf`）。

import { useEffect, useRef, type RefObject } from "react"

import {
  useReadingPosition,
  type ReadingPosition,
} from "../../../../../../stores/reading-position.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { readingPositionOf, scrollDeltaToRestore } from "../domain/reading-position.ts"
import { readableHeadings } from "../domain/report-heading.ts"
import { scrollerOf, subscribeScrollFrame } from "./scroll-frame.ts"

/** いま出している中身。`none` は先頭へ戻す相手が無い（始め方の一覧を出している）とき。 */
export type ShownTarget =
  | { readonly kind: "none" }
  | { readonly kind: "work" | "report"; readonly turnId: number }

/** 出している中身が変わるたびに、`scrollerRef` の入れ物を先頭（覚えた読み位置があればそこ）へ戻す。`none` のときは戻さない。 */
export function useActiveTurnScroll(
  scrollerRef: RefObject<HTMLElement | null>,
  shownTarget: ShownTarget,
): void {
  const generation = useSession((session) => session.generation)
  const shownRef = useRef<ShownTarget>({ kind: "none" })
  const currentRef = useRef<ShownPosition | undefined>(undefined)
  const geometryRef = useRef<ScrollGeometry | undefined>(undefined)
  const shownKind = shownTarget.kind
  const shownTurnId = shownTarget.kind === "none" ? undefined : shownTarget.turnId

  // やり取りの ID はセッションごとに振るので、状態が丸ごと入れ替わったら（世代が変わったら）覚えを捨てる。
  // 画面を隠して戻したときにもこの effect はやり直されるが、世代が同じなら捨てない。
  useEffect(() => {
    const store = useReadingPosition.getState()
    if (store.generation !== generation) {
      store.forgetUnlessGeneration(generation)
      currentRef.current = undefined
    }
  }, [generation])

  useEffect(() => {
    function resolve(): void {
      const root = scrollerRef.current
      geometryRef.current = root === null ? undefined : resolveGeometry(root)
    }
    function onScroll(): void {
      const root = scrollerRef.current
      const current = shownRef.current
      if (root === null || current.kind !== "report") {
        return
      }
      currentRef.current = { turnId: current.turnId, position: measure(root, geometryRef) }
    }
    resolve()
    window.addEventListener("resize", resolve)
    const unsubscribe = subscribeScrollFrame(onScroll)
    return () => {
      window.removeEventListener("resize", resolve)
      unsubscribe()
    }
  }, [scrollerRef])

  useEffect(() => {
    const shown = targetOf(shownKind, shownTurnId)
    const previous = shownRef.current
    shownRef.current = shown

    const store = useReadingPosition.getState()
    if (previous.kind === "report") {
      const left = currentRef.current
      if (left?.turnId === previous.turnId && left.position !== undefined) {
        store.remember(previous.turnId, left.position)
      } else {
        store.forget(previous.turnId)
      }
    }
    currentRef.current = undefined

    const scroller = scrollerRef.current
    if (scroller === null || shown.kind === "none") {
      return
    }
    const closedJustNow = previous.kind === "work" && previous.turnId === shown.turnId
    const remembered = store.positions[shown.turnId]
    if (shown.kind === "report" && !closedJustNow && remembered !== undefined) {
      if (restore(scroller, remembered, geometryRef)) {
        currentRef.current = { turnId: shown.turnId, position: remembered }
        return
      }
    }
    scroller.scrollIntoView({ block: "start" })
  }, [scrollerRef, shownKind, shownTurnId])
}

function targetOf(kind: ShownTarget["kind"], turnId: number | undefined): ShownTarget {
  return kind === "none" || turnId === undefined ? { kind: "none" } : { kind, turnId }
}

type ShownPosition = {
  readonly turnId: number
  readonly position: ReadingPosition | undefined
}

function measure(
  root: HTMLElement,
  geometryRef: RefObject<ScrollGeometry | undefined>,
): ReadingPosition | undefined {
  const { baseline } = baselineOf(root, geometryRef)
  return readingPositionOf(headingTopsOf(root), baseline)
}

function restore(
  root: HTMLElement,
  position: ReadingPosition,
  geometryRef: RefObject<ScrollGeometry | undefined>,
): boolean {
  const { scroller, baseline } = baselineOf(root, geometryRef)
  const delta = scrollDeltaToRestore(headingTopsOf(root), position, baseline)
  if (delta === undefined) {
    return false
  }
  scroller.scrollBy({ top: delta, behavior: "instant" })
  return true
}

function headingTopsOf(root: HTMLElement): readonly number[] {
  return readableHeadings(root).map((heading) => heading.getBoundingClientRect().top)
}

/** 購読を張るときに解く、転がる祖先と札の頭の高さ。 */
type ScrollGeometry = { readonly scroller: Element; readonly headHeight: number }

function resolveGeometry(root: HTMLElement): ScrollGeometry {
  const headHeight = Number.parseFloat(
    getComputedStyle(root).getPropertyValue("--turn-card-head-height"),
  )
  return { scroller: scrollerOf(root), headHeight: Number.isFinite(headHeight) ? headHeight : 0 }
}

/** 転がる祖先と、読む面の基準の線（祖先の上端＋札の頭の高さ）。解いていなければここで解く。 */
function baselineOf(
  root: HTMLElement,
  geometryRef: RefObject<ScrollGeometry | undefined>,
): { readonly scroller: Element; readonly baseline: number } {
  const { scroller, headHeight } = geometryRef.current ?? resolveGeometry(root)
  const top = scroller === document.documentElement ? 0 : scroller.getBoundingClientRect().top
  return { scroller, baseline: top + headHeight }
}
