// レポートの記法（`src/server/core/report-notation.ts` がモデルに指示している class 名）を、tsukumo 側の
// 部品に解決する層。**骨格を決めるのはモデル、装飾に使う class 名を決めるのは tsukumo**という
// 分担にして、モデルが書いた文字列と CSS のセレクタが直接つながらないようにする
// （つながっていると、片方だけ足したときに黙って崩れる）。
//
// 受け持つのは規約が挙げている5系統だけ（`note` / `badge` / `cols` / `card` / `stats` / `stat`）。
// **知らない class 名と `style` 属性はそのまま残す**（この層は足し算だけで、モデルの即興
// ——規約の表に無い見せ方——を落とさない）。class 名そのものは無害で、危ない経路
// （`script` の除去・`href` のスキーム・`style` の値）は `sanitize-schema.ts` が別に見る。

import { type JSX, type ReactElement, type ReactNode } from "react"
import { type ExtraProps } from "react-markdown"

import styles from "./report-notation.module.css"

/**
 * モデルが書く class 名 → tsukumo が装飾に使う class 名（`report-notation.module.css` のもの。
 * 組み立て時にハッシュ化される）。ここに無い名前は素通しする。
 */
const NOTATION_CLASS_NAMES: ReadonlyMap<string, string | undefined> = new Map([
  ["note", styles["report-note"]],
  ["note-warn", styles["report-note-warn"]],
  ["note-ng", styles["report-note-ng"]],
  ["note-ask", styles["report-note-ask"]],
  ["note-memo", styles["report-note-memo"]],
  ["note-favor", styles["report-note-favor"]],
  ["badge", styles["report-badge"]],
  ["badge-ok", styles["report-badge-ok"]],
  ["badge-warn", styles["report-badge-warn"]],
  ["badge-ng", styles["report-badge-ng"]],
  ["cols", styles["report-cols"]],
  ["card", styles["report-card"]],
  ["stats", styles["report-stats"]],
  ["stat", styles["report-stat"]],
])

/**
 * `note` の種別（モデルが書く class 名）→ tsukumo が文字として描くラベル。**上から順に見て
 * 最初に当たったものを使う**（モデルは `class="note note-warn"` のように素の `note` と並べて
 * 書くので、種別を言っている側を先に置く。素の `note` は「情報」の受け皿なので最後）。
 */
const NOTE_LABELS = [
  ["note-warn", "注意"],
  ["note-ng", "異常"],
  ["note-ask", "疑問"],
  ["note-memo", "メモ"],
  ["note-favor", "お願い"],
  ["note", "情報"],
] as const satisfies readonly (readonly [string, string])[]

type NotationBlockProps = JSX.IntrinsicElements["div"] & ExtraProps

/**
 * レポートの `div`。5系統のうち塊の側（`note` / `cols` / `card` / `stats` / `stat`）を受け持つ。
 *
 * **`note` の種別のラベルは部品が文字として描く**（CSS の `::before` ではない）。モデルは
 * 見出しの語を書かない規約（`report-notation.ts`）なので、何の塊なのかが分かる文字を
 * 保証できるのは tsukumo 側だけで、生成した内容ではなく**器の一部**として DOM に出したほうが、
 * 選択・コピー・読み上げのどれでも本文と同じに扱える。**色だけで種別を伝えない**ための
 * 文字でもある（`docs/screen-design.md` 13.1 原則5）。
 */
export function NotationBlock(props: NotationBlockProps): ReactElement {
  const { node: _node, className, children, ...rest } = props
  const label = noteLabel(className)

  return (
    <div {...rest} className={resolveNotationClassName(className)}>
      {label !== undefined && <span className={styles["report-note-label"]}>{label}</span>}
      {children as ReactNode}
    </div>
  )
}

type NotationInlineProps = JSX.IntrinsicElements["span"] & ExtraProps

/** レポートの `span`。5系統のうち文中に置く側（`badge`）を受け持つ。 */
export function NotationInline(props: NotationInlineProps): ReactElement {
  const { node: _node, className, children, ...rest } = props

  return (
    <span {...rest} className={resolveNotationClassName(className)}>
      {children as ReactNode}
    </span>
  )
}

/** class 名を1つずつ見て、知っているものだけ tsukumo の class 名に置き換える（並びは変えない）。 */
function resolveNotationClassName(className: string | undefined): string | undefined {
  if (className === undefined) {
    return undefined
  }

  return classNameTokens(className)
    .map((token) => NOTATION_CLASS_NAMES.get(token) ?? token)
    .join(" ")
}

/** `note` の塊なら種別のラベルを、そうでなければ何も返さない（`cols` などにはラベルを足さない）。 */
function noteLabel(className: string | undefined): string | undefined {
  if (className === undefined) {
    return undefined
  }

  const tokens = classNameTokens(className)

  return NOTE_LABELS.find(([name]) => tokens.includes(name))?.[1]
}

function classNameTokens(className: string): readonly string[] {
  return className.split(/\s+/).filter((token) => token.length > 0)
}
