// つつくと話しかけてくれる立ち絵（docs/screen-design.md 13.7）。**押した事実だけを送る** —
// 文面は `src/server/core/chat-nudge.ts` が持ち、ブラウザは話題も一言も持たない（原則4）。
// 送った文面はログにも記録にも残らない。
//
// **押せることを持たせるのはここで、`components/domain/portrait.tsx` ではない**。立ち絵は
// キャラビューとキャラクター画面も使う共有部品で、そちら（仕事のとき・整える面）の立ち絵は
// 押せないままにする。**包むのは `<button>`** — セリフの行と違って立ち絵には選ぶ文字が無いので、
// `role="button"` ＋ 自前のキーの受けが要らず、キーボードで押せる道はブラウザが最初から持っている。
//
// **ターンが動いている間は押せない**（帯の仕事/雑談のトグルと同じ立場。サーバ側も同じ条件で
// 断る。送らないのは `hooks/use-chat-view.ts` の `onNudge`）。ただし `disabled` にはしない —
// ブラウザが `disabled` の要素にホバーもフォーカスも通さないので、キーボードで辿り着ける道ごと
// 消える。`aria-disabled` で伝える。**案内（{@link NUDGE_HINT}）はその間だけ出さない**ので、
// `aria-describedby` も指す先を持たない。**立ち絵そのものは薄めない**（要素の `opacity` は
// 地ごと透かす。docs/screen-design.md 13.8）。
//
// **これはプロトタイプ**。立ち絵の動きは「待っているか」だけで決めていて、キャラビューが持つ
// 4つの動き（`components/page/conversation/components/character-view/` の `usePortraitMotion`）は再現していない。

import { useId, type ReactElement } from "react"

import { type Expression, type Outfit } from "../../../../../../../../shared/expression.ts"
import { Portrait } from "../../../../../../domain/portrait.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "../../chat-view.module.css"

/**
 * 立ち絵に載せたときに出る案内（docs/screen-design.md 13.7）。**ホバーの間だけ見えるので常設の枠は
 * 増えない**（13.1 原則2）が、**支援技術には常に届く**（立ち絵を包むボタンの
 * `aria-describedby` が指す）。
 *
 * **ターン進行中はこの案内ごと出さない**（押せない理由の定型文には差し替えない。
 * `docs/screen-design.md` 13.7）。返事を待っている間は字を増やさない。
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
      // 名前は立ち絵の alt のまま（中身から計算される）。**何が起きるかは説明のほう**に置く
      // ので、`aria-label` で alt を覆わない。
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
      {/* 案内はホバーの間だけ見えるが、**支援技術には常に届く**（`aria-describedby` は
          見た目ではなく木の中に在るかで決まるので、`display: none` ではなく透明にして隠す）。
          **ターン進行中は木からも消す** — 押せないうえに、代わりに出す字を持たない。 */}
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
