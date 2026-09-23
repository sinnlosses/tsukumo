// 帯の右端の歯車で開く**設定**のロジック（docs/design.md 13.6「設定の置き場所」/ 13.9「設定の
// 歯車」）。いまここにあるのは**地・領域・字の色**・**新しいセッションの既定**・**書き上げる
// 演出の速さ**の3群。
//
// **3群は持ち先が違う。** 色と演出の速さは利用者の端末の設定（`localStorage`。演出の速さは
// `browser/lib/reveal-speed.ts`）、既定はサーバが覚える値（`~/.tsukumo/state.json`。
// `set-session-default` で送り、`SessionState.sessionDefault` を読む）。**既定は次に起こすときから
// 効く**ので、送ってもいまのセッションのモデル・許可モードは変わらない（帯のドロップダウンは
// セッション限りの別物）。演出の速さは `report-reveal.ts` がマウント時に読むだけなので、
// 変えても書いている最中の演出には効かない（次に書き始めたときから）。
//
// **色の持ち方は `browser/lib/appearance-color.ts` のまま**（`localStorage` の鍵も検証も変えて
// いない。キャラクター画面から移したのは操作子だけ）。見た目（`documentElement`）
// は `onChange` のたびそのまま反映し、`localStorage` への書き込みだけ `useDebouncedCallback` で
// 200ms まとめる。**鍵は1つ**——保存は3色まとめて1つの入れ物を書くので、色ごとにタイマーを
// 分けても最後の1回しか効かない。1つにしておくと「既定に戻す」が引きずり中の書き込みを
// 必ず追い越す。
//
// `<input type="color">` に出す表示値は `displayColor` に持つ。マウント時に一度だけ
// `readCurrentColor`（`getComputedStyle`）で読み、以降は**書いた値をそのまま state へ流す**
// （書く → 描画中に読み直す、を避ける）。**反映済みの状態で読める**のは、保存済みの上書きを
// `documentElement` へ差す1回を入口（`src/browser/main.tsx`）が済ませているため。
//
// **ポップオーバーは2箇所に描かれる**（広い画面の帯・狭い画面の「≡」の面の中。「いまの作業」の
// 札と同じ畳み方で、どちらを出すかは CSS が決める）。**開閉の状態は1つ**なので、押した先の
// DOM がどちらでも同じ面が開く。閉じる合図は「≡」・「いまの作業」と同じ
// `browser/hooks/use-dismiss-signal.ts`。

import { useCallback, useRef, useState, type RefObject } from "react"

import { isModelAlias, type ModelAlias } from "../../../../shared/command.ts"
import {
  isSessionDefaultPermissionMode,
  type SessionDefaultPermissionMode,
} from "../../../../shared/session-default.ts"
import { useDismissSignal, type DismissCause } from "../../../hooks/use-dismiss-signal.ts"
import {
  applyAppearanceColorOverride,
  changeAppearanceColor,
  DEFAULT_APPEARANCE_COLOR_OVERRIDE,
  loadAppearanceColorOverride,
  readCurrentColor,
  saveAppearanceColorOverride,
  type AppearanceColorKey,
  type AppearanceColorOverride,
} from "../../../lib/appearance-color.ts"
import { useDebouncedCallback } from "../../../lib/debounce.ts"
import {
  isRevealSpeed,
  loadRevealSpeed,
  saveRevealSpeed,
  type RevealSpeed,
} from "../../../lib/reveal-speed.ts"
import { useSessionDispatch, useSessionSelector } from "../../../stores/session.tsx"

/** 色の操作子1つ（見た目が受け取れる形まで畳んだもの）。 */
export type ScreenNavSettingsColor = {
  readonly key: AppearanceColorKey
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
}

/**
 * 新しいセッションの既定の操作子（`docs/design.md` 13.6）。**表示はサーバから届いた値だけに
 * 従う**（押した側へ先に倒さない。帯の操作子と同じ作法）。
 */
export type ScreenNavSettingsSessionDefault = {
  readonly model: ModelAlias
  readonly onChangeModel: (value: string) => void
  readonly permissionMode: SessionDefaultPermissionMode
  readonly onChangePermissionMode: (value: string) => void
}

/**
 * 書き上げる演出の速さの操作子（`docs/design.md` 13.6。`lib/reveal-speed.ts`）。色と同じ
 * 利用者の設定なので、書いた値をそのまま表示値にする（読み直さない）。
 */
export type ScreenNavSettingsRevealSpeed = {
  readonly value: RevealSpeed
  readonly onChange: (value: string) => void
}

export type ScreenNavSettings = {
  readonly open: boolean
  readonly onToggle: () => void
  readonly colors: readonly ScreenNavSettingsColor[]
  readonly sessionDefault: ScreenNavSettingsSessionDefault
  readonly revealSpeed: ScreenNavSettingsRevealSpeed
  /** 上書きが1つも無いときは押せない（戻す先が無い）。 */
  readonly resetDisabled: boolean
  readonly onReset: () => void
}

export type UseSettingsResult = {
  readonly view: ScreenNavSettings
  /** 広い画面の帯にある歯車（`presentational-screen-nav.tsx`）。 */
  readonly toggleRefWide: RefObject<HTMLButtonElement | null>
  /** 狭い画面の「≡」の面の中にある歯車（`screen-nav-menu.tsx`）。 */
  readonly toggleRefNarrow: RefObject<HTMLButtonElement | null>
}

