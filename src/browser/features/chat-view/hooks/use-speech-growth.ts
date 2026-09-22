// 雑談のログで、**末尾のセリフが育つ**見せ方（docs/design.md 13.7「末尾のセリフは育つ」）。
//
// **セリフは `speech` イベントで1件まるごと届く**（`speak` の戻りが `"ok"` になる時点で全文が
// ある）ので、**サーバの契約は何も変えず、出す文字数だけをブラウザ側で進める**。吹き出しの
// 大きさは中身が決めるので、文字が増えればその行がそのまま膨らむ。
//
// **仕事のときのレポート（`features/main-view/report-reveal.ts`）とは作りが逆**: あちらは
// 完成品を一度に作って `clip-path` で見せる範囲を進める（表や mermaid を未完成のソースで
// 作り直さないため）ので**高さが動かない**。こちらは**文字を足していく** — 膨らむこと自体が
// 見せたいものなので、高さが動くほうを採る（追いかけるのは
// `use-stick-to-bottom.ts`）。
//
// **育てるかどうかはマウントした時点で決まる**（report-reveal と同じ）。あとから最新で
// なくなったら、その行は途中でも出し切る——2つの行が同時に育つと、どちらが「いま」の
// セリフなのか読めなくなる。

import { useCallback, useEffect, useRef, useState } from "react"

import { prefersReducedMotion } from "../../../lib/reduced-motion.ts"

/**
 * 文字1つぶんの持ち時間（ms）。**育つ速さはこの値だけで決まる**。
 *
 * レポートの筆（`features/main-view/reveal-plan.ts` の 40ms）より少し速い——あちらは見出しから
 * 見出しまでをZ字1回でまとめて通るので1文字あたりが長くてよいが、こちらは**1文字ずつ出す**ので
 * 同じにすると読む速さに追いつかない。
 *
 * **長いセリフほど全体が伸びるのは受け入れる**（レポートと同じ立場。全体に予算を置いて按分
 * すると、長いセリフほど1文字が速くなって「目で追える速さ」という狙いが長さで崩れる）。
 * 待てないときは押せば出し切る。
 */
const MS_PER_CHARACTER = 30

/**
 * 育ち具合。**「まだ育っている」と「出し切った」を `| undefined` で書き分けない**
 * （docs/coding-standards.md「複数の「無い」が1つの状態」）。
 */
type Growth = { readonly kind: "growing"; readonly shownLength: number } | { readonly kind: "done" }

export type SpeechGrowth = {
  /** いま出す文面（育っている間は先頭からの一部、出し切ったあとは全文）。 */
  readonly shown: string
  readonly growing: boolean
  /** 途中で全部出す（押されたとき・最新でなくなったとき）。出し切ったあとは何も起きない。 */
  readonly finish: () => void
}

/**
 * `text` を1文字ずつ出す。`grow` が立っていたら**マウントした時点から**育て、寝ていれば
 * 最初から全文を出す。`grow` が立ったまま最新でなくなった（次のセリフが来た）ときは、
 * 呼び出し側が `grow` を下ろせばその場で出し切る。
 *
 * **「動きを減らす」設定のときは育てない**（`lib/reduced-motion.ts`。CSS の規則は
 * アニメーションにしか効かないので、時間で進める演出はここで自分で見る）。
 */
export function useSpeechGrowth(text: string, grow: boolean): SpeechGrowth {
  // 育てるかどうかは**マウントした時点で決まる**（あとから最新でなくなったら下の effect が
  // 止め、出す文面は下の戻り値が畳む）。**「動きを減らす」もここで一緒に見る** — 効果の中で
  // 初期値を入れ直すと、描き直しが1回余計に走る。
  const [growOnMount] = useState(() => grow && !prefersReducedMotion())
  const [growth, setGrowth] = useState<Growth>(
    growOnMount ? { kind: "growing", shownLength: 0 } : { kind: "done" },
  )
  // 進めているフレームの番号（React の外の資源を持つ可変の入れ物）。
  const frameRef = useRef<number | undefined>(undefined)
  const length = text.length

  const stopFrame = useCallback(() => {
    if (frameRef.current !== undefined) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = undefined
    }
  }, [])

  const finish = useCallback(() => {
    stopFrame()
    // **出し切ったあとは同じ値を返す**（新しい object を返すと、押されるたびに描き直しが走る）。
    setGrowth((current) => (current.kind === "done" ? current : { kind: "done" }))
  }, [stopFrame])

  // タイマー（docs/coding-standards.md「React」の4類型）。**経過時間から出す文字数を決める**ので、
  // フレームが飛んでも速さが変わらない。
  useEffect(() => {
    if (!growOnMount) {
      return undefined
    }
    const startedAt = performance.now()
    const tick = (): void => {
      const shownLength = Math.floor((performance.now() - startedAt) / MS_PER_CHARACTER)
      if (shownLength >= length) {
        finish()
        return
      }
      setGrowth({ kind: "growing", shownLength })
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return stopFrame
  }, [growOnMount, length, finish, stopFrame])

  // 最新でなくなったら育ちを止める（React の外の資源＝フレームの後始末だけで、state は触らない。
  // **出し切った見え方は下の戻り値がその場で畳む**ので、書き戻す必要が無い）。
  useEffect(() => {
    if (!grow) {
      stopFrame()
    }
  }, [grow, stopFrame])

  // **「最新でなくなった」は state に書き戻さず、ここで畳む**（docs/coding-standards.md
  // 「useEffect の代わりに使うもの」。props から出せる値は描くときに出す）。
  return growth.kind === "growing" && grow
    ? { shown: text.slice(0, growth.shownLength), growing: true, finish }
    : { shown: text, growing: false, finish }
}
