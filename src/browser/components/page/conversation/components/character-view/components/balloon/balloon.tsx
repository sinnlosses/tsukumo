// 吹き出し1件（<Balloon>。docs/design.md 6.1）。中身は React が自動でエスケープするので、
// セリフの文字列をそのまま子要素として渡せば安全に描ける（旧の `escapeHtml` は不要になった）。
//
// 最新かどうかの見た目の強弱は `data-latest` を読む CSS が担う（`character-view.module.css` の
// `.balloon[data-latest="true"]`）。キャラビューの吹き出しの並びとセリフのログの両方がこの部品を
// 使い、最新の1件の見た目を共有する（並びの中の位置では決めない。ログでは吹き出しが1件ずつ
// 行に包まれている）。
//
// 話し手の名前は最新の1件にだけ添える（どれを誰が言ったかは尻尾が結ぶので、過去の分に
// 繰り返さない）。本文は `.balloon-text` に分けてあり、名前と混ざらずに読める。
//
// `interaction` が `toggleable` のときは押せる（押すとそのセリフの表情へ立ち絵が遡る。
// docs/screen-design.md 13.7「会話を遡る」）。セリフが1件も無いときのプレースホルダは
// 遡る先の表情を持たないので `static` で渡す。押し方の読み替え（ドラッグとの見分け・キー）は
// `chat-speech.tsx` と共有する `components/hooks/use-speech-press.ts` が持つ。
// `<button>` ではなく `role="button"` の `<div>` にする理由も同じ（ブラウザは `<button>` の
// 中の文字をドラッグで掴ませない）。

import type { ReactElement } from "react"

import { Text } from "../../../../../../ui/text/text.tsx"
import { useSpeechPress } from "../../../hooks/use-speech-press.ts"
import styles from "../../character-view.module.css"

/** 押せるか（押せるなら、印の状態と押されたときの呼び先を持つ）。 */
export type BalloonInteraction =
  | { readonly kind: "static" }
  | { readonly kind: "toggleable"; readonly selected: boolean; readonly onToggle: () => void }

export type BalloonProps = {
  readonly text: string
  /** 並びの中でいちばん新しいセリフか（`data-latest` に出し、CSS が最新の見た目を当てる）。 */
  readonly latest: boolean
  /** 本文の上に添える話し手の名前。添えないなら undefined。 */
  readonly speaker: string | undefined
  readonly interaction: BalloonInteraction
}

const NOOP = (): void => {
  // static のときは使わない（フックは条件分岐せず常に呼ぶ）。
}

export function Balloon(props: BalloonProps): ReactElement {
  const { interaction } = props
  const press = useSpeechPress(interaction.kind === "toggleable" ? interaction.onToggle : NOOP)
  const body = (
    <>
      {props.speaker !== undefined && (
        <Text
          element="span"
          size="label"
          tone="accent"
          weight="bold"
          className={styles["balloon-speaker"]}
        >
          {props.speaker}
        </Text>
      )}
      <Text
        element="span"
        size="inherit"
        tone="inherit"
        weight="inherit"
        className={styles["balloon-text"]}
      >
        {props.text}
      </Text>
    </>
  )

  if (interaction.kind === "static") {
    return (
      <div className={styles["balloon"]} data-latest={props.latest}>
        {body}
      </div>
    )
  }

  return (
    <div
      className={styles["balloon"]}
      data-latest={props.latest}
      data-interactive="true"
      data-selected={interaction.selected}
      role="button"
      tabIndex={0}
      aria-pressed={interaction.selected}
      onMouseDown={press.onMouseDown}
      onClick={press.onClick}
      onKeyDown={press.onKeyDown}
    >
      {body}
    </div>
  )
}
