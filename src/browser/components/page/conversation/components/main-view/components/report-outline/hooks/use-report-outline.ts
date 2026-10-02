// `<ReportOutline>` のロジック。
// 見ているターンのレポートに描かれた見出し（`##` の `h4` と `###` の `h5`）を DOM から拾い、一覧の並びにする。
//
// 見出しの出どころを Markdown の文字ではなく描いた DOM にするのは、押したときに転がす先と、いま読んでいる見出しを決める位置が、どちらも DOM の要素そのものだから。
// 畳んだ `<details>` の中の見出しは転がしても見えないので拾わない。
//
// 列の幅と畳んだ状態は利用者が変えられ、`localStorage` に保つ。キーボードでは ↑↓ で行を移って Enter で飛ぶ。

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
import notationStyles from "../../../markdown/report-notation.module.css"
import {
  isOutlineCollapsed,
  loadOutlinePanel,
  saveOutlinePanel,
  type OutlinePanel,
} from "../domain/outline-panel.ts"

/** 見出し1つ。`section` は `##`、`sub` は `###`。 */
export type ReportOutlineEntry = {
  readonly level: "section" | "sub"
  readonly text: string
}

export type ReportOutlineProps = {
  /** 一覧の上に添える、どのやり取りの見出しか（「n / N」）。 */
  readonly positionLabel: string
}

/** 一覧の1行ぶん。 */
export type ReportOutlineRow = ReportOutlineEntry & {
  /** いま読んでいる見出しか。 */
  readonly isActive: boolean
  /** いま読んでいる見出しと同じ節（`section` の見出しとその下の `sub`）か。 */
  readonly inActiveSection: boolean
}

