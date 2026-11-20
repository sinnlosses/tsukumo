// 行の名前は面の中の `<label>` と一致させる。ワークフローの面は自分で値を持つので載せない。

/** ページの名前（「既定に戻す」を持つページ）。 */
export const SETTING_FACE_LABEL = {
  look: "見た目",
  "session-default": "セッションの既定",
  reveal: "演出",
  "launch-skill": "タスクの実行",
} as const

export type SettingFaceKey = keyof typeof SETTING_FACE_LABEL

export const SETTING_ENTRIES = [
  { faceKey: "look", itemKey: "color-ground", label: "地の色" },
  { faceKey: "look", itemKey: "color-surface", label: "領域の色" },
  { faceKey: "look", itemKey: "color-ink", label: "字の色" },
  { faceKey: "look", itemKey: "veil", label: "背景の暗さ" },
  { faceKey: "look", itemKey: "blur", label: "パネルのぼかし" },
  { faceKey: "look", itemKey: "fill", label: "パネルの濃さ" },
  { faceKey: "session-default", itemKey: "model", label: "モデル" },
  { faceKey: "session-default", itemKey: "effort", label: "effort" },
  { faceKey: "session-default", itemKey: "permissionMode", label: "許可モード" },
  { faceKey: "session-default", itemKey: "figurePreference", label: "図の既定" },
  { faceKey: "session-default", itemKey: "background-recommendation", label: "おすすめ" },
  { faceKey: "session-default", itemKey: "background-welcomeGreeting", label: "迎えの一言" },
  {
    faceKey: "session-default",
    itemKey: "background-chatConsolidation",
    label: "雑談の記憶の整理",
  },
  {
    faceKey: "session-default",
    itemKey: "background-characterGeneration",
    label: "キャラクターの生成",
  },
  { faceKey: "reveal", itemKey: "revealSpeed", label: "書き上げる速さ" },
  { faceKey: "reveal", itemKey: "motion", label: "動き" },
  { faceKey: "reveal", itemKey: "waitingLine", label: "待ちの一言" },
  { faceKey: "reveal", itemKey: "progressNudge", label: "進み具合の催促" },
  { faceKey: "launch-skill", itemKey: "launchSkill", label: "起動するスキル" },
] as const satisfies readonly {
  readonly faceKey: SettingFaceKey
  readonly itemKey: string
  readonly label: string
}[]

/** 項目の名前（行ごとに1つ）。 */
export type SettingEntryKey = (typeof SETTING_ENTRIES)[number]["itemKey"]
