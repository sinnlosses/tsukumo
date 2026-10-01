// つつくと話しかけてくれる立ち絵。
// 押した事実だけを送る。文面は `CHAT_NUDGE_PROMPT` が持ち、ブラウザは話題も一言も持たない。
// 送った文面はログにも記録にも残らない。
//
// 押せることを持たせるのはここで、`<Portrait>` ではない。
// `<Portrait>` はキャラビューとキャラクター画面も使う共有部品で、そちら（仕事のとき・整える面）の立ち絵は押せないままにする。
// 包むのは `<button>`。セリフの行と違って立ち絵には選ぶ文字が無いので、`role="button"` ＋ 自前のキーの受けが要らない。
//
// ターンが動いている間は押せない（サーバ側も同じ条件で断る）。
// ただし `disabled` にはしない。ブラウザが `disabled` の要素にホバーもフォーカスも通さないので、キーボードで辿り着ける道ごと消える。
// `aria-disabled` で伝える。
// 案内（`NUDGE_HINT`）はその間だけ出さないので、`aria-describedby` も指す先を持たない。
// 立ち絵そのものは薄めない（要素の `opacity` は地ごと透かす）。
//
// これはプロトタイプ。
// 立ち絵の動きは「待っているか」だけで決めていて、キャラビューが持つ4つの動き（`usePortraitMotion`）は再現していない。

import { useId, type ReactElement } from "react"

import type {
  Expression,
  Outfit,
} from "../../../../../../../../shared/character-pack/expression.ts"
import { Portrait } from "../../../../../../domain/portrait.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "./nudge-portrait.module.css"

/**
 * 立ち絵に載せたときに出る案内。
 * ホバーの間だけ見えるので常設の枠は増えないが、支援技術には常に届く（立ち絵を包むボタンの `aria-describedby` が指す）。
 * ターン進行中はこの案内ごと出さない（押せない理由の定型文には差し替えない）。
 */
const NUDGE_HINT = "話しかけてもらう"

export function NudgePortrait(props: {
  readonly url: string
  readonly accent: string | undefined
  readonly altText: string
  readonly expression: Expression
  readonly outfit: Outfit
  readonly turnInProgress: boolean
  readonly onNudge: () => void
}): ReactElement {
  const hintId = useId()

  return (
    <button
      type="button"
      className={styles["chat-poke"]}
      // 名前は立ち絵の alt のまま（中身から計算される）。
      // 何が起きるかは説明のほうに置くので、`aria-label` で alt を覆わない。
      aria-describedby={props.turnInProgress ? undefined : hintId}
      aria-disabled={props.turnInProgress}
      onClick={props.onNudge}
    >
      <Portrait
        url={props.url}
        accent={props.accent}
        altText={props.altText}
        expression={props.expression}
        outfit={props.outfit}
        motion={props.turnInProgress ? "waiting" : "reading"}
        className={styles["chat-portrait"]}
      />
      {/* 案内はホバーの間だけ見えるが、支援技術には常に届く。
          `aria-describedby` は見た目ではなく木の中に在るかで決まるので、`display: none` ではなく透明にして隠す。
          ターン進行中は木からも消す（押せないうえに、代わりに出す字を持たない）。 */}
      {!props.turnInProgress && (
        <span className={styles["chat-poke-hint"]}>
          <Text element="span" size="secondary" tone="ink-quiet" weight="inherit" className="">
            <span id={hintId}>{NUDGE_HINT}</span>
          </Text>
        </span>
      )}
    </button>
  )
}
