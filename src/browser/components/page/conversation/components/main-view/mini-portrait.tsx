// 筆先に添うミニ立ち絵。レポートの上に出てよい唯一の立ち絵で、書いている様子を分身として見せる。
//
// キャラビューの立ち絵は消さない。こちらは明確に小さくして見分ける（縁取りと暈は `turn-card/mini-portrait.css`）。
// `<Portrait>` は共有するが、4つの動き（呼吸・待っている間の移動・完了の反応・失敗でびくっ）は渡さない（ここが持つ動きは筆先への追従と、書く仕草だけ）。
//
// 出る条件は「その筆先が、いま出ているやり取りのものであること」。
// 筆先を配るのは、いちばん新しいターンの最後の確定レポートを節ごとに出す演出（`startPop`）と、いちばん新しいターンの書いている途中のレポート（`useDraftPen`）だけで、`prefers-reduced-motion: reduce`・演出の速さ「切る」・過去のターンではどちらも配らないので、ここに同じ判定を書き足さなくても出ない。
//
// 書き上げたあとも消えない。筆先が `resting` になってその場に留まり、本文と一緒に転がる。
// 座標が本文の入れ物の原点基準なので、`position: absolute` で置くだけで貼り付く。
// 次のターンで書き始めると、そのまま新しい筆先へ滑って移る（同じ原点の座標どうしなので、遷移を外さなくても飛ばない）。
//
// 残るのは、その筆先を出したやり取りが出ているあいだだけ:
//
// - 次の依頼を出すと本文が入れ替わるのに座標はそのままなので、筆先の `turnId` と出ているやり取りが違えば引っ込む（キャラビューの立ち絵は残る）
// - 行の上へ立ったままだとその上の行の文字を隠すので、残っているあいだは本文の右下の隅へ降りる（`.mini-portrait-resting`）。
//   降りた先の床は `MiniPortrait` が本文の末尾に敷く
//
// 素材は `CharacterInfo.mini`（`character.json` の任意の `mini`。無いパックは `portraits.default` に落ちたものが届く）。

import clsx from "clsx"
import type { ReactElement } from "react"

import {
  subscribeBrushTip,
  useBrushStance,
  type BrushMotion,
  type BrushStance,
  type BrushTip,
} from "../../../../../domain/reveal/brush-tip.ts"
import { useSession } from "../../../../../stores/session.ts"
import { playClassOnce } from "../../../../../utils/play-class-once.ts"
import { Portrait } from "../../../../domain/portrait.tsx"
import styles from "./main-view.module.css"

/** ミニ立ち絵の表情。表情では変わらない1件なので、`<Portrait>` に渡す表情も `default` で固定する。 */
const MINI_EXPRESSION = "default"

/**
 * `character.json` に `miniCall` が無いパックで alt に使う呼び名。
 * キャラクターの世界の言葉（「式神」など）はパックが持つので、ここは画面の用語のまま置く。
 */
const MINI_CALL_FALLBACK = "ミニ立ち絵"

type MiniPortraitProps = {
  /** いま出ているやり取り（`MainViewTurn.id`）。筆先が別のやり取りのものなら出さない（座標の先にはもう違う本文がある）。 */
  readonly shownTurnId: number
}

export function MiniPortrait(props: MiniPortraitProps): ReactElement | undefined {
  const stance = useBrushStance()
  const character = useSession((session) => session.state.character)
  const url = character?.mini

  if (
    stance === undefined ||
    stance.turnId !== props.shownTurnId ||
    character === undefined ||
    url === undefined
  ) {
    return undefined
  }

  // 読み上げ上もキャラビューの立ち絵と見分けが付くようにする（同じ姿がもう1体居るため）。
  const call = character.miniCall ?? MINI_CALL_FALLBACK
  const altText = character.name === undefined ? call : `${character.name}の${call}`

  return (
    // 本文の末尾に敷く床。書き終わって本文の下へ降りた立ち絵の立つ場所。
    // これが無いと足元が器の下端をはみ出して、転がさないと見えない（立ち絵は `position: absolute` なので、場所を空けられるのは流れの中にいるこちらだけ）。
    // 中の立ち絵の置き先はこの床ではなく本文の入れ物のまま（床は position を持たない）。
    <div className={styles["mini-portrait-floor"]}>
      {/* 位置は描画を通さず、筆先を購読して直に書く（描き直すのは出入りと間合いの class が変わるときだけ）。 */}
      <div className={followClassName(stance)} ref={followBrushTip}>
        {/* 書く仕草（揺れ・跳ね）を持つ入れ物。追従の位置（外の入れ物の transform）と別の要素にしないと、仕草が位置を上書きする。 */}
        <div className={styles["mini-portrait-pose"]}>
          <Portrait
            url={url}
            altText={altText}
            expression={MINI_EXPRESSION}
            motion={undefined}
            className={styles["mini-portrait-body"]}
          />
        </div>
      </div>
    </div>
  )
}

/** 書いているあいだ（次の欄へ滑って移る）と、書き終わりに隅へ降りるあいだで、置き方と間合いを差し替える。 */
function followClassName(stance: BrushStance): string {
  return clsx(styles["mini-portrait"], motionClassName(stance.motion))
}

function motionClassName(motion: BrushMotion): string {
  switch (motion) {
    case "resting":
      return styles["mini-portrait-resting"]
    case "drafting":
      return styles["mini-portrait-drafting"]
  }
}

/**
 * 立ち絵の入れ物に付ける ref。筆先が変わるたびに置き方（{@link followTransform}）を書き、外れたら受け取りをやめる。
 * 間合いの class の切り替えは描き直しで、位置はここで入るが、どちらも同じ筆先の配りから同じフレームのうちに入る。
 * 書いている途中のレポートで部品が届いたら（`arrivedCount` が増えたら）、仕草の入れ物を1回跳ねさせる。
 */
function followBrushTip(element: HTMLDivElement): () => void {
  let arrivedCount: number | undefined = undefined
  return subscribeBrushTip((tip) => {
    if (tip === undefined) {
      return
    }
    element.style.transform = followTransform(tip)
    const nextCount = tip.phase === "drafting" ? tip.arrivedCount : undefined
    const pose = element.firstElementChild
    if (
      pose !== null &&
      arrivedCount !== undefined &&
      nextCount !== undefined &&
      nextCount > arrivedCount
    ) {
      playClassOnce(pose, styles["mini-portrait-hop"])
    }
    arrivedCount = nextCount
  })
}

/**
 * 次の欄の右端に右端を、欄の下端に足元を揃える（草稿の待ちの欄の罫線は左の7割だけなので、立つのは右の余白）。
 * 座標は本文の入れ物の原点基準なので、置いた先は本文と一緒に転がる。
 * 置き方は `left` ではなく `transform` で、次の欄へ移るときは縦横が同時に動くので、飛ばずに滑る。
 *
 * 書き終わって残っているあいだは、本文の右下の隅へ寄る（置くのは `.mini-portrait-resting`）。
 * 隅は本文の末尾に敷いた床（{@link MiniPortrait}）の上なので、どの行にも重ならない。
 */
function followTransform(tip: BrushTip): string {
  // 止まっているあいだは座標を使わない（右下の隅に付けるのは CSS の側）。
  if (tip.phase === "resting") {
    return "none"
  }
  return `translate3d(${px(tip.x)}, ${px(tip.bottom)}, 0) translate(-100%, -100%)`
}

function px(value: number): string {
  return `${String(Math.round(value))}px`
}
