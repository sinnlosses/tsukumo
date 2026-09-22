// 筆先に添うミニ立ち絵（`docs/requirements.md` 4.3・`docs/design.md` 6.5）。**レポートの上に
// 出てよい唯一の立ち絵**で、書いている様子を式神として見せる。
//
// **キャラビューの立ち絵は消さない。** 2体見えるのは「分身」として受け入れる決定で、
// こちらは明確に小さくして見分ける（縁取りと暈は
// `mini-portrait.module.css`）。`<Portrait>`（矩形を描く部品）は共有するが、**4つの動き（呼吸・待っている間の移動・完了の反応・失敗でびくっ）は
// 渡さない**——あれはキャラビューの領域の中の話で、ここが持つ動きは筆先への追従だけ。
//
// **出る条件は「その筆先が、いま出ているやり取りのものであること」**（`stores/brush-tip.ts`）。
// 筆先を配るのは演出
// （`report-reveal.ts`）で、演出が掛かるのは**いちばん新しいターンの最後の確定レポートが
// 現れたとき**だけ（`turn.tsx`）。`prefers-reduced-motion: reduce` と過去のタブでは演出自体が
// 走らないので、ここに同じ判定を書き足さなくても出ない。
//
// **書き上げたあとも消えない。** 筆先が `resting` になってその場に留まり、
// **本文と一緒に転がる**——座標が本文の入れ物の原点基準（`stores/brush-tip.ts`）なので、
// `position: absolute` で置くだけで貼り付く。次のターンで書き始めると、そのまま新しい筆先へ
// 滑って移る（同じ原点の座標どうしなので、遷移を外さなくても飛ばない）。
//
// **残るのは、その筆先を出したやり取りが出ているあいだだけ**（画面で2つ出た）:
//
// - 次の依頼を出すと本文が入れ替わるのに座標はそのままなので、**残った立ち絵が新しい依頼の
//   見出しの横へ浮いていた**。`tip.turnId` と出ているやり取りが違えば引っ込む（キャラビューの
//   立ち絵は残るので、キャラクターが消えるわけではない）
// - 書き終わりに**行の上へ立っていたので、その上の行の文字を隠していた**。残っているあいだは
//   最後の行の**下**へ降りる（{@link followStyle}）。降りた先の床は {@link MiniPortrait} が
//   本文の末尾に敷く
//
// 素材は `CharacterInfo.mini`（`character.json` の任意の `mini`。無いパックは
// `portraits.default` に落ちたものが届く。畳むのは `shared/character.ts`）。

import { type CSSProperties, type ReactElement } from "react"

import { resolveOutfit } from "../../../shared/expression.ts"
import { Portrait } from "../../components/portrait.tsx"
import { useBrushTip, type BrushTip } from "../../stores/brush-tip.ts"
import { useSessionSelector } from "../../stores/session.tsx"
import styles from "./mini-portrait.module.css"

/**
 * ミニ立ち絵の表情。**表情では変わらない1件**（`character.json` の `mini`。無ければ
 * `portraits.default`）なので、`<Portrait>` に渡す表情も `default` で固定する。
 */
const MINI_EXPRESSION = "default"

export type MiniPortraitProps = {
  /**
   * いま出ているやり取り（`MainViewTurn.id`）。**筆先が別のやり取りのものなら出さない**
   * ——座標の先にはもう違う本文がある。
   */
  readonly shownTurnId: number
}

