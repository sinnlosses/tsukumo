// 見本帳が並べるデザイントークン。値は `theme.css` が持ち、ここは名前と使い分けの一言だけを持つ。

type TokenEntry = { readonly name: string; readonly use: string }

export const COLOR_TOKENS = [
  { name: "--ground", use: "画面の地" },
  { name: "--surface", use: "箱の地" },
  { name: "--surface-raised", use: "浮いた箱の地" },
  { name: "--surface-accent", use: "キャラクターの色を載せた箱の地" },
  { name: "--ink", use: "本文の字" },
  { name: "--ink-soft", use: "やわらかい字" },
  { name: "--ink-quiet", use: "控えめな字" },
  { name: "--ink-bright", use: "強調の字" },
  { name: "--accent", use: "キャラクターの色" },
  { name: "--state-ok", use: "うまくいった" },
  { name: "--state-warn", use: "注意" },
  { name: "--state-ng", use: "失敗" },
  { name: "--state-info", use: "知らせ" },
  { name: "--state-ask", use: "お伺い" },
  { name: "--state-memo", use: "メモ" },
  { name: "--rule", use: "罫（強）" },
  { name: "--rule-soft", use: "罫（中）" },
  { name: "--rule-quiet", use: "罫（弱）" },
] as const satisfies readonly TokenEntry[]

export const FONT_TOKENS = [
  { name: "--font-label", use: "ラベル" },
  { name: "--font-action", use: "操作" },
  { name: "--font-secondary", use: "補足" },
  { name: "--font-subheading", use: "小見出し" },
  { name: "--font-body", use: "本文" },
  { name: "--font-heading", use: "見出し" },
] as const satisfies readonly TokenEntry[]

export const SPACE_TOKENS = [
  { name: "--space-2xs", use: "罫と字のあいだ・印の上下" },
  { name: "--space-xs", use: "字と字・小さな部品の内側" },
  { name: "--space-sm", use: "部品の内側の標準" },
  { name: "--space-md", use: "箱の内側の標準・群と群のあいだ" },
  { name: "--space-lg", use: "区画のあいだ" },
  { name: "--space-xl", use: "大きな区画のあいだ" },
  { name: "--space-2xl", use: "領域と領域のあいだ" },
] as const satisfies readonly TokenEntry[]

export const RADIUS_TOKENS = [
  { name: "--radius-sm", use: "印・コードの欄" },
  { name: "--radius-md", use: "ボタン・入力欄" },
  { name: "--radius-lg", use: "箱・区画" },
  { name: "--radius-xl", use: "ダイアログ" },
  { name: "--radius-pill", use: "丸い札" },
  { name: "--radius-round", use: "丸" },
] as const satisfies readonly TokenEntry[]

export const SHADOW_TOKENS = [
  { name: "--shadow-raised", use: "メニュー・浮かぶ札" },
  { name: "--shadow-overlay", use: "ダイアログ・引き出し" },
  { name: "--shadow-ring", use: "選んでいる目印の輪" },
] as const satisfies readonly TokenEntry[]

export const MOTION_TOKENS = [
  { name: "--motion-fast", use: "hover・色の切り替え" },
  { name: "--motion-base", use: "開閉・出入り" },
] as const satisfies readonly TokenEntry[]
