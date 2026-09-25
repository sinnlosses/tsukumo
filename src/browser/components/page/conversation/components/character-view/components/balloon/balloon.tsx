// 吹き出し1件（<Balloon>。docs/design.md 6.1）。中身は React が自動でエスケープするので、
// セリフの文字列をそのまま子要素として渡せば安全に描ける（旧の `escapeHtml` は不要になった）。
//
// **最新かどうかの見た目の強弱は `data-latest` を読む CSS が担う**（`character-view.module.css` の
// `.balloon[data-latest="true"]`）。キャラビューの吹き出しの並びとセリフのログの両方がこの部品を
// 使い、最新の1件の見た目を共有する（並びの中の位置では決めない。ログでは吹き出しが1件ずつ
// 行に包まれている）。
//
// **話し手の名前は最新の1件にだけ添える**（どれを誰が言ったかは尻尾が結ぶので、過去の分に
// 繰り返さない）。本文は `.balloon-text` に分けてあり、名前と混ざらずに読める。

import { type ReactElement } from "react"

import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "../../character-view.module.css"

export type BalloonProps = {
  readonly text: string
  /** 並びの中でいちばん新しいセリフか（`data-latest` に出し、CSS が最新の見た目を当てる）。 */
  readonly latest: boolean
  /** 本文の上に添える話し手の名前。添えないなら undefined。 */
  readonly speaker: string | undefined
}

export function Balloon(props: BalloonProps): ReactElement {
  return (
    <div className={styles["balloon"]} data-latest={props.latest}>
      {props.speaker !== undefined && (
        <Text
          element="span"
          size="label"
          tone="accent"
          weight="bold"
          className={styles["balloon-speaker"] ?? ""}
        >
          {props.speaker}
        </Text>
      )}
      <span className={styles["balloon-text"]}>{props.text}</span>
    </div>
  )
}
