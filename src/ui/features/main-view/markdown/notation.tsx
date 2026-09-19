// レポートの記法（`src/core/report-notation.ts` がモデルに指示している class 名）を、tsukumo 側の
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

import styles from "../main-view.module.css"

/**
 * モデルが書く class 名 → tsukumo が装飾に使う class 名（`main-view.module.css` のもの。
 * 組み立て時にハッシュ化される）。ここに無い名前は素通しする。
 */
const NOTATION_CLASS_NAMES: ReadonlyMap<string, string | undefined> = new Map([
  ["note", styles["report-note"]],
  ["note-warn", styles["report-note-warn"]],
  ["note-ng", styles["report-note-ng"]],
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

/** お願い（`docs/glossary.md`「お願い」）の class 名と、tsukumo が付けるラベル。 */
const FAVOR_CLASS_NAME = "note-favor"
const FAVOR_LABEL = "お願い"

type NotationBlockProps = JSX.IntrinsicElements["div"] & ExtraProps

/**
 * レポートの `div`。5系統のうち塊の側（`note` / `cols` / `card` / `stats` / `stat`）を受け持つ。
 *
 * **お願いのラベルは部品が文字として描く**（CSS の `::before` ではない）。モデルは見出しの語を
 * 書かない規約（`report-notation.ts`）なので、「お願い」だと分かる文字を保証できるのは
 * tsukumo 側だけで、生成した内容ではなく**器の一部**として DOM に出したほうが、選択・コピー・
 * 読み上げのどれでも本文と同じに扱える。
 */
export function NotationBlock(props: NotationBlockProps): ReactElement {
  const { node: _node, className, children, ...rest } = props
  const resolved = resolveNotationClassName(className)

  if (isFavor(className)) {
    return (
      <div {...rest} className={resolved}>
        <span className={styles["report-note-favor-label"]}>{FAVOR_LABEL}</span>
        {children as ReactNode}
      </div>
    )
  }

  return (
    <div {...rest} className={resolved}>
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

function isFavor(className: string | undefined): boolean {
  return className !== undefined && classNameTokens(className).includes(FAVOR_CLASS_NAME)
}

function classNameTokens(className: string): readonly string[] {
  return className.split(/\s+/).filter((token) => token.length > 0)
}
