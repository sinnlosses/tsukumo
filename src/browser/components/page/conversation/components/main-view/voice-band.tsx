// 声の帯。入力欄のすぐ上に吹き出し1件ぶんの高さを取り、メインビューの直近のセリフをそこへ描く。
// 帯はメインビューのスクロール容器の外にあるので、レポートをスクロールしても吹き出しが本文に重ならない。

import { useRef, type ReactElement, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { useMountEffect } from "../../../../../hooks/use-mount-effect.ts"
import { useVoiceBand } from "../../stores/voice-band.ts"
import styles from "./main-view.module.css"

/**
 * レイアウトの差し込み口に置く帯の器。中身は `VoiceBandPortal` が描く。
 * 要素を知らせるのは付いたときと外れたときの1回ずつ。描き直しのたびに知らせ直すと、帯の中身が作り直されて出方の動きが掛かり直す。
 */
export function VoiceBand(): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const open = useVoiceBand((state) => state.open)
  const close = useVoiceBand((state) => state.close)
  useMountEffect(() => {
    if (ref.current === null) {
      return undefined
    }
    open(ref.current)
    return close
  })
  return <div ref={ref} className={styles["voice-band"]} data-voice-slot="" />
}

/** 帯があれば子を帯の中へ描く。帯が無い（狭い画面・雑談）ときは何も描かない。 */
export function VoiceBandPortal(props: { readonly children: ReactNode }): ReactNode {
  const band = useVoiceBand((state) => state.band)
  return band.kind === "open" ? createPortal(props.children, band.element) : undefined
}
