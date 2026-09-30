// 帯の右端の歯車で開く設定のロジック。
// 群は画面の色・新しいセッションの既定・書き上げる演出の速さ・訪問のオン・オフの4つで、持ち先が違う。
//
// - 色と演出の速さは利用者の端末の設定（`localStorage`）
// - 既定はサーバが覚える値（`~/.tsukumo/state.json`。`session.setSessionDefault` で送り、`SessionState.sessionDefault` を読む）
// - 訪問のオン・オフはサーバの `SessionState.visitEnabled` だが、ディスクには覚えず、いま動いているセッションに即座に効く（`visit.setEnabled`。オフにすると訪問中でもその場で帰る）
//
// 既定は次に起こすときから効くので、送ってもいまのセッションのモデル・許可モードは変わらない（帯のドロップダウンはセッション限りの別物）。
// 演出の速さは `useReportReveal` がマウント時に読むだけなので、変えても書いている最中の演出には効かない。
//
// 色の見た目（`documentElement`）は `onChange` のたびそのまま反映し、`localStorage` への書き込みだけ `useDebouncedCallback` で 200ms まとめる。
// 保存は3色まとめて1つの入れ物を書くので、鍵は1つにする。
// 色ごとにタイマーを分けると最後の1回しか効かず、1つにしておくと「既定に戻す」が引きずり中の書き込みを必ず追い越す。
//
// `ground` と `ink` の差が足りずに受け取らなかった色は、その理由を面の中に1行出す（`ScreenNavSettings.colorNotice`）。
// 出さないと操作子が黙って元の色へ戻り、選んだ色が効かないように見える。
// 次に受け取られたとき・既定に戻したとき・面を閉じたときに消す。
//
// `<input type="color">` に出す表示値は `displayColor` に持つ。
// マウント時に一度だけ `readCurrentColor`（`getComputedStyle`）で読み、以降は書いた値をそのまま state へ流す（書く → 描画中に読み直す、を避ける）。
// 反映済みの状態で読めるのは、保存済みの上書きを `documentElement` へ差す1回を入口が済ませているため。
//
// 開閉は `useNavPopover` に任せ、開閉のたびに色の注意書きを消す。

import { useState, type RefCallback, type RefObject } from "react"

import { isEffortLevel, isModelAlias, type ModelAlias } from "../../../../../shared/command.ts"
import {
  isSessionDefaultPermissionMode,
  type SessionDefaultPermissionMode,
} from "../../../../../shared/session/session-default.ts"
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
import { resolveEffortSelect, type EffortSelect } from "../../../../domain/effort-label.ts"
import {
  isRevealSpeed,
  loadRevealSpeed,
  saveRevealSpeed,
  type RevealSpeed,
} from "../../../../domain/reveal-speed.ts"
import { useSession } from "../../../../stores/session.ts"
import { useDebouncedCallback } from "../../../../utils/debounce.ts"
import {
  isVisitToggleValue,
  visitToggleValueOf,
  type VisitToggleValue,
} from "../domain/visit-toggle-label.ts"
import { useNavPopover } from "./use-nav-popover.ts"

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

/** 新しいセッションの既定の操作子。表示はサーバから届いた値だけに従い、押した側へ先に倒さない。 */
export type ScreenNavSettingsSessionDefault = {
  readonly model: ModelAlias
  readonly onChangeModel: (value: string) => void
  /**
   * effort。帯の判定（`resolveEffortSelect`）をそのまま使う。
   * 対応表（`modelEffortSupport`）は駆動が起動直後に届けるモデル横断の一覧なので、ここで選んでいる既定のモデルの対応も同じ関数で引ける。
   */
  readonly effort: EffortSelect
  readonly onChangeEffort: (value: string) => void
  readonly permissionMode: SessionDefaultPermissionMode
  readonly onChangePermissionMode: (value: string) => void
}

/** 書き上げる演出の速さの操作子。色と同じ利用者の設定なので、書いた値をそのまま表示値にする（読み直さない）。 */
export type ScreenNavSettingsRevealSpeed = {
  readonly value: RevealSpeed
  readonly onChange: (value: string) => void
}

/**
 * 訪問のオン・オフの操作子。表示はサーバから届いた値だけに従う。
 * `SessionState.visitEnabled` はディスクに覚えないので、起こし直すたびに既定の「する」へ戻る。
 */
export type ScreenNavSettingsVisit = {
  readonly value: VisitToggleValue
  readonly onChange: (value: string) => void
}

