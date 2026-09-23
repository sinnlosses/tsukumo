// ターンの札の頭（`docs/requirements.md` 4.2）。左に `‹` `›`（`‹` が1つ古いターン、`›` が1つ
// 新しいターン。端ではその側を押せなくする）、続けて見ているターンのタイトル、右端に
// 「n / N」（窓の中の何件目か。古いほうが1）と、最新を見ているときは「最新」の印・過去を
// 見ているときは「最新へ」の口。
//
// **ターンが1件しか無くても出す。** 依頼の1行目はここにしか出ない（`turn.tsx` の
// `RequestRest` は2行目以降だけを持つ）ので、省くと依頼が画面から消える。
//
// **キー操作は付けない。** ページでは入力欄にほぼ常にフォーカスがあるので素のキーは使えず、
// 修飾キー付きはブラウザの戻る / 進む（Cmd+[ / Alt+←）とぶつかる。見ていたターンは
// `location.hash` に乗るので、1つ前に見ていたターンへはブラウザの戻るで帰れる
// （`stores/turn-selection.tsx`）。

import { type ReactElement } from "react"

import styles from "./main-view.module.css"

export type TurnHeaderProps = {
  /** 窓の中のターンの通し番号。**古い順**（末尾が最新）。 */
  readonly turnIds: readonly number[]
  readonly activeTurnId: number
  /** 見ているターンのタイトル（`domain/turn-title.ts`）。 */
  readonly title: string
  readonly onSelect: (turnId: number) => void
}

const OLDER_LABEL = "1つ古いターンへ"
const NEWER_LABEL = "1つ新しいターンへ"
const NEWEST_BADGE = "最新"
const TO_NEWEST_LABEL = "最新へ"

export function TurnHeader(props: TurnHeaderProps): ReactElement {
  const index = props.turnIds.indexOf(props.activeTurnId)
  const older = props.turnIds[index - 1]
  const newer = props.turnIds[index + 1]
  const newest = props.turnIds.at(-1)

  return (
    <header className={styles["turn-header"]}>
      <div className={styles["turn-nav"]}>
        <button
          type="button"
          className={styles["turn-nav-button"]}
          aria-label={OLDER_LABEL}
          title={OLDER_LABEL}
          disabled={older === undefined}
          onClick={() => {
            if (older !== undefined) {
              props.onSelect(older)
            }
          }}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          className={styles["turn-nav-button"]}
          aria-label={NEWER_LABEL}
          title={NEWER_LABEL}
          disabled={newer === undefined}
          onClick={() => {
            if (newer !== undefined) {
              props.onSelect(newer)
            }
          }}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
      {/* ページの中の本物の `h2` はこれ1つ（レポートの `##` は `h4` に落とす。
          `markdown/markdown.tsx`）。1行に収まらないぶんは CSS が省略するので、全文は `title` で読ませる。 */}
      <h2 className={styles["turn-title"]} title={props.title}>
        {props.title}
      </h2>
      <div className={styles["turn-meta"]}>
        <span className={styles["turn-position"]}>
          {String(index + 1)} / {String(props.turnIds.length)}
        </span>
        {newer === undefined ? (
          <span className={styles["turn-newest-badge"]}>{NEWEST_BADGE}</span>
        ) : (
          <button
            type="button"
            className={styles["turn-to-newest"]}
            onClick={() => {
              if (newest !== undefined) {
                props.onSelect(newest)
              }
            }}
          >
            {TO_NEWEST_LABEL}
          </button>
        )}
      </div>
    </header>
  )
}
