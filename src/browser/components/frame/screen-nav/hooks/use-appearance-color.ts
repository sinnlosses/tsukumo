// 帯の設定の、画面の色の上書き。覚え先は `~/.tsukumo/state.json`（手続き `setGearPreference`）。
//
// 色の見た目（`documentElement`）は `onChange` のたびそのまま反映し、覚えさせる手続きだけ `useDebouncedCallback` で 200ms まとめる。
// 3色まとめて1つの欄を書くので、鍵は1つにする。
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
  DEFAULT_APPEARANCE_COLOR_OVERRIDE,
  type AppearanceColorOverride,
} from "../../../../../shared/session/gear-preference.ts"
import {
  changeAppearanceColor,
  matchingThemeId,
  themeOverride,
  type AppearanceColorChange,
  type AppearanceColorKey,
  type AppearanceTheme,
} from "../../../../domain/appearance-color.ts"
import { useDebouncedCallback } from "../../../../hooks/use-debounced-callback.ts"
import {
  applyAppearanceColorOverride,
  readCurrentColor,
} from "../../../../stores/appearance-color-root.ts"
import { useGearPreferences } from "../../../../stores/gear-preference-seed.ts"
import { useSession } from "../../../../stores/session.ts"

export type ScreenNavSettingsColor = {
  readonly key: AppearanceColorKey
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  /** 上書きしてあるか。 */
  readonly changed: boolean
  /** この色だけ上書きを外す。 */
  readonly onReset: () => void
}

/** 色を受け取らなかった理由の1行。 */
export type ScreenNavSettingsColorNotice =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly text: string }

type AppearanceColor = {
  readonly colors: readonly ScreenNavSettingsColor[]
  readonly colorNotice: ScreenNavSettingsColorNotice
  /** いま見えている3色と同じ組のテーマ。どの組とも違えば `custom`。 */
  readonly themeId: AppearanceTheme["id"] | "custom"
  readonly onChooseTheme: (theme: AppearanceTheme) => void
  /** 上書きしてある色の数。 */
  readonly changedCount: number
  readonly onReset: () => void
  readonly clearNotice: () => void
}

const COLOR_FIELDS = [
  { key: "ground", label: "地の色" },
  { key: "surface", label: "領域の色" },
  { key: "ink", label: "字の色" },
] as const satisfies readonly { readonly key: AppearanceColorKey; readonly label: string }[]

/**
 * 差が足りずに受け取らなかったときの1行。変えようとした側の色を主語にする。
 * 相手の色を先に動かせば通ることが読み取れるように、相手の名前も出す。
 */
const LOW_CONTRAST_NOTICE = {
  ground: "字の色との差が足りず本文が読めなくなるため、この地の色は使えません。",
  ink: "地の色との差が足りず本文が読めなくなるため、この字の色は使えません。",
} as const satisfies Record<"ground" | "ink", string>

const NO_COLOR_NOTICE = { kind: "none" } as const satisfies ScreenNavSettingsColorNotice

const APPEARANCE_COLOR_DEBOUNCE_MS = 200

/** 書き込みをまとめる鍵。3色を1つの欄で覚えるので、色ごとには分けない。 */
const APPEARANCE_COLOR_SAVE_KEY = "appearance-color"

export function useAppearanceColor(): AppearanceColor {
  // 上書きの正典は `state.json`。反映（`documentElement`）は入口と、イベントを受けた store が済ませているので、
  // ここは「次の1色を足すための下地」として、マウント時の値から手元で持ち続ける。
  // 送るのを 200ms まとめるので、届いた値を下地にすると、続けて別の色を変えたときに前の色が落ちる。
  const stored = useGearPreferences().appearanceColor
  const [override, setOverride] = useState<AppearanceColorOverride>(stored)
  const dispatch = useSession((session) => session.dispatch)
  const [displayColor, setDisplayColor] = useState<Record<AppearanceColorKey, string>>(() => ({
    ground: readCurrentColor("ground"),
    surface: readCurrentColor("surface"),
    ink: readCurrentColor("ink"),
  }))
  const [colorNotice, setColorNotice] = useState<ScreenNavSettingsColorNotice>(NO_COLOR_NOTICE)
  const saveOverride = useDebouncedCallback<string, AppearanceColorOverride>((_key, value) => {
    void dispatch.session.setGearPreference({ field: "appearanceColor", value })
  }, APPEARANCE_COLOR_DEBOUNCE_MS)

  function changeColor(key: AppearanceColorKey, value: string): void {
    const change = changeAppearanceColor(override, key, value, {
      ground: readCurrentColor("ground"),
      ink: readCurrentColor("ink"),
    })
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

  function resetColor(key: AppearanceColorKey): void {
    const next: AppearanceColorOverride = { ...override, [key]: undefined }
    applyAppearanceColorOverride(next)
    setOverride(next)
    setColorNotice(NO_COLOR_NOTICE)
    saveOverride(APPEARANCE_COLOR_SAVE_KEY, next)
    // 外した直後の `:root` の既定値を読み直す。
    setDisplayColor((current) => ({ ...current, [key]: readCurrentColor(key) }))
  }

  function replaceOverride(next: AppearanceColorOverride): void {
    applyAppearanceColorOverride(next)
    setOverride(next)
    setColorNotice(NO_COLOR_NOTICE)
    saveOverride(APPEARANCE_COLOR_SAVE_KEY, next)
    // 反映した直後の `:root` の値を読み直す（既定に戻したあとの操作子は既定を指す）。
    setDisplayColor({
      ground: readCurrentColor("ground"),
      surface: readCurrentColor("surface"),
      ink: readCurrentColor("ink"),
    })
  }

  function chooseTheme(theme: AppearanceTheme): void {
    replaceOverride(themeOverride(theme))
  }

  function onReset(): void {
    replaceOverride(DEFAULT_APPEARANCE_COLOR_OVERRIDE)
  }

  return {
    colors: COLOR_FIELDS.map((field) => ({
      key: field.key,
      label: field.label,
      value: displayColor[field.key],
      onChange: (value) => {
        changeColor(field.key, value)
      },
      changed: override[field.key] !== undefined,
      onReset: () => {
        resetColor(field.key)
      },
    })),
    colorNotice,
    themeId: matchingThemeId(displayColor),
    onChooseTheme: chooseTheme,
    changedCount: countOverride(override),
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

function countOverride(override: AppearanceColorOverride): number {
  return [override.ground, override.surface, override.ink].filter((color) => color !== undefined)
    .length
}
