// 帯の右端の歯車で開く設定のロジック。
// 画面の色と演出の速さは別のフックが持ち、ここは開閉と新しいセッションの既定を持って束ねる。
//
// - 既定はサーバが覚える値（`~/.tsukumo/state.json`。`session.setSessionDefault` で送り、`SessionState.sessionDefault` を読む）
//
// 既定は次に起こすときから効くので、送ってもいまのセッションのモデル・許可モードは変わらない（帯のドロップダウンはセッション限りの別物）。
//
// 開閉は `useSettingsRequest` に持ち、開閉のたびに色の注意書きを消す。

import { useRef, type RefObject } from "react"

import type {
  BackgroundModelRole,
  BackgroundModels,
} from "../../../../../shared/session/background-model.ts"
import { BUILTIN_BACKGROUND_MODELS } from "../../../../../shared/session/background-model.ts"
import {
  isEffortLevel,
  isModelAlias,
  type ModelAlias,
} from "../../../../../shared/session/run-setting-value.ts"
import {
  BUILTIN_SESSION_DEFAULT,
  isFigurePreference,
  isSessionDefaultPermissionMode,
  type FigurePreference,
  type SessionDefault,
  type SessionDefaultPermissionMode,
} from "../../../../../shared/session/session-default.ts"
import type { ModelEffortSupport } from "../../../../../shared/session/session-event-setting.ts"
import {
  BUILTIN_SPEAKING_PACE,
  isProgressNudgeSilence,
  isWaitingLineDelay,
  type SpeakingPace,
} from "../../../../../shared/session/speaking-pace.ts"
import type { AppearanceTheme } from "../../../../domain/appearance-color.ts"
import { resolveEffortSelect, type EffortSelect } from "../../../../domain/effort-label.ts"
import { useFirstNoteSeen } from "../../../../stores/first-note-seen.ts"
import { useSession } from "../../../../stores/session.ts"
import { useSettingsRequest } from "../../../../stores/settings-request.ts"
import {
  settingItems,
  settingPageResets,
  type ResetFaceKey,
  type ScreenNavSettingsItem,
  type ScreenNavSettingsReset,
  type SettingItemKey,
} from "../domain/settings-item.ts"
import { useAppearanceAdjust, type ScreenNavSettingsAdjust } from "./use-appearance-adjust.ts"
import {
  useAppearanceColor,
  type ScreenNavSettingsColor,
  type ScreenNavSettingsColorNotice,
} from "./use-appearance-color.ts"
import {
  useLaunchSkillSetting,
  type ScreenNavSettingsLaunchSkill,
} from "./use-launch-skill-setting.ts"
import {
  useMotionPreferenceSetting,
  type ScreenNavSettingsMotion,
} from "./use-motion-preference-setting.ts"
import {
  useRevealSpeedSetting,
  type ScreenNavSettingsRevealSpeed,
} from "./use-reveal-speed-setting.ts"

export type {
  ResetFaceKey,
  ScreenNavSettingsItem,
  ScreenNavSettingsReset,
  SettingItemKey,
} from "../domain/settings-item.ts"

/** 新しいセッションの既定の操作子。表示はサーバから届いた値だけに従い、押した側へ先に倒さない。 */
type ScreenNavSettingsSessionDefault = {
  readonly model: ModelAlias
  readonly onChangeModel: (value: string) => void
  /**
   * effort。帯の判定（`resolveEffortSelect`）をそのまま使う。
   * 対応表（`modelEffortSupport`）は駆動が起動直後に届けるモデル横断の一覧なので、ここで選んでいる既定のモデルの対応も同じ関数で引ける。
   */
  readonly effort: EffortSelect
  /** モデルの吊り下げのカードの行に「effort なし」を添えるための対応表。 */
  readonly modelEffortSupport: readonly ModelEffortSupport[]
  readonly onChangeEffort: (value: string) => void
  readonly permissionMode: SessionDefaultPermissionMode
  readonly onChangePermissionMode: (value: string) => void
  readonly figurePreference: FigurePreference
  readonly onChangeFigurePreference: (value: string) => void
}

