// 「タスクの実行」で呼ぶスキルの名前を `localStorage` に持つ。
// 読めない・欠けている値は空へ畳み、空は「固定の文面で送る」を意味する。
// 「/」の付け外しと使える文字の検査は、文面を組む `requestPromptOf` が持つ。

import { z } from "zod"

import { localPreference, RAW_STRING_CODEC } from "../utils/local-preference.ts"

/** 未設定（固定の文面で送る）。 */
export const DEFAULT_LAUNCH_SKILL = ""

const preference = localPreference(
  "tsukumo-launch-skill:v1",
  z.string(),
  DEFAULT_LAUNCH_SKILL,
  RAW_STRING_CODEC,
)

export const loadLaunchSkill = preference.load
export const saveLaunchSkill = preference.save
