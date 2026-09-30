// 帯の設定の、画面の色の上書き。色は利用者の端末の設定（`localStorage`）。
//
// 色の見た目（`documentElement`）は `onChange` のたびそのまま反映し、`localStorage` への書き込みだけ `useDebouncedCallback` で 200ms まとめる。
// 保存は3色まとめて1つの入れ物を書くので、鍵は1つにする。
// 色ごとにタイマーを分けると最後の1回しか効かず、1つにしておくと「既定に戻す」が引きずり中の書き込みを必ず追い越す。
//
// `ground` と `ink` の差が足りずに受け取らなかった色は、その理由を面の中に1行出す（`ScreenNavSettings.colorNotice`）。
// 出さないと操作子が黙って元の色へ戻り、選んだ色が効かないように見える。
// 次に受け取られたとき・既定に戻したとき・面を閉じたとき（`clearNotice`）に消す。
//
// `<input type="color">` に出す表示値は `displayColor` に持つ。
// マウント時に一度だけ `readCurrentColor`（`getComputedStyle`）で読み、以降は書いた値をそのまま state へ流す（書く → 描画中に読み直す、を避ける）。
// 反映済みの状態で読めるのは、保存済みの上書きを `documentElement` へ差す1回を入口が済ませているため。

import { useState } from "react"

import {
  applyAppearanceColorOverride,
  changeAppearanceColor,
  DEFAULT_APPEARANCE_COLOR_OVERRIDE,
  loadAppearanceColorOverride,
  readCurrentColor,
  saveAppearanceColorOverride,
  type AppearanceColorChange,
  type AppearanceColorKey,
  type AppearanceColorOverride,
} from "../../../../domain/appearance-color.ts"
import { useDebouncedCallback } from "../../../../utils/debounce.ts"

export type ScreenNavSettingsColor = {
  readonly key: AppearanceColorKey
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
}

/** 色を受け取らなかった理由の1行。 */
export type ScreenNavSettingsColorNotice =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly text: string }

export type AppearanceColor = {
  readonly colors: readonly ScreenNavSettingsColor[]
  readonly colorNotice: ScreenNavSettingsColorNotice
  /** 上書きが1つも無いときは押せない（戻す先が無い）。 */
  readonly resetDisabled: boolean
  readonly onReset: () => void
  readonly clearNotice: () => void
}

const COLOR_FIELDS = [
  { key: "ground", label: "画面の地" },
  { key: "surface", label: "領域の地" },
  { key: "ink", label: "字の色" },
] as const satisfies readonly { readonly key: AppearanceColorKey; readonly label: string }[]

/**
 * 差が足りずに受け取らなかったときの1行。変えようとした側の色を主語にする。
 * 相手の色を先に動かせば通ることが読み取れるように、相手の名前も出す。
 */
const LOW_CONTRAST_NOTICE = {
  ground: "字の色との差が足りず本文が読めなくなるため、この地の色は使えません。",
  ink: "画面の地との差が足りず本文が読めなくなるため、この字の色は使えません。",
} as const satisfies Record<"ground" | "ink", string>

const NO_COLOR_NOTICE = { kind: "none" } as const satisfies ScreenNavSettingsColorNotice

const APPEARANCE_COLOR_DEBOUNCE_MS = 200

/** 書き込みをまとめる鍵。3色を1つの入れ物で保存するので、色ごとには分けない。 */
const APPEARANCE_COLOR_SAVE_KEY = "appearance-color"

export function useAppearanceColor(): AppearanceColor {
  // 上書きの正典は `localStorage`。反映（`documentElement`）は入口が済ませているので、
  // ここは「次の1色を足すための下地」として読むだけ。
  const [override, setOverride] = useState<AppearanceColorOverride>(loadAppearanceColorOverride)
  const [displayColor, setDisplayColor] = useState<Record<AppearanceColorKey, string>>(() => ({
    ground: readCurrentColor("ground"),
    surface: readCurrentColor("surface"),
    ink: readCurrentColor("ink"),
  }))
  const [colorNotice, setColorNotice] = useState<ScreenNavSettingsColorNotice>(NO_COLOR_NOTICE)
  const saveOverride = useDebouncedCallback<string, AppearanceColorOverride>((_key, value) => {
    saveAppearanceColorOverride(value)
  }, APPEARANCE_COLOR_DEBOUNCE_MS)

  function changeColor(key: AppearanceColorKey, value: string): void {
    const change = changeAppearanceColor(override, key, value)
    setColorNotice(colorNoticeOf(change))
    if (change.kind !== "accepted") {
      return
    }
    applyAppearanceColorOverride(change.override)
    setOverride(change.override)
    saveOverride(APPEARANCE_COLOR_SAVE_KEY, change.override)
    // 書いた値がそのまま documentElement に反映されるので、読み直さずにその値を表示値にする。
    setDisplayColor((current) => ({ ...current, [key]: value }))
  }

  function onReset(): void {
    applyAppearanceColorOverride(DEFAULT_APPEARANCE_COLOR_OVERRIDE)
    setOverride(DEFAULT_APPEARANCE_COLOR_OVERRIDE)
    setColorNotice(NO_COLOR_NOTICE)
    saveOverride(APPEARANCE_COLOR_SAVE_KEY, DEFAULT_APPEARANCE_COLOR_OVERRIDE)
    // 上書きを外した直後の `:root` の既定値を読み直す（既定に戻したあとの操作子は既定を指す）。
    setDisplayColor({
      ground: readCurrentColor("ground"),
      surface: readCurrentColor("surface"),
      ink: readCurrentColor("ink"),
    })
  }

  return {
    colors: COLOR_FIELDS.map((field) => ({
      key: field.key,
      label: field.label,
      value: displayColor[field.key],
      onChange: (value) => {
        changeColor(field.key, value)
      },
    })),
    colorNotice,
    resetDisabled: !hasOverride(override),
    onReset,
    clearNotice: () => {
      setColorNotice(NO_COLOR_NOTICE)
    },
  }
}

/** 16進として不正な値は `<input type="color">` からは来ないので、理由を出さずに黙って捨てる。 */
function colorNoticeOf(change: AppearanceColorChange): ScreenNavSettingsColorNotice {
  return change.kind === "low-contrast"
    ? { kind: "shown", text: LOW_CONTRAST_NOTICE[change.key] }
    : NO_COLOR_NOTICE
}

function hasOverride(override: AppearanceColorOverride): boolean {
  return (
    override.ground !== undefined || override.surface !== undefined || override.ink !== undefined
  )
}