export type ScreenNavSettings = {
  readonly open: boolean
  readonly onToggle: () => void
  readonly colors: readonly ScreenNavSettingsColor[]
  readonly colorNotice: ScreenNavSettingsColorNotice
  readonly sessionDefault: ScreenNavSettingsSessionDefault
  readonly revealSpeed: ScreenNavSettingsRevealSpeed
  readonly visit: ScreenNavSettingsVisit
  /** 上書きが1つも無いときは押せない（戻す先が無い）。 */
  readonly resetDisabled: boolean
  readonly onReset: () => void
  /**
   * 歯車の `<button>` を預ける口（Esc で閉じたときのフォーカスの戻り先）。
   * 2箇所に描かれるので入れ物は1つにできず、付いている歯車を全部集めるコールバック ref にする。
   */
  readonly toggleRef: RefCallback<HTMLButtonElement>
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

/** `navRef` は帯全体（`<nav>`）。外側を押したかの判定に使う。 */
export function useSettings(navRef: RefObject<HTMLElement | null>): ScreenNavSettings {
  const dispatch = useSession((session) => session.dispatch)
  const sessionDefault = useSession((session) => session.state.sessionDefault)
  const modelEffortSupport = useSession((session) => session.state.modelEffortSupport)
  const visitEnabled = useSession((session) => session.state.visitEnabled)
  // 上書きの正典は `localStorage`。反映（`documentElement`）は入口が済ませているので、
  // ここは「次の1色を足すための下地」として読むだけ。
  const [override, setOverride] = useState<AppearanceColorOverride>(loadAppearanceColorOverride)
  const [displayColor, setDisplayColor] = useState<Record<AppearanceColorKey, string>>(() => ({
    ground: readCurrentColor("ground"),
    surface: readCurrentColor("surface"),
    ink: readCurrentColor("ink"),
  }))
  const [colorNotice, setColorNotice] = useState<ScreenNavSettingsColorNotice>(NO_COLOR_NOTICE)
  const { open, onToggle, toggleRef } = useNavPopover({
    navRef,
    onReset: () => setColorNotice(NO_COLOR_NOTICE),
  })
  const saveOverride = useDebouncedCallback<string, AppearanceColorOverride>((_key, value) => {
    saveAppearanceColorOverride(value)
  }, APPEARANCE_COLOR_DEBOUNCE_MS)
  // 選ぶたびに保存する（色のようにドラッグで連続しないので、まとめる必要が無い）。
  const [revealSpeed, setRevealSpeed] = useState<RevealSpeed>(loadRevealSpeed)

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

  function reset(): void {
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

  function changeRevealSpeed(value: string): void {
    // 知らない値は受け取らない（`<select>` の選択肢の外から来たときは何もしない）。
    if (isRevealSpeed(value)) {
      setRevealSpeed(value)
      saveRevealSpeed(value)
    }
  }

  return {
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
    colorNotice,
    resetDisabled: !hasOverride(override),
    onReset: reset,
    sessionDefault: {
      model: sessionDefault.model,
      onChangeModel: (value) => {
        // 知らない値は送らない（`<select>` の選択肢の外から来たときは何もしない）。
        if (isModelAlias(value)) {
          dispatch.session.setSessionDefault({
            model: value,
            effort: sessionDefault.effort,
            permissionMode: sessionDefault.permissionMode,
          })
        }
      },
      effort: resolveEffortSelect(sessionDefault.model, modelEffortSupport, sessionDefault.effort),
      onChangeEffort: (value) => {
        if (isEffortLevel(value)) {
          dispatch.session.setSessionDefault({
            model: sessionDefault.model,
            effort: value,
            permissionMode: sessionDefault.permissionMode,
          })
        }
      },
      permissionMode: sessionDefault.permissionMode,
      onChangePermissionMode: (value) => {
        // 「全部許す」はここを通らない（選択肢にも無い）。
        if (isSessionDefaultPermissionMode(value)) {
          dispatch.session.setSessionDefault({
            model: sessionDefault.model,
            effort: sessionDefault.effort,
            permissionMode: value,
          })
        }
      },
    },
    revealSpeed: {
      value: revealSpeed,
      onChange: changeRevealSpeed,
    },
    visit: {
      value: visitToggleValueOf(visitEnabled),
      onChange: (value) => {
        // 知らない値は送らない（`<select>` の選択肢の外から来たときは何もしない）。
        if (isVisitToggleValue(value)) {
          dispatch.visit.setEnabled({ enabled: value === "on" })
        }
      },
    },
    toggleRef,
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
