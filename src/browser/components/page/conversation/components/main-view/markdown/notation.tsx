// レポートの記法（`REPORT_NOTATION_PROMPT` がモデルに指示している class 名）を、tsukumo 側の部品に解決する層。
// 骨格を決めるのはモデル、装飾に使う class 名を決めるのは tsukumo という分担にして、モデルが書いた文字列と CSS のセレクタが直接つながらないようにする（つながっていると、片方だけ足したときに黙って崩れる）。
//
// 受け持つのは記法が挙げている5系統（`note` / `badge` / `cols` / `card` / `stats` / `stat`）と、
// tsukumo が組む `ol` / `li`（`progress` の段の並び）。
// 知らない class 名と `style` 属性はそのまま残す（この層は足し算だけで、記法の表に無いモデルの即興を落とさない）。
// class 名そのものは無害で、危ない経路（`script` の除去・`href` のスキーム・`style` の値）は `REPORT_SANITIZE_SCHEMA` が別に見る。

import type { JSX, ReactElement } from "react"
import type { ExtraProps } from "react-markdown"

import {
  REPORT_DRAWN_MARK_NAMES,
  REPORT_NOTATION_NAMES,
  REPORT_NOTE_KINDS,
} from "../../../../../../../shared/report/report-notation.ts"
import { Text } from "../../../../../ui/text/text.tsx"
import styles from "./report-notation.module.css"

/**
 * モデルが書く class 名 → tsukumo が装飾に使う class 名（report-notation.module.css のもの。組み立て時にハッシュ化される）。
 * ここに無い名前は素通しする。
 * 印の名前の集合は `REPORT_NOTATION_NAMES` が持つ（`report-<名前>` が CSS 側の綴りの規則）。
 * tsukumo が組む印（検証結果のカード）も同じ表で解決する。
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

type NotationBlockProps = JSX.IntrinsicElements["div"] & ExtraProps

/**
 * レポートの `div`。5系統のうち塊の側（`note` / `cols` / `card` / `stats` / `stat`）を受け持つ。
 *
 * `note` の種別のラベルは部品が文字として描く（CSS の `::before` ではない）。
 * モデルは見出しの語を書かない記法なので、何の塊なのかが分かる文字を保証できるのは tsukumo 側だけ。
 * 器の一部として DOM に出したほうが、選択・コピー・読み上げのどれでも本文と同じに扱える。
 */
export function NotationBlock(props: NotationBlockProps): ReactElement {
  const { node: _node, className, children, ...rest } = props
  const label = noteLabel(className)

  return (
    <div {...rest} className={resolveNotationClassName(className)}>
      {label !== undefined && (
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["report-note-label"]}
        >
          {label}
        </Text>
      )}
      {children}
    </div>
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

/** レポートの `ol`（`progress` の段の並び）。 */
export function NotationOrderedList(props: NotationOrderedListProps): ReactElement {
  const { node: _node, className, children, ...rest } = props

  return (
    <ol {...rest} className={resolveNotationClassName(className)}>
      {children}
    </ol>
  )
}

type NotationListItemProps = JSX.IntrinsicElements["li"] & ExtraProps

/** レポートの `li`（`progress` の段・段の間の線）。 */
export function NotationListItem(props: NotationListItemProps): ReactElement {
  const { node: _node, className, children, ...rest } = props

  return (
    <li {...rest} className={resolveNotationClassName(className)}>
      {children}
    </li>
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
