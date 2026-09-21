// 筆先に添うミニ立ち絵（`docs/requirements.md` 4.3・`docs/design.md` 6.5）。**レポートの上に
// 出てよい唯一の立ち絵**で、書いている様子を式神として見せる。
//
// **キャラビューの立ち絵は消さない。** 2体見えるのは「分身」として受け入れる決定
// （2026-09-20）で、こちらは明確に小さくして見分ける（縁取りと暈は
// `mini-portrait.module.css`）。`<Portrait>`（矩形を描く部品）は共有するが、**4つの動き（呼吸・待っている間の移動・完了の反応・失敗でびくっ）は
// 渡さない**——あれはキャラビューの領域の中の話で、ここが持つ動きは筆先への追従だけ。
//
// **出る条件は「筆先があること」だけ**（`stores/brush-tip.ts`）。筆先を配るのは演出
// （`report-reveal.ts`）で、演出が掛かるのは**いちばん新しいターンの最後の確定レポートが
// 現れたとき**だけ（`turn.tsx`）。`prefers-reduced-motion: reduce` と過去のタブでは演出自体が
// 走らないので、ここに同じ判定を書き足さなくても出ない。出し切れば筆先が undefined に
// 戻って消える。
//
// 素材は `CharacterInfo.mini`（`character.json` の任意の `mini`。無いパックは
// `portraits.default` に落ちたものが届く。畳むのは `shared/character.ts`）。

import { type CSSProperties, type ReactElement } from "react"

import { resolveOutfitAccent } from "../../../shared/character.ts"
import { resolveOutfit } from "../../../shared/expression.ts"
import { Portrait } from "../../components/portrait.tsx"
import { useBrushTip, type BrushStroke, type BrushTip } from "../../stores/brush-tip.ts"
import { useSessionSelector } from "../../stores/session.tsx"
import styles from "./mini-portrait.module.css"

/**
 * ミニ立ち絵の表情。**表情では変わらない1件**（`character.json` の `mini`。無ければ
 * `portraits.default`）なので、`<Portrait>` に渡す表情も `default` で固定する。
 */
const MINI_EXPRESSION = "default"

export function MiniPortrait(): ReactElement | null {
  const tip = useBrushTip()
  const character = useSessionSelector((session) => session.state.character)
  const model = useSessionSelector((session) => session.state.model)
  const url = character?.mini

  // 筆先が無い（演出が走っていない・出し切った）ときと、縮小する素材すら無いパックでは出さない。
  if (tip === undefined || character === undefined || url === undefined) {
    return null
  }

  const outfit = resolveOutfit(model)

  return (
    <div className={followClassName(tip.stroke)} style={followStyle(tip)}>
      <Portrait
        url={url}
        accent={resolveOutfitAccent(character.outfitAccents, outfit)}
        altText={miniAltText(character.name)}
        expression={MINI_EXPRESSION}
        outfit={outfit}
        motion={undefined}
        className={styles["mini-portrait-body"]}
      />
    </div>
  )
}

/**
 * 追従の間合いを**画ごとに変える**（2026-09-21）。横画のあいだは遅れて寄り、斜めの戻りの
 * あいだは筆先に張り付く——**戻りは横画の4〜7倍の速さで動く**ので、同じ間合いのままでは
 * 立ち絵の幅より大きく置いていかれる。**長さは `mini-portrait.module.css` の2つの custom
 * property が持つ**ので、ここは class を選ぶだけにする。
 */
function followClassName(stroke: BrushStroke): string {
  return [styles["mini-portrait"], stroke === "return" ? styles["mini-portrait-returning"] : ""]
    .filter((name) => name !== undefined && name !== "")
    .join(" ")
}

/**
 * 筆先の**右・帯の下端**に立たせる（いまなぞっている帯と同じ高さで、書き進む先の側。
 * 2026-09-20 のユーザーの決定）。Z字の斜めの戻りでは筆先が右から左へ動くので、立ち絵も
 * 一緒に戻ってくる。
 *
 * 置き方は `left` ではなく `transform`: **CSS の遷移（`mini-portrait.module.css` の
 * `transition`）が毎フレーム引き直される**ので、横画では少し遅れてばねで寄り、戻りでは
 * （間合いが 0 なので）そのフレームの筆先にそのまま乗る。行が変わるときも縦横が同時に
 * 動くので、飛ばずに滑る。
 */
function followStyle(tip: BrushTip): CSSProperties {
  return { transform: `translate3d(${px(tip.x)}, ${px(tip.bottom)}, 0) translateY(-100%)` }
}

/** 読み上げ上もキャラビューの立ち絵と見分けが付くようにする（同じ姿がもう1体居るため）。 */
function miniAltText(name: string | undefined): string {
  return name === undefined ? "式神" : `${name}の式神`
}

function px(value: number): string {
  return `${String(Math.round(value))}px`
}
