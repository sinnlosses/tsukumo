// 設定のダイアログの項目ごとの「既定と違うか」「既定へ戻す押し口の title」と、ページごとの「既定に戻す」の件数。
// 現在の値と戻す動きは引数で受け、store も送信も持たない。

import {
  BUILTIN_BACKGROUND_MODELS,
  type BackgroundModelRole,
  type BackgroundModels,
} from "../../../../../shared/session/background-model.ts"
import {
  BUILTIN_GEAR_PREFERENCES,
  DEFAULT_APPEARANCE_ADJUST,
} from "../../../../../shared/session/gear-preference.ts"
import {
  BUILTIN_SESSION_DEFAULT,
  type SessionDefault,
} from "../../../../../shared/session/session-default.ts"
import {
  BUILTIN_SPEAKING_PACE,
  type SpeakingPace,
} from "../../../../../shared/session/speaking-pace.ts"
import { effortLabel } from "../../../../domain/effort-label.ts"
import { REVEAL_SPEED_LABELS } from "../../../../domain/reveal-speed.ts"
import type { SettingEntryKey, SettingFaceKey } from "../../../../domain/setting-entry.ts"
import { MODEL_LABELS } from "../../../../features/run-setting/model-label.ts"
import { PERMISSION_MODE_LABELS } from "../../../../features/run-setting/permission-mode-label.ts"
import { MOTION_PREFERENCE_LABELS } from "./motion-preference.ts"
import {
  FIGURE_PREFERENCE_LABELS,
  PROGRESS_NUDGE_LABELS,
  WAITING_LINE_LABELS,
  labelOfValue,
} from "./setting-label.ts"

/** 「既定に戻す」を持つページの key（`FACES` の `foot: "reset"` の面）。 */
export type ResetFaceKey = SettingFaceKey

/** 既定と違う項目の数と、それを既定へ戻す動き。数が 0 なら戻す先が無い。 */
export type ScreenNavSettingsReset = {
  readonly count: number
  readonly onReset: () => void
}

/** 項目1つ。既定と違うか、既定へ戻す押し口の title、その項目だけ戻す動き。 */
export type ScreenNavSettingsItem = {
  readonly changed: boolean
  readonly resetTitle: string
  readonly onReset: () => void
}

/** 項目の名前（行ごとに1つ）。宣言は `SETTING_ENTRIES`。 */
export type SettingItemKey = SettingEntryKey

type ChangeState = Pick<ScreenNavSettingsItem, "changed" | "onReset">

export type SettingItemsInput = {
  readonly colors: readonly (ChangeState & { readonly key: string })[]
  readonly adjustItems: Readonly<Record<"veil" | "blur" | "fill", ChangeState>>
  readonly sessionDefault: SessionDefault
  readonly backgroundModels: BackgroundModels
  readonly speakingPace: SpeakingPace
  readonly revealSpeed: ChangeState
  readonly motion: ChangeState
  readonly launchSkill: ChangeState
  readonly sendSessionDefault: (change: Partial<SessionDefault>) => void
  readonly changeBackgroundModel: (role: BackgroundModelRole, value: string) => void
  readonly changeWaitingLine: (value: string) => void
  readonly changeProgressNudge: (value: string) => void
}

export type SettingPageResetsInput = {
  readonly look: ScreenNavSettingsReset
  readonly sessionDefault: SessionDefault
  readonly backgroundModels: BackgroundModels
  readonly speakingPace: SpeakingPace
  readonly revealSpeed: ScreenNavSettingsReset
  readonly motion: ScreenNavSettingsReset
  readonly launchSkill: ScreenNavSettingsReset
  readonly resetSessionDefault: () => void
  readonly resetSpeakingPace: () => void
}

