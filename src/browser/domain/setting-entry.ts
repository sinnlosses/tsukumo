// 行の名前は面の中の `<label>` と一致させる。ワークフローの面は自分で値を持つので載せない。
// 行の名前の下に出す説明（description）はここだけに書く。数値の範囲や既定の値は実物から読めるので文に入れない。

/** ページの名前（「既定に戻す」を持つページ）。 */
export const SETTING_FACE_LABEL = {
  look: "見た目",
  "session-default": "新しいセッション",
  reveal: "演出",
  "launch-skill": "タスクの実行",
} as const

export type SettingFaceKey = keyof typeof SETTING_FACE_LABEL

export const SETTING_ENTRIES = [
  {
    faceKey: "look",
    itemKey: "color-ground",
    label: "地の色",
    description: "画面のいちばん奥の色",
  },
  {
    faceKey: "look",
    itemKey: "color-surface",
    label: "領域の色",
    description: "紙・入力欄・パネルの地の色",
  },
  {
    faceKey: "look",
    itemKey: "color-ink",
    label: "字の色",
    description: "本文の字の色。地との差が足りない色は受け取らず、理由を出す",
  },
  {
    faceKey: "look",
    itemKey: "veil",
    label: "背景の暗さ",
    description: "背景の絵に掛ける暗幕。既定の濃さはキャラクターごとに決まっている",
  },
  {
    faceKey: "look",
    itemKey: "blur",
    label: "パネルのぼかし",
    description: "パネルの後ろの背景をぼかす量",
  },
  {
    faceKey: "look",
    itemKey: "fill",
    label: "パネルの濃さ",
    description: "パネルの地の不透明さ",
  },
  {
    faceKey: "session-default",
    itemKey: "model",
    label: "モデル",
    description: "新しいセッションで最初に使うモデル。入力欄でセッションごとに変えられる",
  },
  {
    faceKey: "session-default",
    itemKey: "effort",
    label: "effort（考える深さ）",
    description: "深いほど答えが遅く、使用量も増える",
  },
  {
    faceKey: "session-default",
    itemKey: "permissionMode",
    label: "許可モード",
    description: "ファイルの書き換えやコマンドを、聞いてから行うか自動で判定するか",
  },
  {
    faceKey: "session-default",
    itemKey: "figurePreference",
    label: "図の既定",
    description: "レポートに図を置くか、文を主にするか",
  },
  {
    faceKey: "session-default",
    itemKey: "background-recommendation",
    label: "おすすめ",
    description: "サイドバーの「次のタスク」の理由の文を作るモデル",
  },
  {
    faceKey: "session-default",
    itemKey: "background-welcomeGreeting",
    label: "迎えの一言",
    description: "起動したときにキャラクターが言う一言を作るモデル",
  },
  {
    faceKey: "session-default",
    itemKey: "background-chatConsolidation",
    label: "雑談の記憶の整理",
    description: "雑談のあらすじと「覚えたこと」をまとめるモデル",
  },
  {
    faceKey: "session-default",
    itemKey: "background-characterGeneration",
    label: "キャラクターの生成",
    description: "キャラクター画面で新しいキャラクターを作るモデル",
  },
  {
    faceKey: "reveal",
    itemKey: "revealSpeed",
    label: "書き上げる速さ",
    description: "レポートとセリフを書き上げる演出の速さ",
  },
  {
    faceKey: "reveal",
    itemKey: "motion",
    label: "動き",
    description: "立ち絵や点々の常時の動きを減らすか",
  },
  {
    faceKey: "reveal",
    itemKey: "waitingLine",
    label: "待ちの一言",
    description: "作業が終わってきみが黙っているとき、次の一手を言うまでの間",
  },
  {
    faceKey: "reveal",
    itemKey: "progressNudge",
    label: "進み具合の催促",
    description: "作業が長引いてセリフが途切れたとき、様子を話すよう促すまでの間",
  },
  {
    faceKey: "launch-skill",
    itemKey: "launchSkill",
    label: "起動するスキル",
    description: "タスクの実行で呼ぶスキル。未設定なら「タスク GH-xxxx を進めて」と送る",
  },
] as const satisfies readonly {
  readonly faceKey: SettingFaceKey
  readonly itemKey: string
  readonly label: string
  readonly description: string
}[]

/** 項目の名前（行ごとに1つ）。 */
export type SettingEntryKey = (typeof SETTING_ENTRIES)[number]["itemKey"]