/** 裏方のモデルの操作子。表示はサーバから届いた値だけに従い、押した側へ先に倒さない。 */
type ScreenNavSettingsBackgroundModels = {
  readonly values: BackgroundModels
  readonly onChange: (role: BackgroundModelRole, value: string) => void
}

/** 話しかける間合いの操作子。表示はサーバから届いた覚えた値だけに従う。 */
type ScreenNavSettingsSpeakingPace = {
  readonly values: SpeakingPace
  readonly onChangeWaitingLine: (value: string) => void
  readonly onChangeProgressNudge: (value: string) => void
}

export type ScreenNavSettings = {
  readonly open: boolean
  readonly onOpen: () => void
  /** Esc・×・背景のどれで閉じたときも歯車へフォーカスを戻す。 */
  readonly onClose: () => void
  readonly colors: readonly ScreenNavSettingsColor[]
  readonly colorNotice: ScreenNavSettingsColorNotice
  readonly themeId: AppearanceTheme["id"] | "custom"
  readonly onChooseTheme: (theme: AppearanceTheme) => void
  readonly adjust: ScreenNavSettingsAdjust
  readonly sessionDefault: ScreenNavSettingsSessionDefault
  readonly backgroundModels: ScreenNavSettingsBackgroundModels
  readonly speakingPace: ScreenNavSettingsSpeakingPace
  readonly revealSpeed: ScreenNavSettingsRevealSpeed
  readonly motion: ScreenNavSettingsMotion
  readonly launchSkill: ScreenNavSettingsLaunchSkill
  /** 覚えた「初回の説明を見た」を消し、説明をまた初回として出す。 */
  readonly onReplayFirstNotes: () => void
  /** 「既定に戻す」を持つページごとの口。 */
  readonly pageReset: Readonly<Record<ResetFaceKey, ScreenNavSettingsReset>>
  /** 項目ごとの「既定と違うか」と戻す口。 */
  readonly items: Readonly<Record<SettingItemKey, ScreenNavSettingsItem>>
  /** 全ページをまとめて戻す口。 */
  readonly resetAll: ScreenNavSettingsReset
  /** 帯の歯車の `<button>` を預ける口（閉じたときのフォーカスの戻り先）。 */
  readonly toggleRef: RefObject<HTMLButtonElement | null>
}