export function settingItems(
  input: SettingItemsInput,
): Readonly<Record<SettingItemKey, ScreenNavSettingsItem>> {
  const { sessionDefault, backgroundModels, speakingPace } = input
  const colorItem = (key: "ground" | "surface" | "ink"): ScreenNavSettingsItem => {
    const found = input.colors.find((candidate) => candidate.key === key)
    return {
      changed: found?.changed ?? false,
      resetTitle: "既定の色に戻す",
      onReset: found?.onReset ?? (() => {}),
    }
  }
  const backgroundItem = (role: BackgroundModelRole): ScreenNavSettingsItem => ({
    changed: backgroundModels[role] !== BUILTIN_BACKGROUND_MODELS[role],
    resetTitle: resetTitleOf(labelOfValue(MODEL_LABELS, BUILTIN_BACKGROUND_MODELS[role])),
    onReset: () => {
      input.changeBackgroundModel(role, BUILTIN_BACKGROUND_MODELS[role])
    },
  })
  return {
    "color-ground": colorItem("ground"),
    "color-surface": colorItem("surface"),
    "color-ink": colorItem("ink"),
    veil: {
      ...input.adjustItems.veil,
      resetTitle: resetTitleOf("パックの値"),
    },
    blur: {
      ...input.adjustItems.blur,
      resetTitle: resetTitleOf(`${String(DEFAULT_APPEARANCE_ADJUST.blur)}px`),
    },
    fill: {
      ...input.adjustItems.fill,
      resetTitle: resetTitleOf(`${String(DEFAULT_APPEARANCE_ADJUST.fill)}%`),
    },
    model: {
      changed: sessionDefault.model !== BUILTIN_SESSION_DEFAULT.model,
      resetTitle: resetTitleOf(labelOfValue(MODEL_LABELS, BUILTIN_SESSION_DEFAULT.model)),
      onReset: () => {
        input.sendSessionDefault({ model: BUILTIN_SESSION_DEFAULT.model })
      },
    },
    effort: {
      changed: sessionDefault.effort !== BUILTIN_SESSION_DEFAULT.effort,
      resetTitle: resetTitleOf(effortLabel(BUILTIN_SESSION_DEFAULT.effort)),
      onReset: () => {
        input.sendSessionDefault({ effort: BUILTIN_SESSION_DEFAULT.effort })
      },
    },
    permissionMode: {
      changed: sessionDefault.permissionMode !== BUILTIN_SESSION_DEFAULT.permissionMode,
      resetTitle: resetTitleOf(
        labelOfValue(PERMISSION_MODE_LABELS, BUILTIN_SESSION_DEFAULT.permissionMode),
      ),
      onReset: () => {
        input.sendSessionDefault({ permissionMode: BUILTIN_SESSION_DEFAULT.permissionMode })
      },
    },
    figurePreference: {
      changed: sessionDefault.figurePreference !== BUILTIN_SESSION_DEFAULT.figurePreference,
      resetTitle: resetTitleOf(
        labelOfValue(FIGURE_PREFERENCE_LABELS, BUILTIN_SESSION_DEFAULT.figurePreference),
      ),
      onReset: () => {
        input.sendSessionDefault({ figurePreference: BUILTIN_SESSION_DEFAULT.figurePreference })
      },
    },
    "background-recommendation": backgroundItem("recommendation"),
    "background-welcomeGreeting": backgroundItem("welcomeGreeting"),
    "background-chatConsolidation": backgroundItem("chatConsolidation"),
    "background-characterGeneration": backgroundItem("characterGeneration"),
    revealSpeed: {
      changed: input.revealSpeed.changed,
      resetTitle: resetTitleOf(
        labelOfValue(REVEAL_SPEED_LABELS, BUILTIN_GEAR_PREFERENCES.revealSpeed),
      ),
      onReset: input.revealSpeed.onReset,
    },
    motion: {
      changed: input.motion.changed,
      resetTitle: resetTitleOf(
        labelOfValue(MOTION_PREFERENCE_LABELS, BUILTIN_GEAR_PREFERENCES.motionPreference),
      ),
      onReset: input.motion.onReset,
    },
    waitingLine: {
      changed: speakingPace.waitingLine !== BUILTIN_SPEAKING_PACE.waitingLine,
      resetTitle: resetTitleOf(
        labelOfValue(WAITING_LINE_LABELS, BUILTIN_SPEAKING_PACE.waitingLine),
      ),
      onReset: () => {
        input.changeWaitingLine(BUILTIN_SPEAKING_PACE.waitingLine)
      },
    },
    progressNudge: {
      changed: speakingPace.progressNudge !== BUILTIN_SPEAKING_PACE.progressNudge,
      resetTitle: resetTitleOf(
        labelOfValue(PROGRESS_NUDGE_LABELS, BUILTIN_SPEAKING_PACE.progressNudge),
      ),
      onReset: () => {
        input.changeProgressNudge(BUILTIN_SPEAKING_PACE.progressNudge)
      },
    },
    launchSkill: {
      changed: input.launchSkill.changed,
      resetTitle: resetTitleOf("未設定"),
      onReset: input.launchSkill.onReset,
    },
  } satisfies Record<SettingItemKey, ScreenNavSettingsItem>
}

export function settingPageResets(
  input: SettingPageResetsInput,
): Readonly<Record<ResetFaceKey, ScreenNavSettingsReset>> {
  return {
    look: input.look,
    "session-default": {
      count:
        countDifferent(input.sessionDefault, BUILTIN_SESSION_DEFAULT) +
        countDifferent(input.backgroundModels, BUILTIN_BACKGROUND_MODELS),
      onReset: input.resetSessionDefault,
    },
    reveal: {
      count:
        input.revealSpeed.count +
        input.motion.count +
        countDifferent(input.speakingPace, BUILTIN_SPEAKING_PACE),
      onReset: () => {
        input.revealSpeed.onReset()
        input.motion.onReset()
        input.resetSpeakingPace()
      },
    },
    "launch-skill": input.launchSkill,
  } satisfies Record<ResetFaceKey, ScreenNavSettingsReset>
}

function resetTitleOf(defaultLabel: string): string {
  return `既定（${defaultLabel}）に戻す`
}

/** 同じ項目名の値のうち、既定と違うものの数。 */
function countDifferent(
  current: Readonly<Record<string, string>>,
  builtin: Readonly<Record<string, string>>,
): number {
  return Object.entries(builtin).filter(([key, value]) => current[key] !== value).length
}
