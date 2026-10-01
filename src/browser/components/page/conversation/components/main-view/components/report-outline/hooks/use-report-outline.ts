// `<ReportOutline>` のロジック。
// 見ているターンのレポートに描かれた見出し（`##` の `h4` と `###` の `h5`）を DOM から拾い、縁の枝と一覧の並びにする。
//
// 見出しの出どころを Markdown の文字ではなく描いた DOM にするのは、押したときに転がす先と、いま読んでいる見出しを決める位置が、どちらも DOM の要素そのものだから。
// 畳んだ `<details>` の中の見出しは転がしても見えないので拾わない。
//
// 一覧は縁にポインタが乗ると開き、縁と一覧の外へ出て `CLOSE_DELAY_MS` 経つと閉じる。
// キーボードでは縁の口（≡）へ Tab で入ると開き、↑↓ で行を移って Enter で飛ぶ。Esc で閉じる。

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from "react"
import { isDeepEqual } from "remeda"

import { useDismissSignal } from "../../../../../../../../hooks/use-dismiss-signal.ts"
import notationStyles from "../../../markdown/report-notation.module.css"

/** 見出し1つ。`section` は `##`、`sub` は `###`。 */
export type ReportOutlineEntry = {
  readonly level: "section" | "sub"
  readonly text: string
}

export type ReportOutlineProps = {
  /** 一覧の上に添える、どのやり取りの見出しか（「n / N」）。 */
  readonly positionLabel: string
}

/** 縁の枝と一覧の1行ぶん。 */
export type ReportOutlineRow = ReportOutlineEntry & {
  /** いま読んでいる見出しか。 */
  readonly isActive: boolean
  /** いま読んでいる見出しと同じ節（`section` の見出しとその下の `sub`）か。 */
  readonly inActiveSection: boolean
}

/** `<ReportOutline>` が画面に出す形。 */
export type ReportOutlineModel = {
  /** 縁を出すか。見出しが2つ未満なら縁ごと隠し、本文を左いっぱいまで使う。 */
  readonly visible: boolean
  readonly rows: readonly ReportOutlineRow[]
  readonly positionLabel: string
  readonly open: boolean
  readonly listId: string
  /** 見出しを探す本文の器。 */
  readonly contentRef: RefObject<HTMLDivElement | null>
  /** 縁の枝と一覧をまとめた器。いま読んでいる見出しを決める基準の高さと、一覧の「外側」の基準になる。 */
  readonly navRef: RefObject<HTMLElement | null>
  readonly listRef: RefObject<HTMLDivElement | null>
  /** 縁の一番上の「目次」の口。行を選んで一覧が消えたあと、フォーカスをここへ戻す。 */
  readonly triggerRef: RefObject<HTMLButtonElement | null>
  readonly onRailPointerEnter: () => void
  readonly onRailPointerLeave: () => void
  readonly onTriggerFocus: (event: FocusEvent<HTMLButtonElement>) => void
  readonly onNavBlur: (event: FocusEvent<HTMLElement>) => void
  readonly onNavKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  readonly onSelect: (index: number) => void
}

/** 縁と一覧の外へポインタが出てから閉じるまで（ミリ秒）。斜めに一覧へ向かう途中で縁を外れても閉じないための猶予。 */
const CLOSE_DELAY_MS = 200

/** 見出しの上端がこの距離まで縁の上端に近づいたら、その見出しを読んでいることにする（px）。 */
const ACTIVE_SLACK_PX = 24

/** 固定した見出しの上端が、固定したときの位置からこの距離までは動いていないとみなす（px）。 */
const PIN_TOLERANCE_PX = 1

const HEADING_SELECTOR = `.${notationStyles["detail-block"]} :is(h4, h5)`

export function useReportOutline(props: ReportOutlineProps): ReportOutlineModel {
  const contentRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const headingsRef = useRef<readonly HTMLElement[]>([])
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pinnedRef = useRef<{ readonly index: number; readonly top: number } | undefined>(undefined)
  const listId = useId()

  const [entries, setEntries] = useState<readonly ReportOutlineEntry[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [open, setOpen] = useState(false)

  // 本文の DOM（React の外）を購読する。
  // 本文は書き上げる演出や畳みの開閉で React を通らずに変わるので、描き直しの合図では拾えない。
  useEffect(() => {
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
      const headings = [...content.querySelectorAll<HTMLElement>(HEADING_SELECTOR)].filter(
        (heading) => heading.closest("details:not([open])") === null,
      )
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
      attributeFilter: ["open"],
    })
    // 転がる祖先は画面の幅で入れ替わる（`useActiveTurnScroll`）ので、どれが転がっても拾えるよう `document` で捕まえる。
    document.addEventListener("scroll", updateActive, { capture: true, passive: true })
    window.addEventListener("resize", updateActive)
    return () => {
      observer.disconnect()
      document.removeEventListener("scroll", updateActive, { capture: true })
      window.removeEventListener("resize", updateActive)
    }
  }, [])

  useEffect(
    () => () => {
      clearTimeout(closeTimerRef.current)
    },
    [],
  )

  function close(): void {
    clearTimeout(closeTimerRef.current)
    setOpen(false)
  }

  useDismissSignal({ open, rootRef: navRef, onDismiss: close })

  function focusRow(step: 1 | -1): void {
    const rows = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
    const current = rows.findIndex((row) => row === document.activeElement)
    const from = current === -1 ? (step === 1 ? -1 : rows.length) : current
    rows[Math.min(Math.max(from + step, 0), rows.length - 1)]?.focus()
  }

  return {
    visible: entries.length >= 2,
    rows: outlineRows(entries, activeIndex),
    positionLabel: props.positionLabel,
    open,
    listId,
    contentRef,
    navRef,
    listRef,
    triggerRef,
    onRailPointerEnter: () => {
      clearTimeout(closeTimerRef.current)
      setOpen(true)
    },
    onRailPointerLeave: () => {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = setTimeout(() => {
        setOpen(false)
      }, CLOSE_DELAY_MS)
    },
    onTriggerFocus: (event) => {
      // 一覧の行から口へ戻ってきたときは開き直さない（行を選んで閉じた直後にまた開いてしまう）。
      if (!isInside(navRef.current, event.relatedTarget)) {
        setOpen(true)
      }
    },
    onNavBlur: (event) => {
      if (!isInside(navRef.current, event.relatedTarget)) {
        close()
      }
    },
    onNavKeyDown: (event) => {
      if (!open) {
        return
      }
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
      // 押した行は一覧ごと消えるので、フォーカスが `body` へ落ちないよう口へ戻す（口から開き直さないのは `onTriggerFocus` の側）。
      triggerRef.current?.focus()
      close()
    },
  }
}

function isInside(root: HTMLElement | null, target: EventTarget | null): boolean {
  return root !== null && target instanceof Node && root.contains(target)
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
