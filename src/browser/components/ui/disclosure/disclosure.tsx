// 開いて閉じるものの共用部品。右向きの山形の印が閉、開くと下向きに回る。
// 中身は `<details>`。開閉の動きは `prefers-reduced-motion` で無くなる。

import clsx from "clsx"
import type { ReactElement, ReactNode, ToggleEvent } from "react"

import { ChevronRightIcon } from "../icon/icon.tsx"
import { Text, type TextSize, type TextTone } from "../text/text.tsx"
import styles from "./disclosure.module.css"

export type DisclosureProps = {
  /** 制御するときだけ渡す。 */
  readonly open?: boolean
  readonly onToggle?: (event: ToggleEvent<HTMLDetailsElement>) => void
  /** 開いたときの、要約と本体の間の空き。 */
  readonly gap: "none" | "block"
  /** 狭い画面（760px 以下）で隠すか。 */
  readonly hiddenOnNarrow: boolean
  readonly summaryTone: TextTone
  readonly summarySize: TextSize
  /** 外側の箱の置き方・地・枠。 */
  readonly className: string
  /** 要約の行の文字の組み（字間など、子へ継ぐもの）。 */
  readonly summaryClassName: string
  readonly summary: ReactNode
  readonly children: ReactNode
}

export function Disclosure(props: DisclosureProps): ReactElement {
  return (
    <details
      open={props.open}
      onToggle={props.onToggle}
      className={clsx(
        styles["disclosure"],
        props.hiddenOnNarrow && styles["hidden-on-narrow"],
        props.className,
      )}
    >
      <summary
        className={clsx(
          styles["summary"],
          props.gap === "block" && styles["gap-block"],
          props.summaryClassName,
        )}
      >
        <DisclosureMark />
        <Text
          element="span"
          size={props.summarySize}
          tone={props.summaryTone}
          weight="inherit"
          className={styles["summary-text"]}
        >
          {props.summary}
        </Text>
      </summary>
      {props.children}
    </details>
  )
}

/** 開閉の印。読み上げからは外す。`open` はボタンの開閉を写すときだけ渡す（`<details>` の中は CSS が回す）。 */
export function DisclosureMark(props: { readonly open?: boolean }): ReactElement {
  return (
    <span
      className={styles["mark"]}
      data-open={props.open === undefined ? undefined : String(props.open)}
      aria-hidden="true"
    >
      <ChevronRightIcon />
    </span>
  )
}
