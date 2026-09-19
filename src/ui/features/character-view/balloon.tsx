// 吹き出し1件（<Balloon>。docs/design.md 6.1）。中身は React が自動でエスケープするので、
// セリフの文字列をそのまま子要素として渡せば安全に描ける（旧の `escapeHtml` は不要になった）。
//
// **最新かどうかの見た目の強弱は CSS の `.balloon:first-child` が担う**（`character-view.module.css`）。
// ここで class を出し分ける必要は無いが、`data-latest` は最新の1件をテストや目視から
// 見分けやすくするための印として付ける。

import { type ReactElement } from "react"

import styles from "./character-view.module.css"

export type BalloonProps = {
  readonly text: string
  /** 並びの中でいちばん新しいセリフか（`.balloon:first-child` と一致する。テスト・目視用の印）。 */
  readonly latest: boolean
}

export function Balloon(props: BalloonProps): ReactElement {
  return (
    <div className={styles["balloon"]} data-latest={props.latest}>
      {props.text}
    </div>
  )
}
