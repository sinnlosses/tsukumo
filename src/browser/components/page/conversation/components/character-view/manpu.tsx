// セリフが届いた瞬間に、立ち絵の顔のまわりへ1回だけ出る漫符。
// 立ち絵とは別の要素で、パックの素材には触れない。左の列の領域は中身を切るので、body へ出して画面の座標に置く。
// 届くたびに呼ぶ側が `key` を替えて作り直し、作った瞬間に顔の位置を測って、そこを原点に CSS が1回だけ動かす。

import { useRef, type CSSProperties, type ReactElement } from "react"
import { createPortal } from "react-dom"

import type { FaceAt } from "../../../../../../shared/character-pack/character-definition.ts"
import { useExternalSync } from "../../../../../hooks/use-external-sync.ts"
import { faceOnScreen } from "../../domain/face-on-screen.ts"
import type { SpeechManpu } from "../../domain/speech-arrival.ts"
import styles from "./character-view.module.css"

const PORTRAIT_SELECTOR = "[data-character-stage] [data-expression]"

/** 顔の位置（原点）からの距離（px）。 */
type Offset = { readonly x: number; readonly y: number }

type Piece = Offset & { readonly vars?: Readonly<Record<string, string>> }

const NOTE: readonly Piece[] = [{ x: 72, y: -16, vars: { "--dx": "6px", "--dy": "-26px" } }]
const TWINKLES: readonly Piece[] = [
  { x: -75, y: -24, vars: { "--delay": "0s" } },
  { x: 84, y: -40, vars: { "--delay": "0.15s" } },
  { x: 60, y: 24, vars: { "--delay": "0.3s" } },
]
const SWEATS: readonly Piece[] = [{ x: 40, y: -26 }]
const THINK: Offset = { x: 66, y: -96 }
const GLINT: Offset = { x: 40, y: 24 }

export function Manpu({
  manpu,
  faceAt,
}: {
  readonly manpu: Exclude<SpeechManpu, "none">
  readonly faceAt: FaceAt
}): ReactElement {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const { x, y } = faceAt

  useExternalSync(() => {
    const anchor = anchorRef.current
    const portrait = document.querySelector(PORTRAIT_SELECTOR)
    const image = portrait?.querySelector("img")
    if (anchor === null || portrait === null || image === null || image === undefined) {
      return
    }
    const box = portrait.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) {
      return
    }
    const face = faceOnScreen({
      box,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      faceAt: { x, y },
    })
    anchor.style.setProperty("--face-x", `${face.x}px`)
    anchor.style.setProperty("--face-y", `${face.y}px`)
    anchor.dataset["placed"] = ""
  }, [x, y])

  return createPortal(
    <span ref={anchorRef} className={styles["manpu"]} data-manpu={manpu} aria-hidden="true">
      {pieces(manpu)}
    </span>,
    document.body,
  )
}

function pieceStyle({ x, y, vars }: Piece): CSSProperties {
  return { "--x": `${x}px`, "--y": `${y}px`, ...vars }
}

function pieces(manpu: Exclude<SpeechManpu, "none">): ReactElement {
  switch (manpu) {
    case "note":
      return (
        <>
          {NOTE.map((piece) => (
            <span key={piece.x} className={styles["manpu-note"]} style={pieceStyle(piece)}>
              ♪
            </span>
          ))}
        </>
      )
    case "think":
      return (
        <span className={styles["manpu-think"]} style={pieceStyle({ ...THINK })}>
          <i />
          <i />
          <span>…</span>
        </span>
      )
    case "twinkle":
      return (
        <>
          {TWINKLES.map((piece) => (
            <span key={piece.x} className={styles["manpu-twinkle"]} style={pieceStyle(piece)}>
              ✦
            </span>
          ))}
        </>
      )
    case "sweat":
      return (
        <>
          {SWEATS.map((piece) => (
            <span key={piece.x} className={styles["manpu-sweat"]} style={pieceStyle(piece)} />
          ))}
        </>
      )
    case "glint":
      return (
        <>
          <span className={styles["manpu-eye-star"]} style={pieceStyle(GLINT)}>
            ✦
          </span>
          <span className={styles["manpu-glint"]} style={pieceStyle(GLINT)} />
        </>
      )
  }
}
