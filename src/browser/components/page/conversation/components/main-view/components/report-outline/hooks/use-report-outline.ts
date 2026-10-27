// `<ReportOutline>` のロジック。
// 上の段に窓の中のやり取りを並べ、見ているやり取りの行の下に、そのレポートに描かれた見出し（`##` の `h4` と `###` の `h5`）を DOM から拾って並べる。
//
// 見出しの出どころを Markdown の文字ではなく描いた DOM にするのは、押したときに転がす先と、いま読んでいる見出しを決める位置が、どちらも DOM の要素そのものだから。
// 畳んだ `<details>` の中の見出しは転がしても見えないので拾わない。
//
// 列の幅と畳んだ状態は利用者が変えられ、`localStorage` に保つ。
// キーボードでは ↑↓ でやり取りの行・レポートの行・見出しの行を区別なく移り、Enter は行の `<button>` が受ける。

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from "react"
import { isDeepEqual } from "remeda"

import { REVEAL_PENDING_ATTRIBUTE } from "../../../../../../../../domain/reveal/paint.ts"
import {
  useReadingSection,
  type HeadingStep,
} from "../../../../../../../../stores/reading-section.ts"
import type { TurnResult } from "../../../../../domain/turn-result.ts"
import type { HeadNotice, HeadNoticeAction } from "../../../domain/head-notice.ts"
import { outlineReportHeadOf } from "../../../domain/outline-report-head.ts"
import type { OutlineReport } from "../../../domain/outline-report-row.ts"
import { readableOutlineItems, type OutlineItem } from "../../../domain/report-heading.ts"
import { subscribeScrollFrame } from "../../../hooks/scroll-frame.ts"
import {
  activeLineOf,
  bandRootMargin,
  isNarrowFrame,
  scrollRowIntoView,
  topOf,
} from "../domain/outline-geometry.ts"
import {
  isOutlineCollapsed,
  loadOutlinePanel,
  saveOutlinePanel,
  type OutlinePanel,
} from "../domain/outline-panel.ts"
import { isScrolledToEnd, readHeadingIndexOf, readingSectionOf } from "../domain/reading-section.ts"

/** 見出し1つ。`section` は `##`、`sub` は `###`。 */
export type ReportOutlineEntry = {
  readonly level: "section" | "sub"
  readonly text: string
}

/** 上の段に並べるやり取り1件。 */
type ReportOutlineTurn = {
  readonly id: number
  readonly title: string
  readonly result: TurnResult
  readonly asideCount: number
  /** 本文に見出しのある節の欄の ID。 */
  readonly headedSectionIds: readonly number[]
  readonly report: OutlineReport
}

export type ReportOutlineProps = {
  /** 窓の中のやり取り。古い順（末尾が最新）。 */
  readonly turns: readonly ReportOutlineTurn[]
  readonly activeTurnId: number
  readonly onSelectTurn: (turnId: number) => void
  /** 列の頭に出す知らせの行。 */
  readonly notice: HeadNotice
  readonly onNotice: (action: HeadNoticeAction) => void
}

/** 上の段の1行ぶん。 */
export type ReportOutlineTurnRow = ReportOutlineTurn & {
  /** 見ているやり取りか。この行の下にだけ見出しの行を出す。 */
  readonly isActive: boolean
}

/** 一覧の1行ぶん。 */
export type ReportOutlineRow = ReportOutlineEntry & {
  /** いま読んでいる見出しか。 */
  readonly isActive: boolean
  /** いま読んでいる見出しと同じ節（`section` の見出しとその下の `sub`）か。 */
  readonly inActiveSection: boolean
}

/** 見ているやり取りの行の下、見出しの行の上に出すレポートの行。 */
export type ReportOutlineReportRow =
  | { readonly kind: "none" }
  | {
      readonly kind: "shown"
      readonly label: "final" | "interim"
      readonly title: string
      /** 最初の見出しより上を読んでいるとき、いま読んでいる印が付く。 */
      readonly isActive: boolean
    }

