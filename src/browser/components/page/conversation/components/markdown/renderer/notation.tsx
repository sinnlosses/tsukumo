// レポートの記法（`REPORT_NOTATION_PROMPT` がモデルに指示している class 名）を、tsukumo 側の部品に解決する層。
// 骨格を決めるのはモデル、装飾に使う class 名を決めるのは tsukumo という分担にして、モデルが書いた文字列と CSS のセレクタが直接つながらないようにする（つながっていると、片方だけ足したときに黙って崩れる）。
//
// 受け持つのは記法が挙げている5系統（`note` / `badge` / `cols` / `card` / `stats` / `stat`）と、
// tsukumo が組む `ol` / `li`（段の並び・連鎖・説明の並び）。
// 知らない class 名と `style` 属性はそのまま残す（この層は足し算だけで、記法の表に無いモデルの即興を落とさない）。
// class 名そのものは無害で、危ない経路（`script` の除去・`href` のスキーム）は `REPORT_SANITIZE_SCHEMA` が、`style` の値は `rehypeStyleAllowlist` が別に見る。

import type { Element } from "hast"
import type { JSX, ReactElement } from "react"
import type { ExtraProps } from "react-markdown"

import {
  REPORT_DRAWN_MARK_NAMES,
  REPORT_NOTATION_NAMES,
  REPORT_NOTE_KINDS,
} from "../../../../../../../shared/report/report-notation.ts"
import { ZoomableSvgFigure } from "./figure-zoom.tsx"
import { NoteLabel } from "./note-label.tsx"
import { BeforeAfterSwap } from "./report-image.tsx"
import styles from "./report-notation.module.css"

/**
 * モデルが書く class 名 → tsukumo が装飾に使う class 名（report-notation.module.css のもの。組み立て時にハッシュ化される）。
 * ここに無い名前は素通しする。
 * 印の名前の集合は `REPORT_NOTATION_NAMES` が持つ（`report-<名前>` が CSS 側の綴りの規則）。
 * tsukumo が組む印（検証結果の塊）も同じ表で解決する。
 */
const NOTATION_CLASS_NAMES: ReadonlyMap<string, string> = new Map(
  [...REPORT_NOTATION_NAMES, ...REPORT_DRAWN_MARK_NAMES].map((name) => [
    name,
    styles[`report-${name}`],
  ]),
)

/**
 * `note` の種別（モデルが書く class 名）→ tsukumo が文字として描くラベル。
 * 上から順に見て最初に当たったものを使う（並びの理由は `REPORT_NOTE_KINDS`）。
 */
const NOTE_LABELS = REPORT_NOTE_KINDS

/** 項目数の class（`<名前>-of-<項目数>`）を足す塊。 */
const COUNTED_BLOCKS = ["stats", "cols"] as const

/** 書き上げる演出（`planReveal`）が題の行を見分ける印の属性。class はハッシュ名になり domain の層から選べない。 */
const REVEAL_CAPTION_ATTRIBUTE = "data-reveal-caption"

/** 書き上げる演出が余白の柱（傍注の並び）を見分ける印の属性。余白の柱は最初から出す。 */
const REVEAL_GUTTER_ATTRIBUTE = "data-reveal-gutter"

type NotationBlockProps = JSX.IntrinsicElements["div"] & ExtraProps

/**
 * レポートの `div`。5系統のうち塊の側（`note` / `stats` / `stat` と、過去の記録に残る `cols` / `card`）を受け持つ。
 *
 * `note` の種別のラベルは部品が文字として描く（CSS の `::before` ではない）。
 * モデルは見出しの語を書かない記法なので、何の塊なのかが分かる文字を保証できるのは tsukumo 側だけ。
 * 器の一部として DOM に出したほうが、選択・コピー・読み上げのどれでも本文と同じに扱える。
 */