export function useSettings(): ScreenNavSettings {
  const dispatch = useSession((session) => session.dispatch)
  const sessionDefault = useSession((session) => session.state.sessionDefault)
  const backgroundModels = useSession((session) => session.state.backgroundModels)
  const speakingPace = useSession((session) => session.state.speakingPace.remembered)
  const modelEffortSupport = useSession((session) => session.state.modelEffortSupport)
  const color = useAppearanceColor()
  const adjust = useAppearanceAdjust()
  const revealSpeed = useRevealSpeedSetting()
  const motion = useMotionPreferenceSetting()
  const launchSkill = useLaunchSkillSetting()
  const resetFirstNotes = useFirstNoteSeen((state) => state.resetAll)
  const open = useSettingsRequest((state) => state.open)
  const openSettings = useSettingsRequest((state) => state.openSettings)
  const closeSettings = useSettingsRequest((state) => state.closeSettings)
  const toggleRef = useRef<HTMLButtonElement>(null)

  function onOpen(): void {
    openSettings()
    color.clearNotice()
  }

  // `<dialog>` の `close` はどの閉じ方（Esc・×・背景）でも届くので、歯車へ戻すのはここ1箇所。
  function onClose(): void {
    closeSettings()
    color.clearNotice()
    toggleRef.current?.focus()
  }

  /** 4つで1組なので、変えた1つに、ほかの3つはいまの値を写して送る。 */
  function sendSessionDefault(change: Partial<SessionDefault>): void {
    void dispatch.session.setSessionDefault({
      model: sessionDefault.model,
      effort: sessionDefault.effort,
      permissionMode: sessionDefault.permissionMode,
      figurePreference: sessionDefault.figurePreference,
      ...change,
    })
  }

  /** 4つで1組なので、変えた1役に、ほかの3役はいまの値を写して送る。 */
  function onChangeBackgroundModel(role: BackgroundModelRole, value: string): void {
    // 知らない値は送らない（`<select>` の選択肢の外から来たときは何もしない）。
    if (isModelAlias(value)) {
      void dispatch.session.setBackgroundModels({ ...backgroundModels, [role]: value })
    }
  }

  /** 2つで1組なので、変えた1つに、もう1つはいまの値を写して送る。知らない値は送らない。 */
  function onChangeWaitingLine(value: string): void {
    if (isWaitingLineDelay(value)) {
      void dispatch.session.setSpeakingPace({ ...speakingPace, waitingLine: value })
    }
  }

  function onChangeProgressNudge(value: string): void {
    if (isProgressNudgeSilence(value)) {
      void dispatch.session.setSpeakingPace({ ...speakingPace, progressNudge: value })
    }
  }

  const pageReset = settingPageResets({
    look: {
      count: color.changedCount + adjust.changedCount,
      onReset: () => {
        color.onReset()
        adjust.onReset()
      },
    },
    sessionDefault,
    backgroundModels,
    speakingPace,
    revealSpeed: { count: revealSpeed.changedCount, onReset: revealSpeed.onReset },
    motion: { count: motion.changedCount, onReset: motion.onReset },
    launchSkill: { count: launchSkill.changedCount, onReset: launchSkill.onReset },
    resetSessionDefault: () => {
      void dispatch.session.setSessionDefault(BUILTIN_SESSION_DEFAULT)
      void dispatch.session.setBackgroundModels(BUILTIN_BACKGROUND_MODELS)
    },
    resetSpeakingPace: () => {
      void dispatch.session.setSpeakingPace(BUILTIN_SPEAKING_PACE)
    },
  })

  const items = settingItems({
    colors: color.colors,
    adjustItems: adjust.items,
    sessionDefault,
    backgroundModels,
    speakingPace,
    revealSpeed: { changed: revealSpeed.changedCount > 0, onReset: revealSpeed.onReset },
    motion: { changed: motion.changedCount > 0, onReset: motion.onReset },
    launchSkill: { changed: launchSkill.changedCount > 0, onReset: launchSkill.onReset },
    sendSessionDefault,
    changeBackgroundModel: onChangeBackgroundModel,
    changeWaitingLine: onChangeWaitingLine,
    changeProgressNudge: onChangeProgressNudge,
  })

  return {
    open,
    onOpen,
    onClose,
    items,
    colors: color.colors,
    colorNotice: color.colorNotice,
    themeId: color.themeId,
    onChooseTheme: color.onChooseTheme,
    adjust: adjust.adjust,
    pageReset,
    resetAll: {
      count: Object.values(pageReset).reduce((sum, page) => sum + page.count, 0),
      onReset: () => {
        for (const page of Object.values(pageReset)) {
          page.onReset()
        }
      },
    },
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
      figurePreference: sessionDefault.figurePreference,
      onChangeFigurePreference: (value) => {
        if (isFigurePreference(value)) {
          sendSessionDefault({ figurePreference: value })
        }
      },
    },
    backgroundModels: { values: backgroundModels, onChange: onChangeBackgroundModel },
    speakingPace: { values: speakingPace, onChangeWaitingLine, onChangeProgressNudge },
    revealSpeed: revealSpeed.revealSpeed,
    motion: motion.motion,
    launchSkill: launchSkill.launchSkill,
    onReplayFirstNotes: resetFirstNotes,
    toggleRef,
  }
}
