// 帯の右端の歯車で開く**設定**のロジック（docs/screen-design.md 13.6「設定の置き場所」/ 13.9「設定の
// 歯車」）。いまここにあるのは**地・領域・字の色**・**新しいセッションの既定**・**書き上げる
// 演出の速さ**・**訪問のオン・オフ**の4群。
//
// **4群は持ち先が違う。** 色と演出の速さは利用者の端末の設定（`localStorage`。演出の速さは
// `browser/domain/reveal-speed.ts`）、既定はサーバが覚える値（`~/.tsukumo/state.json`。
// `set-session-default` で送り、`SessionState.sessionDefault` を読む）。**既定は次に起こすときから
// 効く**ので、送ってもいまのセッションのモデル・許可モードは変わらない（帯のドロップダウンは
// セッション限りの別物）。演出の速さは `domain/reveal/use-report-reveal.ts` がマウント時に読むだけなので、
// 変えても書いている最中の演出には効かない（次に書き始めたときから）。**訪問のオン・オフは
// 上のどちらでもない**——サーバの `SessionState.visitEnabled` だが、ディスクには覚えず
// いま動いているセッションに即座に効く（`set-visit-enabled`。オフにすると訪問中でもその場で
// 帰る。`docs/design.md` 5章「訪問の契機と状態」）。
//
// **色の持ち方は `browser/domain/appearance-color.ts` のまま**（`localStorage` の鍵も検証も変えて
// いない。キャラクター画面から移したのは操作子だけ）。見た目（`documentElement`）
// は `onChange` のたびそのまま反映し、`localStorage` への書き込みだけ `useDebouncedCallback` で
// 200ms まとめる。**鍵は1つ**——保存は3色まとめて1つの入れ物を書くので、色ごとにタイマーを
// 分けても最後の1回しか効かない。1つにしておくと「既定に戻す」が引きずり中の書き込みを
// 必ず追い越す。
//
// **`ground` と `ink` の差が足りずに受け取らなかった色は、その理由を面の中に1行出す**
// （{@link ScreenNavSettings.colorNotice}）。出さないと操作子が黙って元の色へ戻り、選んだ色が
// 効かないように見える。次に受け取られたとき・既定に戻したとき・面を閉じたときに消す。
//
// `<input type="color">` に出す表示値は `displayColor` に持つ。マウント時に一度だけ
// `readCurrentColor`（`getComputedStyle`）で読み、以降は**書いた値をそのまま state へ流す**
// （書く → 描画中に読み直す、を避ける）。**反映済みの状態で読める**のは、保存済みの上書きを
// `documentElement` へ差す1回を入口（`src/browser/main.tsx`）が済ませているため。
//
// **ポップオーバーは2箇所に描かれる**（広い画面の帯・狭い画面の「≡」の面の中。「いまの作業」の
// 札と同じ畳み方で、どちらを出すかは CSS が決める）。**開閉の状態は1つ**なので、押した先の
// DOM がどちらでも同じ面が開く。閉じる合図は「≡」・「いまの作業」と同じ
// `browser/hooks/use-dismiss-signal.ts` で、Esc の戻り先の歯車も同じくコールバック ref で
// 集める（{@link ScreenNavSettings.toggleRef}）。

import { useCallback, useRef, useState, type RefCallback, type RefObject } from "react"

import { isEffortLevel, isModelAlias, type ModelAlias } from "../../../../../shared/command.ts"
import {
  isSessionDefaultPermissionMode,
  type SessionDefaultPermissionMode,
} from "../../../../../shared/session-default.ts"
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
import {
  isRevealSpeed,
  loadRevealSpeed,
  saveRevealSpeed,
  type RevealSpeed,
} from "../../../../domain/reveal-speed.ts"
import { useDismissSignal, type DismissCause } from "../../../../hooks/use-dismiss-signal.ts"
import { useDebouncedCallback } from "../../../../lib/debounce.ts"
import { useSessionDispatch, useSessionSelector } from "../../../../stores/session.tsx"
import { resolveEffortSelect, type EffortSelect } from "../domain/effort-label.ts"
import {
  isVisitToggleValue,
  visitToggleValueOf,
  type VisitToggleValue,
} from "../domain/visit-toggle-label.ts"

/** 色の操作子1つ（見た目が受け取れる形まで畳んだもの）。 */
export type ScreenNavSettingsColor = {
  readonly key: AppearanceColorKey
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
}

/** 色を受け取らなかった理由の1行（`docs/screen-design.md` 13.9「設定の歯車」）。 */
export type ScreenNavSettingsColorNotice =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly text: string }

/**
 * 新しいセッションの既定の操作子（`docs/screen-design.md` 13.6）。**表示はサーバから届いた値だけに
 * 従う**（押した側へ先に倒さない。帯の操作子と同じ作法）。
 */
export type ScreenNavSettingsSessionDefault = {
  readonly model: ModelAlias
  readonly onChangeModel: (value: string) => void
  /**
   * effort（{@link EffortSelect}）。**帯の判定をそのまま再利用する**
   * （`resolveEffortSelect`。`domain/effort-label.ts`）——対応表（`modelEffortSupport`）は
   * 駆動が起動直後に届けるモデル横断の一覧なので、いま帯に出しているモデルと無関係に、
   * ここで選んでいる既定のモデルの対応も同じ関数で引ける。
   */
  readonly effort: EffortSelect
  readonly onChangeEffort: (value: string) => void
  readonly permissionMode: SessionDefaultPermissionMode
  readonly onChangePermissionMode: (value: string) => void
}