export function MiniPortrait(props: MiniPortraitProps): ReactElement | null {
  const tip = useBrushTip()
  const character = useSessionSelector((session) => session.state.character)
  const model = useSessionSelector((session) => session.state.model)
  const url = character?.mini

  // 筆先が無い（まだ一度も書かれていない）とき・別のやり取りの筆先のとき・縮小する素材すら
  // 無いパックでは出さない。
  if (
    tip === undefined ||
    tip.turnId !== props.shownTurnId ||
    character === undefined ||
    url === undefined
  ) {
    return null
  }

  const outfit = resolveOutfit(model)

  return (
    // 本文の末尾に敷く床。**書き終わって本文の下へ降りた立ち絵の立つ場所**で、これが無いと
    // 足元が器の下端をはみ出して、転がさないと見えない（立ち絵は `position: absolute` なので、
    // 場所を空けられるのは流れの中にいるこちらだけ）。中の立ち絵の置き先は**この床ではなく
    // 本文の入れ物**のまま（床は position を持たない。`mini-portrait.module.css`）。
    <div className={styles["mini-portrait-floor"]}>
      <div className={followClassName(tip)} style={followStyle(tip)}>
        <Portrait
          url={url}
          accent={character.outfitAccents[outfit]}
          altText={miniAltText(character.name)}
          expression={MINI_EXPRESSION}
          outfit={outfit}
          motion={undefined}
          className={styles["mini-portrait-body"]}
        />
      </div>
    </div>
  )
}

/**
 * 追従の間合いを**画ごとに変える**。横画のあいだは遅れて寄り、斜めの戻りの
 * あいだは筆先に張り付く——**戻りは横画の4〜7倍の速さで動く**ので、同じ間合いのままでは
 * 立ち絵の幅より大きく置いていかれる。**長さは `mini-portrait.module.css` の2つの custom
 * property が持つ**ので、ここは class を選ぶだけにする。
 *
 * 書き終わりに行の下へ降りる動き（`resting`）にも、そのための間合いを1つ持たせる——降りるのは
 * 立ち絵の高さぶんの縦移動なので、横画の間合い（0.05s）では落ちたように見える。
 */
function followClassName(tip: BrushTip): string {
  return [styles["mini-portrait"], motionClassName(tip)]
    .filter((name) => name !== undefined)
    .join(" ")
}

/** 追従の間合いを差し替える印。**横画のあいだは素のまま**なので、そのときだけ undefined。 */
function motionClassName(tip: BrushTip): string | undefined {
  if (tip.phase === "resting") {
    return styles["mini-portrait-resting"]
  }
  return tip.stroke === "return" ? styles["mini-portrait-returning"] : undefined
}

/**
 * 筆先の**右・帯の下端**に立たせる（なぞっている帯と同じ高さで、書き進む先の側）。座標は
 * 本文の入れ物の原点基準（`stores/brush-tip.ts`）なので、置いた先は本文と一緒に転がる。
 * Z字の斜めの戻りでは筆先が右から左へ動くので、立ち絵も
 * 一緒に戻ってくる。
 *
 * **書き終わって残っているあいだは、行の上ではなく下へ降りる**（`translateY` を外す＝上端が
 * 行の下端に来る）。書いている最中は筆を追って動いているので行に被っても読めるが、止まると
 * **上の行の文字を隠したまま居座る**（画面で出た。立ち絵の高さは行の2〜3本分ある）。
 * 降りる先は本文の末尾に敷いた床（{@link MiniPortrait}）。
 *
 * 置き方は `left` ではなく `transform`: **CSS の遷移（`mini-portrait.module.css` の
 * `transition`）が毎フレーム引き直される**ので、横画では少し遅れてばねで寄り、戻りでは
 * （間合いが 0 なので）そのフレームの筆先にそのまま乗る。行が変わるときも縦横が同時に
 * 動くので、飛ばずに滑る。書き終わりの降りる動きも同じ遷移に乗る（間合いだけ
 * `.mini-portrait-resting` で長くしてある）。
 */
function followStyle(tip: BrushTip): CSSProperties {
  const place = `translate3d(${px(tip.x)}, ${px(tip.bottom)}, 0)`
  return { transform: tip.phase === "resting" ? place : `${place} translateY(-100%)` }
}

/** 読み上げ上もキャラビューの立ち絵と見分けが付くようにする（同じ姿がもう1体居るため）。 */
function miniAltText(name: string | undefined): string {
  return name === undefined ? "式神" : `${name}の式神`
}

function px(value: number): string {
  return `${String(Math.round(value))}px`
}
