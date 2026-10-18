// 帯の右端の歯車で開く設定のロジック。
// 画面の色と演出の速さは別のフックが持ち、ここは開閉と新しいセッションの既定を持って束ねる。
//
// - 既定はサーバが覚える値（`~/.tsukumo/state.json`。`session.setSessionDefault` で送り、`SessionState.sessionDefault` を読む）
//
// 既定は次に起こすときから効くので、送ってもいまのセッションのモデル・許可モードは変わらない（帯のドロップダウンはセッション限りの別物）。
//
// 開閉はダイアログ（`ui/dialog`）に合わせて持ち、開閉のたびに色の注意書きを消す。

import { useRef, useState, type RefObject } from "react"

import { isEffortLevel, isModelAlias, type ModelAlias } from "../../../../../shared/command.ts"
import {
  isSessionDefaultPermissionMode,
  type SessionDefault,
  type SessionDefaultPermissionMode,
} from "../../../../../shared/session/session-default.ts"
import type { ModelEffortSupport } from "../../../../../shared/session/session-event.ts"
import { resolveEffortSelect, type EffortSelect } from "../../../../domain/effort-label.ts"
import { useSession } from "../../../../stores/session.ts"
import {
  useAppearanceColor,
  type ScreenNavSettingsColor,
  type ScreenNavSettingsColorNotice,
} from "./use-appearance-color.ts"
import {
  useRevealSpeedSetting,
  type ScreenNavSettingsRevealSpeed,
} from "./use-reveal-speed-setting.ts"

/** 新しいセッションの既定の操作子。表示はサーバから届いた値だけに従い、押した側へ先に倒さない。 */
type ScreenNavSettingsSessionDefault = {
  readonly model: ModelAlias
  readonly onChangeModel: (value: string) => void
  /**
   * effort。帯の判定（`resolveEffortSelect`）をそのまま使う。
   * 対応表（`modelEffortSupport`）は駆動が起動直後に届けるモデル横断の一覧なので、ここで選んでいる既定のモデルの対応も同じ関数で引ける。
   */
  readonly effort: EffortSelect
  /** モデルの吊り札の行に「effort なし」を添えるための対応表。 */
  readonly modelEffortSupport: readonly ModelEffortSupport[]
  readonly onChangeEffort: (value: string) => void
  readonly permissionMode: SessionDefaultPermissionMode
  readonly onChangePermissionMode: (value: string) => void
}

export type ScreenNavSettings = {
  readonly open: boolean
  readonly onOpen: () => void
  /** Esc・×・背景のどれで閉じたときも歯車へフォーカスを戻す。 */
  readonly onClose: () => void
  readonly colors: readonly ScreenNavSettingsColor[]
  readonly colorNotice: ScreenNavSettingsColorNotice
  readonly sessionDefault: ScreenNavSettingsSessionDefault
  readonly revealSpeed: ScreenNavSettingsRevealSpeed
  /** 上書きが1つも無いときは押せない（戻す先が無い）。 */
  readonly resetDisabled: boolean
  readonly onReset: () => void
  /** 帯の歯車の `<button>` を預ける口（閉じたときのフォーカスの戻り先）。 */
  readonly toggleRef: RefObject<HTMLButtonElement | null>
}

export function useSettings(): ScreenNavSettings {
  const dispatch = useSession((session) => session.dispatch)
  const sessionDefault = useSession((session) => session.state.sessionDefault)
  const modelEffortSupport = useSession((session) => session.state.modelEffortSupport)
  const color = useAppearanceColor()
  const revealSpeed = useRevealSpeedSetting()
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)

  function onOpen(): void {
    setOpen(true)
    color.clearNotice()
  }

  // `<dialog>` の `close` はどの閉じ方（Esc・×・背景）でも届くので、歯車へ戻すのはここ1箇所。
  function onClose(): void {
    setOpen(false)
    color.clearNotice()
    toggleRef.current?.focus()
  }

  /** 3つで1組なので、変えた1つに、ほかの2つはいまの値を写して送る。 */
  function sendSessionDefault(change: Partial<SessionDefault>): void {
    dispatch.session.setSessionDefault({
      model: sessionDefault.model,
      effort: sessionDefault.effort,
      permissionMode: sessionDefault.permissionMode,
      ...change,
    })
  }

  return {
    open,
    onOpen,
    onClose,
    colors: color.colors,
    colorNotice: color.colorNotice,
    resetDisabled: color.resetDisabled,
    onReset: color.onReset,
    sessionDefault: {
      model: sessionDefault.model,
      onChangeModel: (value) => {
        // 知らない値は送らない（`<select>` の選択肢の外から来たときは何もしない）。
        if (isModelAlias(value)) {
          sendSessionDefault({ model: value })
        }
      },
      effort: resolveEffortSelect(sessionDefault.model, modelEffortSupport, sessionDefault.effort),
      modelEffortSupport,
      onChangeEffort: (value) => {
        if (isEffortLevel(value)) {
          sendSessionDefault({ effort: value })
        }
      },
      permissionMode: sessionDefault.permissionMode,
      onChangePermissionMode: (value) => {
        // 「全部許す」はここを通らない（選択肢にも無い）。
        if (isSessionDefaultPermissionMode(value)) {
          sendSessionDefault({ permissionMode: value })
        }
      },
    },
    revealSpeed,
    toggleRef,
  }
}
