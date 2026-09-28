// 筆先に添うミニ立ち絵。レポートの上に出てよい唯一の立ち絵で、書いている様子を分身として見せる。
//
// キャラビューの立ち絵は消さない。こちらは明確に小さくして見分ける（縁取りと暈は `mini-portrait.module.css`）。
// `<Portrait>` は共有するが、4つの動き（呼吸・待っている間の移動・完了の反応・失敗でびくっ）は渡さない（ここが持つ動きは筆先への追従だけ）。
//
// 出る条件は「その筆先が、いま出ているやり取りのものであること」。
// 演出が掛かるのはいちばん新しいターンの最後の確定レポートが現れたときだけで、`prefers-reduced-motion: reduce` と過去のターンでは演出自体が走らないので、ここに同じ判定を書き足さなくても出ない。
//
// 書き上げたあとも消えない。筆先が `resting` になってその場に留まり、本文と一緒に転がる。
// 座標が本文の入れ物の原点基準なので、`position: absolute` で置くだけで貼り付く。
// 次のターンで書き始めると、そのまま新しい筆先へ滑って移る（同じ原点の座標どうしなので、遷移を外さなくても飛ばない）。
//
// 残るのは、その筆先を出したやり取りが出ているあいだだけ:
//
// - 次の依頼を出すと本文が入れ替わるのに座標はそのままなので、`tip.turnId` と出ているやり取りが違えば引っ込む（キャラビューの立ち絵は残る）
// - 行の上へ立ったままだとその上の行の文字を隠すので、残っているあいだは最後の行の下へ降りる（`followStyle`）。
//   降りた先の床は `MiniPortrait` が本文の末尾に敷く
//
// 素材は `CharacterInfo.mini`（`character.json` の任意の `mini`。無いパックは `portraits.default` に落ちたものが届く）。

import clsx from "clsx"
import type { CSSProperties, ReactElement } from "react"

import { resolveOutfit } from "../../../../../../../../shared/character-pack/expression.ts"
import { useBrushTip, type BrushTip } from "../../../../../../../domain/reveal/brush-tip.ts"
import { useSession } from "../../../../../../../stores/session.ts"
import { Portrait } from "../../../../../../domain/portrait.tsx"
import styles from "./mini-portrait.module.css"

/** ミニ立ち絵の表情。表情では変わらない1件なので、`<Portrait>` に渡す表情も `default` で固定する。 */
const MINI_EXPRESSION = "default"

/**
 * `character.json` に `miniCall` が無いパックで alt に使う呼び名。
 * キャラクターの世界の言葉（「式神」など）はパックが持つので、ここは画面の用語のまま置く。
 */
const MINI_CALL_FALLBACK = "ミニ立ち絵"

export type MiniPortraitProps = {
  /** いま出ているやり取り（`MainViewTurn.id`）。筆先が別のやり取りのものなら出さない（座標の先にはもう違う本文がある）。 */
  readonly shownTurnId: number
}

export function MiniPortrait(props: MiniPortraitProps): ReactElement | null {
  const tip = useBrushTip()
  const character = useSession((session) => session.state.character)
  const model = useSession((session) => session.state.model)
  const url = character?.mini

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
    // 本文の末尾に敷く床。書き終わって本文の下へ降りた立ち絵の立つ場所。
    // これが無いと足元が器の下端をはみ出して、転がさないと見えない（立ち絵は `position: absolute` なので、場所を空けられるのは流れの中にいるこちらだけ）。
    // 中の立ち絵の置き先はこの床ではなく本文の入れ物のまま（床は position を持たない）。
    <div className={styles["mini-portrait-floor"]}>
      <div className={followClassName(tip)} style={followStyle(tip)}>
        <Portrait
          url={url}
          accent={character.outfitAccents[outfit]}
          altText={miniAltText(character.name, character.miniCall)}
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
 * 追従の間合いを画ごとに変える。横画のあいだは遅れて寄り、斜めの戻りのあいだは筆先に張り付く。
 * 戻りは横画の4〜7倍の速さで動くので、同じ間合いのままでは立ち絵の幅より大きく置いていかれる。
 * 長さは `mini-portrait.module.css` の2つの custom property が持つので、ここは class を選ぶだけにする。
 *
 * 書き終わりに行の下へ降りる動き（`resting`）にも、そのための間合いを1つ持たせる。
 * 降りるのは立ち絵の高さぶんの縦移動なので、横画の間合い（0.05s）では落ちたように見える。
 */
function followClassName(tip: BrushTip): string {
  return clsx(styles["mini-portrait"], motionClassName(tip))
}

/** 追従の間合いを差し替える印。横画のあいだは素のままなので、そのときだけ undefined。 */
function motionClassName(tip: BrushTip): string | undefined {
  if (tip.phase === "resting") {
    return styles["mini-portrait-resting"]
  }
  return tip.stroke === "return" ? styles["mini-portrait-returning"] : undefined
}

/**
 * 筆先の右・帯の下端に立たせる（なぞっている帯と同じ高さで、書き進む先の側）。
 * 座標は本文の入れ物の原点基準なので、置いた先は本文と一緒に転がる。
 *
 * 書き終わって残っているあいだは、本文の右下の隅へ寄る（`translateY` を外して行の下へ降り、横は `.mini-portrait-resting` で右端に付く）。
 * 止まると文字を隠したまま居座る（立ち絵の高さは行の2〜3本分あり、最後の行が短いと本文の途中の行に重なる）ので、本文の末尾に敷いた床（{@link MiniPortrait}）と右端の組で、どの行にも重ならないようにする。
 *
 * 置き方は `left` ではなく `transform`。
 * CSS の遷移（`transition`）が毎フレーム引き直されるので、横画では少し遅れてばねで寄り、戻りでは（間合いが 0 なので）そのフレームの筆先にそのまま乗る。
 * 行が変わるときも縦横が同時に動くので、飛ばずに滑る。
 */
function followStyle(tip: BrushTip): CSSProperties {
  // 止まっているあいだは横の座標を使わない（右端に付けるのは CSS の側）。
  // 縦だけを最後の行の下端へ置き、そこに敷いた床の上に立たせる。
  if (tip.phase === "resting") {
    return { transform: `translate3d(0, ${px(tip.bottom)}, 0)` }
  }
  return { transform: `translate3d(${px(tip.x)}, ${px(tip.bottom)}, 0) translateY(-100%)` }
}

/** 読み上げ上もキャラビューの立ち絵と見分けが付くようにする（同じ姿がもう1体居るため）。 */
function miniAltText(name: string | undefined, miniCall: string | undefined): string {
  const call = miniCall ?? MINI_CALL_FALLBACK
  return name === undefined ? call : `${name}の${call}`
}

function px(value: number): string {
  return `${String(Math.round(value))}px`
}