/** `<ReportOutline>` が画面に出す形。 */
export type ReportOutlineModel = {
  /** 一覧の列を出すか。見出しが2つ未満なら列ごと隠し、本文を左いっぱいまで使う。 */
  readonly visible: boolean
  readonly rows: readonly ReportOutlineRow[]
  readonly positionLabel: string
  /**
   * 列と本文を横に並べる器。目次と本文の境界のドラッグが比率の基準にし、
   * ドラッグ中はここへ直接 `--outline-rail-width` を書いて列の幅を変える。
   */
  readonly frameRef: RefObject<HTMLDivElement | null>
  /** 見出しを探す本文の器。 */
  readonly contentRef: RefObject<HTMLDivElement | null>
  /** 一覧の器。いま読んでいる見出しを決める基準の高さになる。 */
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

/** 見出しの上端がこの距離まで一覧の上端に近づいたら、その見出しを読んでいることにする（px）。 */
const ACTIVE_SLACK_PX = 24

/** 固定した見出しの上端が、固定したときの位置からこの距離までは動いていないとみなす（px）。 */
const PIN_TOLERANCE_PX = 1

const HEADING_SELECTOR = `.${notationStyles["detail-block"]} :is(h4, h5)`

const OUTLINE_WIDTH_VARIABLE = "--outline-rail-width"

/** 札の幅がこれ（rem）を下回るあいだは、利用者が選んでいなければ目次を畳んでおく。 */
const NARROW_CARD_REM = 48

export function useReportOutline(props: ReportOutlineProps): ReportOutlineModel {
  const frameRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const headingsRef = useRef<readonly HTMLElement[]>([])
  const pinnedRef = useRef<{ readonly index: number; readonly top: number } | undefined>(undefined)

  const [entries, setEntries] = useState<readonly ReportOutlineEntry[]>([])
  const [headingTotal, setHeadingTotal] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [panel, setPanel] = useState<OutlinePanel>(loadOutlinePanel)
  const [narrow, setNarrow] = useState(false)
  const collapsed = isOutlineCollapsed(panel.collapse, narrow)

  // 幅と畳みの唯一の更新点。離したとき・畳む/開くを押したときだけ通る。
  function commitPanel(update: (current: OutlinePanel) => OutlinePanel): void {
    const next = update(panel)
    setPanel(next)
    saveOutlinePanel(next)
  }

  // 本文の DOM（React の外）を購読する。
  // 本文は書き上げる演出や畳みの開閉で React を通らずに変わるので、描き直しの合図では拾えない。
  // 最初の読み取りは描く前に済ませる（`useLayoutEffect`）。
  useLayoutEffect(() => {
    const found = contentRef.current
    if (found === null) {
      return
    }
    const content: HTMLDivElement = found

    function updateActive(): void {
      const headings = headingsRef.current
      const pinned = pinnedRef.current
      if (pinned !== undefined) {
        const heading = headings[pinned.index]
        if (
          heading !== undefined &&
          Math.abs(heading.getBoundingClientRect().top - pinned.top) <= PIN_TOLERANCE_PX
        ) {
          setActiveIndex(pinned.index)
          return
        }
        pinnedRef.current = undefined
      }
      const base = (navRef.current ?? content).getBoundingClientRect().top
      const passed = headings.findLastIndex(
        (heading) => heading.getBoundingClientRect().top <= base + ACTIVE_SLACK_PX,
      )
      setActiveIndex(Math.max(passed, 0))
    }

    function readHeadings(): void {
      const unfolded = [...content.querySelectorAll<HTMLElement>(HEADING_SELECTOR)].filter(
        (heading) => heading.closest("details:not([open])") === null,
      )
      // 筆がまだ届いていない節は並べないが、列を出すかの数には入れる。
      const headings = unfolded.filter(
        (heading) => heading.closest(`[${REVEAL_PENDING_ATTRIBUTE}="pending"]`) === null,
      )
      setHeadingTotal(unfolded.length)
      headingsRef.current = headings
      const next = headings.map((heading): ReportOutlineEntry => ({
        level: heading.tagName === "H4" ? "section" : "sub",
        text: heading.textContent.trim(),
      }))
      setEntries((previous) => (isDeepEqual(previous, next) ? previous : next))
      updateActive()
    }

    readHeadings()
    const observer = new MutationObserver(readHeadings)
    observer.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["open", REVEAL_PENDING_ATTRIBUTE],
    })
    // 転がる祖先は画面の幅で入れ替わる（`useActiveTurnScroll`）ので、どれが転がっても拾えるよう `document` で捕まえる。
    document.addEventListener("scroll", updateActive, {
      capture: true,
      passive: true,
    })
    window.addEventListener("resize", updateActive)
    return () => {
      observer.disconnect()
      document.removeEventListener("scroll", updateActive, { capture: true })
      window.removeEventListener("resize", updateActive)
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
      const rootFontPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
      setNarrow(frame.getBoundingClientRect().width < NARROW_CARD_REM * rootFontPx)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => {
      observer.disconnect()
    }
  }, [])

  function focusRow(step: 1 | -1): void {
    const rows = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
    const current = rows.findIndex((row) => row === document.activeElement)
    const from = current === -1 ? (step === 1 ? -1 : rows.length) : current
    rows[Math.min(Math.max(from + step, 0), rows.length - 1)]?.focus()
  }

  return {
    visible: headingTotal >= 2,
    rows: outlineRows(entries, activeIndex),
    positionLabel: props.positionLabel,
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
    onSelect: (index) => {
      const heading = headingsRef.current[index]
      heading?.scrollIntoView({ block: "start" })
      if (heading !== undefined) {
        pinnedRef.current = { index, top: heading.getBoundingClientRect().top }
      }
      setActiveIndex(index)
    },
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
 * 節は `section` の見出しから次の `section` の見出しの手前まで（先頭の `sub` は、手前に `section` が無いので自分だけの節）。
 */
function outlineRows(
  entries: readonly ReportOutlineEntry[],
  activeIndex: number,
): readonly ReportOutlineRow[] {
  const sectionOf = (index: number): number =>
    entries.findLastIndex((entry, at) => at <= index && entry.level === "section")
  const activeSection = sectionOf(activeIndex)
  return entries.map((entry, index) => ({
    ...entry,
    isActive: index === activeIndex,
    inActiveSection:
      index === activeIndex || (activeSection !== -1 && sectionOf(index) === activeSection),
  }))
}