/** `<ReportOutline>` が画面に出す形。 */
export type ReportOutlineModel = {
  /** 一覧の列を出すか。やり取りが1件で見出しも2つ未満なら列ごと隠し、本文を左いっぱいまで使う。 */
  readonly visible: boolean
  readonly turnRows: readonly ReportOutlineTurnRow[]
  readonly onSelectTurn: (turnId: number) => void
  readonly notice: HeadNotice
  readonly onNotice: () => void
  readonly reportRow: ReportOutlineReportRow
  readonly onSelectReport: () => void
  /** 見ているやり取りの見出しの行。 */
  readonly rows: readonly ReportOutlineRow[]
  /**
   * 列と本文を横に並べる器。やり取りと本文の境界のドラッグが比率の基準にし、
   * ドラッグ中はここへ直接 `--outline-rail-width` を書いて列の幅を変える。
   */
  readonly frameRef: RefObject<HTMLDivElement | null>
  /** 見出しを探す本文の器。 */
  readonly contentRef: RefObject<HTMLDivElement | null>
  /** 一覧の器。いま読んでいる見出しを決める基準の高さになり、行が溢れたらこの中で転がす。 */
  readonly navRef: RefObject<HTMLElement | null>
  readonly listRef: RefObject<HTMLDivElement | null>
  readonly onNavKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  readonly onSelect: (index: number) => void
  /** 畳んでいるか。畳んでいる間は一覧を隠し、開き直すボタンだけ残す。 */
  readonly collapsed: boolean
  readonly onToggleCollapse: () => void
  /** ユーザーが決めた幅を `.outline-frame` の `style` に渡す。まだ決めていなければ空（CSS の既定に任せる）。 */
  readonly widthStyle: CSSProperties
  readonly onWidthChange: (px: number) => void
  readonly onWidthCommit: (px: number) => void
}

/** 固定した見出しの上端が、固定したときの位置からこの距離までは動いていないとみなす（px）。 */
const PIN_TOLERANCE_PX = 1

const OUTLINE_WIDTH_VARIABLE = "--outline-rail-width"

/** やり取りの行の `<button>` が持つ属性。値はやり取りの id。 */
export const TURN_ROW_ATTRIBUTE = "data-outline-turn"

