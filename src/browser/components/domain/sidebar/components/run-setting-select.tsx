// モデル・effort・許可モードの操作子（`RunSettingGroup`）が開く吊り札。
// `appearance: base-select`（customizable select）で描き、キーボードの操作（↑↓・Enter・Esc）・
// 選択肢の開き方・`change` の発火はブラウザに任せる。
//
// 閉じた口は `<selectedcontent>` がいまの `<option>` の中身をそのまま写す（React からは渡せない）ので、
// 各行は「閉じていても出す絵」（`icon`）と「開いたときだけ出す中身」（`row`）に分け、
// `.run-setting-select-row` を `selectedcontent` の中だけ `display: none` にして絵だけ残す
// （`run-setting-select.module.css`）。

import clsx from "clsx"
import { Check } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

import styles from "./run-setting-select.module.css"

export type RunSettingSelectOption = {
  readonly value: string
  readonly disabled: boolean
  /** 閉じた口でも出す絵（モデルの頭文字・effort の棒・許可モードの盾）。 */
  readonly icon: ReactNode
  /** 開いたときだけ出す中身（名前・用途や段の字・注意）。 */
  readonly row: ReactNode
}

export type RunSettingSelectProps = {
  readonly id: string
  readonly ariaLabel: string
  /** 吊り札の頭の見出し（「モデル」「effort」「許可モード」）。 */
  readonly heading: string
  readonly value: string
  readonly options: readonly RunSettingSelectOption[]
  readonly disabled: boolean
  /** 「全部許す」のときだけ絵と字に意味の色を載せる。呼び出し側が渡す。 */
  readonly danger: boolean
  /** 中くらいの窓幅の柱では、吊り札を横へ吊る。 */
  readonly rail: boolean
  /** `row` は選択肢を横に並べる（effort の5本の棒）。閉じた口の絵（`icon`）は列の形では出さない。 */
  readonly layout: "list" | "row"
  readonly title: string | undefined
  readonly onChange: (value: string) => void
}

export function RunSettingSelect(props: RunSettingSelectProps): ReactElement {
  return (
    <select
      id={props.id}
      aria-label={props.ariaLabel}
      className={clsx(
        styles["run-setting-select"],
        props.danger && styles["is-danger"],
        props.rail && styles["is-rail"],
        props.layout === "row" && styles["is-row"],
      )}
      value={props.value}
      disabled={props.disabled}
      title={props.title}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <button type="button" className={styles["run-setting-select-button"]}>
        <selectedcontent className={styles["run-setting-select-closed"]} />
      </button>
      <div className={styles["run-setting-select-heading"]} aria-hidden="true">
        {props.heading}
      </div>
      {props.options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={styles["run-setting-select-option"]}
        >
          <span className={styles["run-setting-select-icon"]} aria-hidden="true">
            {option.icon}
          </span>
          <span className={styles["run-setting-select-row"]}>
            {option.row}
            {/* `row` レイアウト（effort）は縁取りと名前の太字で選ばれている段を示すので、✓ は重ねない。 */}
            {props.layout === "list" && option.value === props.value && (
              <Check
                size={14}
                strokeWidth={2.4}
                aria-hidden="true"
                className={styles["run-setting-select-check"]}
              />
            )}
          </span>
        </option>
      ))}
    </select>
  )
}
