// 設定の面の表（`FACES`）と、紙に並べる群（`SETTINGS_GROUPS`）。
// 面は `FACES` に1行ずつ宣言し、群の `keys` に名前を足すと紙に出る。

import type { ReactElement } from "react"

import { ScreenNavSettingsAlertFace } from "./screen-nav-settings-alert.tsx"
import { ScreenNavSettingsLookFace } from "./screen-nav-settings-look.tsx"
import {
  ScreenNavSettingsLaunchSkillFace,
  ScreenNavSettingsRevealFace,
  ScreenNavSettingsSessionDefaultFace,
  type ScreenNavSettingsProps,
} from "./screen-nav-settings.tsx"

/**
 * `reset` の面は紙の末尾の「既定に戻す」で戻る値を書く。
 * `own` の面は色と関わらない値を書くので、自分の保存の帯を持つ（中身は紙が組む）。
 */
export type Face =
  | {
      readonly key: string
      readonly foot: "reset"
      readonly Body: (props: ScreenNavSettingsProps) => ReactElement
    }
  | { readonly key: string; readonly foot: "own" }

export const FACES = [
  { key: "look", Body: ScreenNavSettingsLookFace, foot: "reset" },
  { key: "session-default", Body: ScreenNavSettingsSessionDefaultFace, foot: "reset" },
  { key: "reveal", Body: ScreenNavSettingsRevealFace, foot: "reset" },
  { key: "alert", Body: ScreenNavSettingsAlertFace, foot: "reset" },
  { key: "launch-skill", Body: ScreenNavSettingsLaunchSkillFace, foot: "reset" },
  // ワークフローの値は設定（`settings`）に無く、面が自分で読み書きする。
  { key: "workflow", foot: "own" },
] satisfies readonly [Face, ...Face[]]

export type FaceKey = (typeof FACES)[number]["key"]

/** 設定の紙で並べる群。見本の順で、面の中身を群の見出しの下に1列で並べる。 */
export const SETTINGS_GROUPS = [
  { label: "動き方", keys: ["session-default"] },
  { label: "見た目", keys: ["look", "reveal"] },
  { label: "知らせ", keys: ["alert"] },
  { label: "このプロジェクト", keys: ["launch-skill", "workflow"] },
] as const satisfies readonly { readonly label: string; readonly keys: readonly FaceKey[] }[]