export function useReportOutline(props: ReportOutlineProps): ReportOutlineModel {
  const frameRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<readonly OutlineItem[]>([])
  const headedIdsRef = useRef<readonly number[]>([])
  const readHeadingsRef = useRef<() => void>(() => undefined)
  const pinnedRef = useRef<{ readonly index: number; readonly top: number } | undefined>(undefined)

  const [entries, setEntries] = useState<readonly ReportOutlineEntry[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [reached, setReached] = useState(false)
  const [panel, setPanel] = useState<OutlinePanel>(loadOutlinePanel)
  const [narrow, setNarrow] = useState(false)
  const collapsed = isOutlineCollapsed(panel.collapse, narrow)

  // 幅と畳みの唯一の更新点。離したとき・畳む/開くを押したときだけ通る。
  function commitPanel(update: (current: OutlinePanel) => OutlinePanel): void {
    const next = update(panel)
    setPanel(next)
    saveOutlinePanel(next)
  }

  // 見ているやり取りの節の欄の ID は、描き直しで配列の identity が変わるので、字の鍵で変わったことだけ拾う。
  // 購読の effect より先に宣言し、最初の読み取りが ID を持った状態で走るようにする。
  const headedKey = (
    props.turns.find((turn) => turn.id === props.activeTurnId)?.headedSectionIds ?? []
  ).join(",")
  useLayoutEffect(() => {
    headedIdsRef.current = headedKey === "" ? [] : headedKey.split(",").map(Number)
    readHeadingsRef.current()
  }, [headedKey])

  // 本文の DOM（React の外）を購読する。
  // 本文は書き上げる演出や畳みの開閉で React を通らずに変わるので、描き直しの合図では拾えない。
  // 最初の読み取りは描く前に済ませる（`useLayoutEffect`）。
  useLayoutEffect(() => {
    const found = contentRef.current
    if (found === null) {
      return
    }
    const content: HTMLDivElement = found

    const scrollerOfContent = content.closest('[data-region="main"]')

    let passedHeadings = new Set<Element>()
    let headingObserver: IntersectionObserver | undefined = undefined
    let observedHeadings: readonly HTMLElement[] = []
    let observedBand = ""

    function updateActive(): void {
      const items = itemsRef.current
      const pinned = pinnedRef.current
      if (pinned !== undefined) {
        const heading = items[pinned.index]?.element
        if (heading !== undefined && Math.abs(topOf(heading) - pinned.top) <= PIN_TOLERANCE_PX) {
          setActiveIndex(pinned.index)
          setReached(true)
          return
        }
        pinnedRef.current = undefined
      }
      const passedAtTop = items.findLastIndex((item) => passedHeadings.has(item.element))
      const passed = readHeadingIndexOf(
        passedAtTop,
        items.map((item) => item.level),
        isScrolledToEnd(scrollerOfContent),
      )
      setActiveIndex(Math.max(passed, 0))
      setReached(passed >= 0)
    }

    function observeHeadings(checkLine: boolean): void {
      const headings = itemsRef.current.map((item) => item.element)
      const sameHeadings =
        headings.length === observedHeadings.length &&
        headings.every((heading, index) => heading === observedHeadings[index])
      if (sameHeadings && !checkLine) {
        return
      }
      const line = activeLineOf(content, navRef.current, scrollerOfContent)
      const rootMargin = bandRootMargin(line, scrollerOfContent)
      const bandKey = `${String(Math.round(line))}:${rootMargin}`
      if (sameHeadings && bandKey === observedBand) {
        return
      }
      headingObserver?.disconnect()
      observedHeadings = headings
      observedBand = bandKey
      passedHeadings = new Set(headings.filter((heading) => passedHeadings.has(heading)))
      if (headings.length === 0) {
        headingObserver = undefined
        return
      }
      headingObserver = new IntersectionObserver(
        (observed) => {
          for (const entry of observed) {
            if (entry.boundingClientRect.top <= line) {
              passedHeadings.add(entry.target)
            } else {
              passedHeadings.delete(entry.target)
            }
          }
          updateActive()
        },
        { root: scrollerOfContent, rootMargin },
      )
      for (const heading of headings) {
        headingObserver.observe(heading)
      }
    }

    function readHeadings(): void {
      // 筆がまだ届いていない節は並べない。
      const items = readableOutlineItems(content, headedIdsRef.current)
      itemsRef.current = items
      const next = items.map((item): ReportOutlineEntry => ({
        level: item.level,
        text: item.text,
      }))
      setEntries((previous) => (isDeepEqual(previous, next) ? previous : next))
      observeHeadings(false)
      updateActive()
    }

    function onFrame(): void {
      observeHeadings(true)
      updateActive()
    }

    readHeadingsRef.current = readHeadings
    readHeadings()
    // 見出しの増減と、畳みの開閉・筆の到着の印だけを見る。字が伸びるだけの変化では読み直さない。
    const observer = new MutationObserver(readHeadings)
    observer.observe(content, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open", REVEAL_PENDING_ATTRIBUTE],
    })
    const unsubscribeScroll = subscribeScrollFrame(onFrame)
    // 窓・上下の境界・キャラ欄の畳みなど、どの経路でも器の寸法が変われば読む線と帯を引き直す。
    const resizeObserver = new ResizeObserver(onFrame)
    resizeObserver.observe(scrollerOfContent ?? content)
    if (navRef.current !== null) {
      resizeObserver.observe(navRef.current)
    }
    return () => {
      observer.disconnect()
      resizeObserver.disconnect()
      headingObserver?.disconnect()
      unsubscribeScroll()
    }
  }, [])

  // 札の幅（DOM の寸法）を購読する。
  // 最初の1回は描く前に測る（`useLayoutEffect`）。
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (frame === null) {
      return
    }
    const measure = (): void => {
      setNarrow(isNarrowFrame(frame))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => {
      observer.disconnect()
    }
  }, [])

  const visible = props.turns.length >= 1

  function selectHeading(index: number): void {
    const heading = itemsRef.current[index]?.element
    heading?.scrollIntoView({ block: "start" })
    if (heading !== undefined) {
      pinnedRef.current = { index, top: topOf(heading) }
    }
    setActiveIndex(index)
    setReached(true)
  }

  const activeReport =
    props.turns.find((turn) => turn.id === props.activeTurnId)?.report ??
    ({ kind: "none" } as const)

  function selectReport(): void {
    const content = contentRef.current
    if (content === null || activeReport.kind === "none") {
      return
    }
    outlineReportHeadOf(content, activeReport.label === "final").scrollIntoView({
      block: "start",
    })
    pinnedRef.current = undefined
    setActiveIndex(0)
    setReached(false)
  }

  const section = readingSectionOf(entries, activeIndex, reached)
  const publish = useReadingSection((state) => state.publish)
  const setMover = useReadingSection((state) => state.setMover)
  useLayoutEffect(() => {
    publish(section, collapsed)
  }, [publish, section, collapsed])
  useLayoutEffect(() => {
    return () => {
      publish({ kind: "none" }, false)
      setMover({ kind: "none" })
    }
  }, [publish, setMover])
  useLayoutEffect(() => {
    setMover({
      kind: "ready",
      move: (step: HeadingStep) => {
        // まだ1つも通り過ぎていないときの「後ろ」は最初の見出し。
        const from = reached ? activeIndex : -1
        const next = from + (step === "older" ? -1 : 1)
        if (next >= 0 && next < itemsRef.current.length) {
          selectHeading(next)
        }
      },
    })
  })

  // 見ているやり取りの行を、列の中の転がり（DOM）で見える位置へ寄せる。
  // `scrollIntoView` は転がる祖先の本文まで動かすので、列の `scrollTop` だけを動かす。
  const activeTurnId = props.activeTurnId
  useLayoutEffect(() => {
    const nav = navRef.current
    if (nav === null || !visible || collapsed) {
      return
    }
    const row = nav.querySelector<HTMLElement>(`[${TURN_ROW_ATTRIBUTE}="${String(activeTurnId)}"]`)
    if (row === null) {
      return
    }
    scrollRowIntoView(nav, row)
  }, [activeTurnId, collapsed, visible])

  function focusRow(step: 1 | -1): void {
    const rows = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
    const current = rows.findIndex((row) => row === document.activeElement)
    const from = current === -1 ? (step === 1 ? -1 : rows.length) : current
    rows[Math.min(Math.max(from + step, 0), rows.length - 1)]?.focus()
  }

  return {
    visible,
    turnRows: props.turns.map((turn) => ({
      ...turn,
      isActive: turn.id === props.activeTurnId,
    })),
    onSelectTurn: props.onSelectTurn,
    notice: props.notice,
    onNotice: () => {
      if (props.notice.kind === "notice") {
        props.onNotice(props.notice.action)
      }
    },
    reportRow:
      activeReport.kind === "none"
        ? activeReport
        : {
            kind: "shown",
            label: activeReport.label,
            title: activeReport.title,
            isActive: !reached,
          },
    onSelectReport: selectReport,
    rows: outlineRows(entries, activeIndex, reached),
    frameRef,
    contentRef,
    navRef,
    listRef,
    onNavKeyDown: (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        focusRow(event.key === "ArrowDown" ? 1 : -1)
      }
    },
    onSelect: selectHeading,
    collapsed,
    onToggleCollapse: () => {
      commitPanel((current) => ({ ...current, collapse: collapsed ? "open" : "collapsed" }))
    },
    widthStyle:
      panel.widthPx === undefined ? {} : { [OUTLINE_WIDTH_VARIABLE]: `${String(panel.widthPx)}px` },
    onWidthChange: (px) => {
      frameRef.current?.style.setProperty(OUTLINE_WIDTH_VARIABLE, `${String(px)}px`)
    },
    onWidthCommit: (px) => {
      commitPanel((current) => ({ ...current, widthPx: px }))
    },
  }
}

/**
 * 見出しの並びに、いま読んでいる見出しとその節の印を付ける。
 * 見出しを1つも通り過ぎていない間（`reached` が偽）は、いま読んでいる印をレポートの行が持つので、見出しの行にも節の明るい字にも付けない。
 * 節は `section` の見出しから次の `section` の見出しの手前まで（先頭の `sub` は、手前に `section` が無いので自分だけの節）。
 */
function outlineRows(
  entries: readonly ReportOutlineEntry[],
  activeIndex: number,
  reached: boolean,
): readonly ReportOutlineRow[] {
  const sectionOf = (index: number): number =>
    entries.findLastIndex((entry, at) => at <= index && entry.level === "section")
  const activeSection = sectionOf(activeIndex)
  return entries.map((entry, index) => ({
    ...entry,
    isActive: reached && index === activeIndex,
    inActiveSection:
      reached &&
      (index === activeIndex || (activeSection !== -1 && sectionOf(index) === activeSection)),
  }))
}
