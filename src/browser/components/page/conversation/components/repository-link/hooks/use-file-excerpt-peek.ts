// 押せるパスに重ねるかフォーカスして待ったときに出す、行の抜き書きの浮きの開閉。
// 待ち終えてから抜き書きを読みに行き、届いた時点でまだ待っていたら出す。
// 外へ出る・フォーカスが外れる・Esc・外での押下・スクロールで閉じる。

import { useEffect, useRef, useState, type RefObject } from "react"

import type {
  FileExcerpt,
  FileExcerptRequest,
} from "../../../../../../../shared/repository/file-excerpt.ts"
import { useDismissSignal } from "../../../../../../hooks/use-dismiss-signal.ts"
import type { LineRange, PointedLines } from "../domain/pointed-lines.ts"

/** 重ねて（フォーカスして）から浮きを出すまでの待ち。 */
export const FILE_EXCERPT_PEEK_DELAY_MS = 500

/** 押せるパスの最後の行の箱（窓の座標）。浮きはこの下か上に置く。 */
export type PeekAnchor = {
  readonly left: number
  readonly top: number
  readonly bottom: number
}

export type FileExcerptPeekState =
  | { readonly kind: "closed" }
  | {
      readonly kind: "shown"
      readonly pointed: LineRange
      readonly excerpt: ShownFileExcerpt
      readonly anchor: PeekAnchor
    }

/** 浮きに出す抜き書き。管理下でない・読めなかったときは浮きを出さない。 */
export type ShownFileExcerpt =
  | Exclude<FileExcerpt, { kind: "unavailable" }>
  | { readonly kind: "unavailable"; readonly reason: "too-large" | "binary" }

export type FileExcerptPeek = {
  readonly state: FileExcerptPeekState
  readonly anchorRef: RefObject<HTMLSpanElement | null>
  /** 重なったとき。touch では待たない。 */
  readonly onPointerEnter: (pointerType: string) => void
  /**
   * フォーカスが入ったとき。キーボードで入ったときだけ待つ。
   * どの入力で入ったかの判定はブラウザの `:focus-visible` に任せる（マウス・touch で押して入ったフォーカスは当たらない）。
   */
  readonly onFocus: (target: Element) => void
  /** 待ちをやめ、出ていれば閉じる。 */
  readonly dismiss: () => void
}

const CLOSED = { kind: "closed" } as const satisfies FileExcerptPeekState

export function useFileExcerptPeek(
  pointed: PointedLines,
  path: string,
  readExcerpt: (request: FileExcerptRequest) => Promise<FileExcerpt>,
): FileExcerptPeek {
  const [state, setState] = useState<FileExcerptPeekState>(CLOSED)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // 待ちを始め直す・やめるたびに進める。古い待ちの応答はこれで捨てる。
  const generation = useRef(0)

  function dismiss(): void {
    clearTimeout(timer.current)
    timer.current = undefined
    generation.current += 1
    setState((current) => (current.kind === "closed" ? current : CLOSED))
  }

  function arm(): void {
    if (pointed.kind === "none") {
      return
    }
    dismiss()
    const armed = generation.current
    timer.current = setTimeout(() => {
      timer.current = undefined
      readExcerpt({ path, startLine: pointed.startLine, endLine: pointed.endLine }).then(
        (excerpt) => {
          const anchor = anchorOf(anchorRef.current)
          if (generation.current !== armed || anchor === undefined || !isShown(excerpt)) {
            return
          }
          setState({ kind: "shown", pointed, excerpt, anchor })
        },
        // 読めなかった回は出さないだけ。
        () => {},
      )
    }, FILE_EXCERPT_PEEK_DELAY_MS)
  }

  const peek = {
    onPointerEnter: (pointerType: string) => {
      if (pointerType !== "touch") {
        arm()
      }
    },
    onFocus: (target: Element) => {
      if (target.matches(":focus-visible")) {
        arm()
      }
    },
    dismiss,
  }

  useDismissSignal({ open: state.kind === "shown", rootRef: anchorRef, onDismiss: dismiss })

  // 浮きは窓の座標に置くので、スクロールしたら閉じる。
  const shown = state.kind === "shown"
  useEffect(() => {
    if (!shown) {
      return
    }
    // 出ている間は待ちが残っていないので、閉じるだけでよい。
    function closeOnScroll(): void {
      generation.current += 1
      setState(CLOSED)
    }
    document.addEventListener("scroll", closeOnScroll, true)
    return () => {
      document.removeEventListener("scroll", closeOnScroll, true)
    }
  }, [shown])

  // 外したあとに待ちの応答が届いても出さない。
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      generation.current += 1
    },
    [],
  )

  return { state, anchorRef, ...peek }
}

function isShown(excerpt: FileExcerpt): excerpt is ShownFileExcerpt {
  return !(
    excerpt.kind === "unavailable" &&
    (excerpt.reason === "untracked" || excerpt.reason === "unreadable")
  )
}

function anchorOf(node: HTMLSpanElement | null): PeekAnchor | undefined {
  if (node === null) {
    return undefined
  }
  const rects = node.getClientRects()
  const last = rects.item(rects.length - 1) ?? node.getBoundingClientRect()
  return { left: last.left, top: last.top, bottom: last.bottom }
}