export function NotationBlock(props: NotationBlockProps): ReactElement {
  const { node, className: writtenClassName, children, ...rest } = props
  const className = withItemCountClass(writtenClassName, node)
  const kind = noteKind(className)
  const kindName = kind?.[0]
  const label = kind?.[1]

  if (className !== undefined && classNameTokens(className).includes("before-after-swap")) {
    return (
      <BeforeAfterSwap className={resolveNotationClassName(className)}>{children}</BeforeAfterSwap>
    )
  }

  if (className !== undefined && classNameTokens(className).includes("svg-figure")) {
    return (
      <ZoomableSvgFigure className={resolveNotationClassName(className)}>
        {children}
      </ZoomableSvgFigure>
    )
  }

  const isCaption = className !== undefined && classNameTokens(className).includes("caption")
  const isGutter = className !== undefined && classNameTokens(className).includes("gutter")

  return (
    <div
      {...rest}
      {...(isCaption ? { [REVEAL_CAPTION_ATTRIBUTE]: "" } : {})}
      {...(isGutter ? { [REVEAL_GUTTER_ATTRIBUTE]: "" } : {})}
      className={resolveNotationClassName(className)}
    >
      {label !== undefined && <NoteLabel kindName={kindName} label={label} />}
      {children}
    </div>
  )
}

type NotationAsideProps = JSX.IntrinsicElements["aside"] & ExtraProps

/** レポートの `aside`（余白の柱の傍注1つ）。 */
export function NotationAside(props: NotationAsideProps): ReactElement {
  const { node: _node, className, children, ...rest } = props

  return (
    <aside {...rest} className={resolveNotationClassName(className)}>
      {children}
    </aside>
  )
}

type NotationInlineProps = JSX.IntrinsicElements["span"] & ExtraProps

/** レポートの `span`。5系統のうち文中に置く側（`badge`）を受け持つ。 */
export function NotationInline(props: NotationInlineProps): ReactElement {
  const { node: _node, className, children, ...rest } = props

  return (
    <span {...rest} className={resolveNotationClassName(className)}>
      {children}
    </span>
  )
}

type NotationOrderedListProps = JSX.IntrinsicElements["ol"] & ExtraProps

/** レポートの `ol`（`flow` の段の並び・連鎖・画像の説明の並び）。 */
export function NotationOrderedList(props: NotationOrderedListProps): ReactElement {
  const { node: _node, className, children, ...rest } = props

  return (
    <ol {...rest} className={resolveNotationClassName(className)}>
      {children}
    </ol>
  )
}

type NotationListItemProps = JSX.IntrinsicElements["li"] & ExtraProps

/** レポートの `li`（`flow` の段・連鎖のカード・画像の説明）。 */
export function NotationListItem(props: NotationListItemProps): ReactElement {
  const { node: _node, className, children, ...rest } = props

  return (
    <li {...rest} className={resolveNotationClassName(className)}>
      {children}
    </li>
  )
}

/** 列数を項目数で決める塊（`stats` / `cols`）が、列数の決まりを持つ項目数のとき `<名前>-of-<項目数>` を class に足す。 */
function withItemCountClass(
  className: string | undefined,
  node: Element | undefined,
): string | undefined {
  if (className === undefined || node === undefined) {
    return className
  }

  const tokens = classNameTokens(className)
  const name = COUNTED_BLOCKS.find((counted) => tokens.includes(counted))
  if (name === undefined) {
    return className
  }

  const itemCount = node.children.filter((child) => child.type === "element").length
  const countClass = `${name}-of-${itemCount}`

  return NOTATION_CLASS_NAMES.has(countClass) ? `${className} ${countClass}` : className
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
function noteKind(className: string | undefined): (typeof NOTE_LABELS)[number] | undefined {
  if (className === undefined) {
    return undefined
  }

  const tokens = classNameTokens(className)

  return NOTE_LABELS.find(([name]) => tokens.includes(name))
}

function classNameTokens(className: string): readonly string[] {
  return className.split(/\s+/).filter((token) => token.length > 0)
}