/**
 * 書き上げる演出の速さの操作子（`docs/screen-design.md` 13.6。`domain/reveal-speed.ts`）。色と同じ
 * 利用者の設定なので、書いた値をそのまま表示値にする（読み直さない）。
 */
export type ScreenNavSettingsRevealSpeed = {
  readonly value: RevealSpeed
  readonly onChange: (value: string) => void
}

/**
 * 訪問のオン・オフの操作子（`docs/screen-design.md` 13.6・13.9）。**表示はサーバから届いた値だけに
 * 従う**（`sessionDefault` と同じ作法）——`SessionState.visitEnabled` はディスクに覚えないので、
 * 起こし直すたびに既定の「する」へ戻る。
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
   * 歯車の `<button>` を預ける口（Esc で閉じたときのフォーカスの戻り先）。**2箇所に描かれる**
   * ので入れ物は1つにできず、付いている歯車を全部集めるコールバック ref にする
   * （理由は `hooks/use-current-work.ts` の {@link ScreenNavCurrentWork.toggleRef} と同じ）。
   */
  readonly toggleRef: RefCallback<HTMLButtonElement>
}

const COLOR_FIELDS = [
  { key: "ground", label: "画面の地" },
  { key: "surface", label: "領域の地" },
  { key: "ink", label: "字の色" },
] as const satisfies readonly { readonly key: AppearanceColorKey; readonly label: string }[]

/**
 * 差が足りずに受け取らなかったときの1行。**変えようとした側の色を主語にする**（相手の色を
 * 先に動かせば通ることが読み取れるように、相手の名前も出す）。
 */
const LOW_CONTRAST_NOTICE = {
  ground: "字の色との差が足りず本文が読めなくなるため、この地の色は使えません。",
  ink: "画面の地との差が足りず本文が読めなくなるため、この字の色は使えません。",
} as const satisfies Record<"ground" | "ink", string>

const NO_COLOR_NOTICE = { kind: "none" } as const satisfies ScreenNavSettingsColorNotice

/** 画面の色の書き込みをまとめる間隔。 */
const APPEARANCE_COLOR_DEBOUNCE_MS = 200

/** 書き込みをまとめる鍵。3色を1つの入れ物で保存するので、色ごとには分けない（冒頭の注記）。 */
const APPEARANCE_COLOR_SAVE_KEY = "appearance-color"

/** `navRef` は帯全体（`<nav>`）。外側を押したかの判定に使う（「≡」・「いまの作業」と同じ `ref`）。 */
export function useSettings(navRef: RefObject<HTMLElement | null>): ScreenNavSettings {
  const dispatch = useSessionDispatch()
  const sessionDefault = useSessionSelector((session) => session.state.sessionDefault)
  const modelEffortSupport = useSessionSelector((session) => session.state.modelEffortSupport)
  const visitEnabled = useSessionSelector((session) => session.state.visitEnabled)
  const [open, setOpen] = useState(false)
  // いま DOM に付いている歯車。React の外にある資源を持つ可変の入れ物なので ref に置く。
  const toggleNodes = useRef(new Set<HTMLButtonElement>())
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
  // 選ぶたびに保存する（色のようにドラッグで連続しないので、まとめる必要が無い）。
  const [revealSpeed, setRevealSpeed] = useState<RevealSpeed>(loadRevealSpeed)

  const onToggle = useCallback((): void => {
    setOpen((wasOpen) => !wasOpen)
    setColorNotice(NO_COLOR_NOTICE)
  }, [])

  const toggleRef = useCallback<RefCallback<HTMLButtonElement>>((node) => {
    // **cleanup を返す形なので React 19 は `null` で呼び直さない**（外れるのは下の cleanup）。
    if (node === null) {
      return
    }
    const nodes = toggleNodes.current
    nodes.add(node)
    return () => {
      nodes.delete(node)
    }
  }, [])

  const onDismiss = useCallback((cause: DismissCause): void => {
    setOpen(false)
    setColorNotice(NO_COLOR_NOTICE)
    if (cause === "escape") {
      // 押せる状態にある歯車は1つだけ（もう片方は `display: none` で `.focus()` が効かない）
      // なので、付いているものへ順に呼んで構わない。
      for (const node of toggleNodes.current) {
        node.focus()
      }
    }
  }, [])

  useDismissSignal({ open, rootRef: navRef, onDismiss })

  function changeColor(key: AppearanceColorKey, value: string): void {
    const change = changeAppearanceColor(override, key, value)
    setColorNotice(colorNoticeOf(change))
    if (change.kind !== "accepted") {
      return
    }
    applyAppearanceColorOverride(change.override)
    setOverride(change.override)
    saveOverride(APPEARANCE_COLOR_SAVE_KEY, change.override)
    // 書いた値がそのまま documentElement に反映されるので、書き戻しを読み直さず
    // その値をそのまま表示値にできる。
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
    // **知らない値は受け取らない**（`<select>` の選択肢の外から来たときは何もしない）。
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
        // **知らない値は送らない**（`<select>` の選択肢の外から来たときは何もしない）。
        if (isModelAlias(value)) {
          dispatch({
            type: "set-session-default",
            model: value,
            effort: sessionDefault.effort,
            permissionMode: sessionDefault.permissionMode,
          })
        }
      },
      effort: resolveEffortSelect(sessionDefault.model, modelEffortSupport, sessionDefault.effort),
      onChangeEffort: (value) => {
        if (isEffortLevel(value)) {
          dispatch({
            type: "set-session-default",
            model: sessionDefault.model,
            effort: value,
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
        // **知らない値は送らない**（`<select>` の選択肢の外から来たときは何もしない）。
        if (isVisitToggleValue(value)) {
          dispatch({ type: "set-visit-enabled", enabled: value === "on" })
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
