// 領域をまたいで使う `<select>`。
// 持つ見た目は、どのプルダウンでも同じになる分だけ（下向きの矢印と、ブラウザ既定の矢印を消すこと）。
// 寸法・枠・地・字の段と、選択肢・値・変更時の呼び先はすべて呼び出し側が渡す。

import clsx from "clsx"
import type { ReactElement } from "react"

import styles from "./select.module.css"

export type SelectOption = {
  readonly value: string
  readonly label: string
}

export type SelectProps = {
  readonly id: string
  readonly ariaLabel: string
  /**
   * 矢印を重ねる枠に足す class。置き方（列の中での伸び縮み）と字の色だけを渡す。
   * 矢印は `currentColor` で描くので、色はここから継ぐ。
   */
  readonly frameClassName: string
  /** `<select>` 自身に足す class。右の余白は矢印ぶん空ける（空けないと字が矢印の下へ潜る）。 */
  readonly className: string
  readonly value: string
  readonly options: readonly SelectOption[]
  readonly disabled: boolean
  /**
   * `disabled` のときに理由を見せる（呼び出し側が渡さないときは `undefined`）。
   * 常設の枠は増やさず、ブラウザ既定のツールチップに任せる。
   */
  readonly title: string | undefined
  readonly onChange: (value: string) => void
}

export function Select(props: SelectProps): ReactElement {
  return (
    <span className={clsx(styles["select-frame"], props.frameClassName)}>
      <select
        id={props.id}
        aria-label={props.ariaLabel}
        className={clsx(styles["select-field"], props.className)}
        value={props.value}
        disabled={props.disabled}
        title={props.title}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  )
}