const COLOR_FIELDS = [
  { key: "ground", label: "画面の地" },
  { key: "surface", label: "領域の地" },
  { key: "ink", label: "字の色" },
] as const satisfies readonly { readonly key: AppearanceColorKey; readonly label: string }[]

/** 画面の色の書き込みをまとめる間隔。 */
const APPEARANCE_COLOR_DEBOUNCE_MS = 200

/** 書き込みをまとめる鍵。3色を1つの入れ物で保存するので、色ごとには分けない（冒頭の注記）。 */
const APPEARANCE_COLOR_SAVE_KEY = "appearance-color"

/** `navRef` は帯全体（`<nav>`）。外側を押したかの判定に使う（「≡」・「いまの作業」と同じ `ref`）。 */
export function useSettings(navRef: RefObject<HTMLElement | null>): UseSettingsResult {
  const dispatch = useSessionDispatch()
  const sessionDefault = useSessionSelector((session) => session.state.sessionDefault)
  const [open, setOpen] = useState(false)
  const toggleRefWide = useRef<HTMLButtonElement>(null)
  const toggleRefNarrow = useRef<HTMLButtonElement>(null)
  // 上書きの正典は `localStorage`。反映（`documentElement`）は入口が済ませているので、
  // ここは「次の1色を足すための下地」として読むだけ。
  const [override, setOverride] = useState<AppearanceColorOverride>(loadAppearanceColorOverride)
  const [displayColor, setDisplayColor] = useState<Record<AppearanceColorKey, string>>(() => ({
    ground: readCurrentColor("ground"),
    surface: readCurrentColor("surface"),
    ink: readCurrentColor("ink"),
  }))
  const saveOverride = useDebouncedCallback<string, AppearanceColorOverride>((_key, value) => {
    saveAppearanceColorOverride(value)
  }, APPEARANCE_COLOR_DEBOUNCE_MS)
  // 選ぶたびに保存する（色のようにドラッグで連続しないので、まとめる必要が無い）。
  const [revealSpeed, setRevealSpeed] = useState<RevealSpeed>(loadRevealSpeed)

  const onToggle = useCallback((): void => {
    setOpen((wasOpen) => !wasOpen)
  }, [])

  const onDismiss = useCallback((cause: DismissCause): void => {
    setOpen(false)
    if (cause === "escape") {
      // どちらか一方しか押せる状態にない（もう片方は `display: none` で `.focus()` が
      // 効かない）ので、両方へ呼んで構わない。
      toggleRefWide.current?.focus()
      toggleRefNarrow.current?.focus()
    }
  }, [])

  useDismissSignal({ open, rootRef: navRef, onDismiss })

  function changeColor(key: AppearanceColorKey, value: string): void {
    const next = changeAppearanceColor(override, key, value)
    applyAppearanceColorOverride(next)
    setOverride(next)
    saveOverride(APPEARANCE_COLOR_SAVE_KEY, next)
    // 受け取られたときだけ表示値を進める（`next` は受け取らなければ `override` と同じ参照の
    // まま返る）。書いた値がそのまま documentElement に反映されるので、書き戻しを読み直さず
    // その値をそのまま表示値にできる。
    if (next !== override) {
      setDisplayColor((current) => ({ ...current, [key]: value }))
    }
  }

  function reset(): void {
    applyAppearanceColorOverride(DEFAULT_APPEARANCE_COLOR_OVERRIDE)
    setOverride(DEFAULT_APPEARANCE_COLOR_OVERRIDE)
    saveOverride(APPEARANCE_COLOR_SAVE_KEY, DEFAULT_APPEARANCE_COLOR_OVERRIDE)
    // 上書きを外した直後の `:root` の既定値を読み直す（既定に戻したあとの操作子は既定を指す）。
    setDisplayColor({
      ground: readCurrentColor("ground"),
      surface: readCurrentColor("surface"),
      ink: readCurrentColor("ink"),
    })
  }

  function changeRevealSpeed(value: string): void {
    // **知らない値は受け取らない**（`<select>` の選択肢の外から来たときは何もしない）。
    if (isRevealSpeed(value)) {
      setRevealSpeed(value)
      saveRevealSpeed(value)
    }
  }

  return {
    view: {
      open,
      onToggle,
      colors: COLOR_FIELDS.map((field) => ({
        key: field.key,
        label: field.label,
        value: displayColor[field.key],
        onChange: (value) => {
          changeColor(field.key, value)
        },
      })),
      resetDisabled: !hasOverride(override),
      onReset: reset,
      sessionDefault: {
        model: sessionDefault.model,
        onChangeModel: (value) => {
          // **知らない値は送らない**（`<select>` の選択肢の外から来たときは何もしない）。
          if (isModelAlias(value)) {
            dispatch({
              type: "set-session-default",
              model: value,
              permissionMode: sessionDefault.permissionMode,
            })
          }
        },
        permissionMode: sessionDefault.permissionMode,
        onChangePermissionMode: (value) => {
          // 「全部許す」はここを通らない（選択肢にも無い。`docs/requirements.md` 4.1）。
          if (isSessionDefaultPermissionMode(value)) {
            dispatch({
              type: "set-session-default",
              model: sessionDefault.model,
              permissionMode: value,
            })
          }
        },
      },
      revealSpeed: {
        value: revealSpeed,
        onChange: changeRevealSpeed,
      },
    },
    toggleRefWide,
    toggleRefNarrow,
  }
}

function hasOverride(override: AppearanceColorOverride): boolean {
  return (
    override.ground !== undefined || override.surface !== undefined || override.ink !== undefined
  )
}
