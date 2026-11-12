// 見本帳が並べるデザイントークン。値は `theme.css` が持ち、ここは名前と使い分けの一言だけを持つ。

type TokenEntry = { readonly name: string; readonly use: string }

export const COLOR_TOKENS = [
  { name: "--ground", use: "画面の地・舞台の地" },
  { name: "--surface", use: "箱の地・紙の地" },
  { name: "--surface-float", use: "紙の上に浮く面" },
  { name: "--surface-raised", use: "浮いた箱の地・持ち上げ" },
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
  { name: "--font-heading-2", use: "紙の節の見出し" },
  { name: "--font-heading-1", use: "重ねる紙の題" },
  { name: "--font-lead", use: "紙の頭の一文" },
] as const satisfies readonly TokenEntry[]

export const FAMILY_TOKENS = [
  { name: "--font-sans", use: "本文・見出し" },
  { name: "--font-voice", use: "セリフ" },
  { name: "--font-mono", use: "ID・キー・時刻" },
] as const satisfies readonly TokenEntry[]

export const SPACE_TOKENS = [
  { name: "--space-2xs", use: "罫と字のあいだ・印の上下" },
  { name: "--space-xs", use: "字と字・小さな部品の内側" },
  { name: "--space-sm", use: "部品の内側の標準" },
  { name: "--space-md", use: "箱の内側の標準・群と群のあいだ" },
  { name: "--space-lg", use: "区画のあいだ" },
  { name: "--space-xl", use: "大きな区画のあいだ" },
  { name: "--space-2xl", use: "領域と領域のあいだ" },
  { name: "--space-3xl", use: "画面の区切り・大きな領域の内側" },
  { name: "--space-4xl", use: "ページの上下の余白" },
] as const satisfies readonly TokenEntry[]

export const RADIUS_TOKENS = [
  { name: "--radius-sm", use: "印・コードの欄" },
  { name: "--radius-md", use: "ボタン・入力欄" },
  { name: "--radius-lg", use: "箱・区画" },
  { name: "--radius-xl", use: "ダイアログ" },
  { name: "--radius-pill", use: "丸いバッジ" },
  { name: "--radius-round", use: "丸" },
] as const satisfies readonly TokenEntry[]

export const SHADOW_TOKENS = [
  { name: "--shadow-raised", use: "メニュー・浮かぶカード" },
  { name: "--shadow-overlay", use: "ダイアログ・引き出し" },
  { name: "--shadow-sheet", use: "舞台の上の紙" },
  { name: "--shadow-ring", use: "選んでいる目印の輪" },
] as const satisfies readonly TokenEntry[]

export const MOTION_TOKENS = [
  { name: "--motion-fast", use: "hover・色の切り替え" },
  { name: "--motion-base", use: "開閉・寄り" },
  { name: "--motion-enter", use: "吹き出し・紙が入る" },
  { name: "--motion-shift", use: "器の姿勢が変わる" },
] as const satisfies readonly TokenEntry[]

export const EASING_TOKENS = [
  { name: "--motion-ease", use: "入る動きの緩急" },
] as const satisfies readonly TokenEntry[]
