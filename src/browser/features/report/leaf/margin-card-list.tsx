// 指した単位の横の余白に並べる札。単位ごとに1枚で、聞いた対・頼んだ付箋・開いた入力欄をまとめる。
// 札の上端は指した単位の上端で、前の札と重なる分の下へのずらしは本文の根が測って渡す。

import type { ReactElement } from "react"
import { sortBy } from "remeda"

import { Button } from "../../../components/ui/button/button.tsx"
import type { AskPair } from "../domain/ask-thread.ts"
import { AskThreadView } from "./ask-thread-view.tsx"
import styles from "./leaf.module.css"
import { type NumberedNote, ReplyNoteCard } from "./reply-note-card.tsx"
import { type AskScope, scopeKeyOf } from "./reply-unit-dom.ts"

export type MarginCardEntry = {
  readonly key: string
  readonly scope: AskScope
  readonly pairs: readonly AskPair[]
  readonly notes: readonly NumberedNote[]
  /** この単位について入力欄が開いているか。 */
  readonly boxOpen: boolean
}

export function pairScopeOf(pair: AskPair): AskScope {
  return pair.row === undefined
    ? { kind: "leaf" }
    : { kind: "row", index: pair.row.index, firstCell: pair.row.label }
}

/** 聞いた対・付箋・開いた欄のある単位ごとに、札1枚の中身を組む。部品全体、行の添字の順に並べる。 */
export function marginCardsOf(
  pairs: readonly AskPair[],
  notes: readonly NumberedNote[],
  openScope?: AskScope,
  shownScope?: AskScope,
): readonly MarginCardEntry[] {
  const scopes = [
    ...pairs.map(pairScopeOf),
    ...notes.map(noteScopeOf),
    ...(openScope === undefined ? [] : [openScope]),
    ...(shownScope === undefined ? [] : [shownScope]),
  ]
  const keys = [...new Set(scopes.map(scopeKeyOf))]
  return sortBy(
    keys.map((key): MarginCardEntry => {
      const scope = scopes.find((candidate) => scopeKeyOf(candidate) === key) ?? { kind: "leaf" }
      return {
        key,
        scope,
        pairs: pairs.filter((pair) => scopeKeyOf(pairScopeOf(pair)) === key),
        notes: notes.filter((note) => scopeKeyOf(noteScopeOf(note)) === key),
        boxOpen: openScope !== undefined && scopeKeyOf(openScope) === key,
      }
    }),
    (card) => (card.scope.kind === "leaf" ? -1 : card.scope.index),
  )
}

export function ReplyPortButton(props: { readonly onClick: () => void }): ReactElement {
  return (
    <Button
      variant="outline-accent"
      size="label"
      pressed="none"
      disabled={false}
      disclosure={{ kind: "none" }}
      className={styles["reply-port"]}
      onClick={props.onClick}
    >
      聞く・頼む
    </Button>
  )
}

type CardActions = {
  readonly renderBox: () => ReactElement
  readonly onPort: () => void
  readonly onContinue: (pair: AskPair) => void
  readonly onRequest: (pair: AskPair) => void
}

/** 札1枚の中身。余白の札とシートで同じ部品を使う。 */
export function MarginCardBody(
  props: CardActions & {
    readonly card: MarginCardEntry
    /** 入力欄が閉じているとき、札の末尾に「聞く・頼む」を出すか。 */
    readonly withPort: boolean
  },
): ReactElement {
  const { card } = props
  return (
    <>
      {card.pairs.length > 0 && (
        <AskThreadView
          pairs={card.pairs}
          onContinue={props.onContinue}
          onRequest={props.onRequest}
        />
      )}
      {card.notes.map((numbered) => (
        <ReplyNoteCard key={numbered.note.id} numbered={numbered} />
      ))}
      {card.boxOpen && props.renderBox()}
      {!card.boxOpen && props.withPort && <ReplyPortButton onClick={props.onPort} />}
    </>
  )
}

export function MarginCards(
  props: CardActions & {
    readonly leafKey: string
    readonly cards: readonly MarginCardEntry[]
    /** 単位ごとの上端（外枠の上端から）。 */
    readonly tops: Readonly<Record<string, number>>
    /** 札ごとの、重ならないよう下へずらす量。 */
    readonly shifts: Readonly<Record<string, number>>
    /** 指している単位の鍵。札のある単位なら、札の末尾に「聞く・頼む」を出す。 */
    readonly pointedKey?: string
  },
): ReactElement {
  return (
    <>
      {props.cards.map((card) => {
        const id = `${props.leafKey}#${card.key}`
        const top = props.tops[card.key] ?? 0
        return (
          <div
            key={card.key}
            className={styles["margin-card"]}
            data-margin-card={id}
            data-card-top={top}
            style={{ top: `${String(top + (props.shifts[id] ?? 0))}px` }}
          >
            <MarginCardBody {...props} card={card} withPort={card.key === props.pointedKey} />
          </div>
        )
      })}
    </>
  )
}

function noteScopeOf(note: NumberedNote): AskScope {
  const { key, label } = note.note.target
  return key.rowIndex === undefined
    ? { kind: "leaf" }
    : { kind: "row", index: key.rowIndex, firstCell: label.row ?? "" }
}
