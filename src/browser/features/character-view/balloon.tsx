// 吹き出し1件（<Balloon>。docs/design.md 6.1）。中身は React が自動でエスケープするので、
// セリフの文字列をそのまま子要素として渡せば安全に描ける（旧の `escapeHtml` は不要になった）。
//
// **最新かどうかの見た目の強弱は CSS の `.balloon:first-child` が担う**（`character-view.module.css`）。
// ここで class を出し分ける必要は無いが、`data-latest` は最新の1件をテストや目視から
// 見分けやすくするための印として付ける。
//
// **話し手の名前は最新の1件にだけ添える**（どれを誰が言ったかは尻尾が結ぶので、過去の分に
// 繰り返さない）。本文は `.balloon-text` に分けてあり、名前と混ざらずに読める。

import { type ReactElement } from "react"

import styles from "./character-view.module.css"

export type BalloonProps = {
  readonly text: string
  /** 並びの中でいちばん新しいセリフか（`.balloon:first-child` と一致する。テスト・目視用の印）。 */
  readonly latest: boolean
  /** 本文の上に添える話し手の名前。添えないなら undefined。 */
  readonly speaker: string | undefined
}

export function Balloon(props: BalloonProps): ReactElement {
  return (
    <div className={styles["balloon"]} data-latest={props.latest}>
      {props.speaker !== undefined && (
        <span className={styles["balloon-speaker"]}>{props.speaker}</span>
      )}
      <span className={styles["balloon-text"]}>{props.text}</span>
    </div>
  )
}
