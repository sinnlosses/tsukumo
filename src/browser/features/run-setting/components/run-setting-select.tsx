// モデル・effort・許可モード・書き上げる速さの吊り札。
// `appearance: base-select`（customizable select）で描き、キーボードの操作（↑↓・Enter・Esc）・
// 選択肢の開き方・`change` の発火はブラウザに任せる。
//
// 閉じた口は `<selectedcontent>` がいまの `<option>` の中身をそのまま写す（React からは渡せない）ので、
// 各行は「閉じていても出す絵」（`icon`）と「開いたときだけ出す中身」（`row`）に分ける。
// `icon` の口は `selectedcontent` の中の `.run-setting-select-row` を `display: none` にして絵だけを写し、
// `field` の口は絵と名前（`data-part="name"`）を写す（`run-setting-select.module.css`）。

import clsx from "clsx"
import { Check, ChevronDown } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

import type { SettingDot } from "../../../stores/model-permission.ts"
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
  /** `icon` は絵だけの口、`field` は絵・いまの名前・開閉の矢印を並べた口（設定の欄）。 */
  readonly mouth: "icon" | "field"
  readonly title: string | undefined
  /** 口の右肩の点。字は持たず、意味は `title` が言う。 */
  readonly dot: SettingDot
  readonly onChange: (value: string) => void
}

export function RunSettingSelect(props: RunSettingSelectProps): ReactElement {
  return (
    <span className={styles["run-setting-select-wrap"]}>
      <RunSettingSelectBody {...props} />
      {props.dot !== "none" && (
        <span className={styles["run-setting-dot"]} data-dot={props.dot} aria-hidden="true" />
      )}
    </span>
  )
}

function RunSettingSelectBody(props: RunSettingSelectProps): ReactElement {
  return (
    <select
      id={props.id}
      aria-label={props.ariaLabel}
      className={clsx(
        styles["run-setting-select"],
        props.danger && styles["is-danger"],
        props.rail && styles["is-rail"],
        props.layout === "row" && styles["is-row"],
        props.mouth === "field" && styles["is-field"],
      )}
      value={props.value}
      disabled={props.disabled}
      title={props.title}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <button type="button" className={styles["run-setting-select-button"]}>
        <selectedcontent className={styles["run-setting-select-closed"]} />
        {props.mouth === "field" && (
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={styles["run-setting-select-chevron"]}
            aria-hidden="true"
          />
        )}
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
          {/* `row` レイアウト（effort）は縁取りと名前の太字で選ばれている段を示すので、✓ の枠を置かない。
              選ばれていない行にも同じ幅の枠を置き、絵の列を揃える。 */}
          {props.layout === "list" && (
            <span className={styles["run-setting-select-check"]} aria-hidden="true">
              {option.value === props.value && <Check size={14} strokeWidth={2.4} />}
            </span>
          )}
          <span className={styles["run-setting-select-icon"]} aria-hidden="true">
            {option.icon}
          </span>
          <span className={styles["run-setting-select-row"]}>{option.row}</span>
        </option>
      ))}
    </select>
  )
}
