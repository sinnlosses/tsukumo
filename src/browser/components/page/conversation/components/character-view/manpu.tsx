// セリフが届いた瞬間に、立ち絵の顔のまわりへ1回だけ出る漫符。
// 立ち絵とは別の要素で、パックの素材には触れない。左の列の領域は中身を切るので、body へ出して画面の座標に置く。
// 届くたびに呼ぶ側が `key` を替えて作り直し、作った瞬間に顔の位置を測って、そこを原点に CSS が1回だけ動かす。

import { useRef, type CSSProperties, type ReactElement } from "react"
import { createPortal } from "react-dom"

import type { FaceAt } from "../../../../../../shared/character-pack/character-definition.ts"
import { useExternalSync } from "../../../../../hooks/use-external-sync.ts"
import { faceOnScreen, gloomOnScreen, pictureOnScreen } from "../../domain/face-on-screen.ts"
import type { SpeechManpu } from "../../domain/speech-arrival.ts"
import styles from "./character-view.module.css"

const PORTRAIT_SELECTOR = "[data-character-stage] [data-expression]"
const AREA_SELECTOR = "[data-character-stage] > *"

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
const SURPRISES: readonly Piece[] = [-60, -30, 0, 30, 60].map((degree) => ({
  x: 0,
  y: -78,
  vars: { "--r": `${degree}deg` },
}))
const VLINES: readonly Piece[] = [-52, -26, 26, 52].map((x) => ({ x, y: -62 }))
const NOTES: readonly (Piece & { readonly glyph: string; readonly kind: "note" | "star" })[] = [
  { glyph: "♪", kind: "note", x: 0, y: -26, vars: { "--dx": "-70px", "--dy": "-60px" } },
  { glyph: "★", kind: "star", x: 0, y: -26, vars: { "--dx": "60px", "--dy": "-80px" } },
  { glyph: "♫", kind: "note", x: 0, y: -26, vars: { "--dx": "90px", "--dy": "-30px" } },
  { glyph: "★", kind: "star", x: 0, y: -26, vars: { "--dx": "-40px", "--dy": "-100px" } },
]
const SWIRL: Offset = { x: 52, y: -52 }

export function Manpu({
  manpu,
  faceAt,
}: {
  readonly manpu: SpeechManpu
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
    const layout = document.querySelector(AREA_SELECTOR)
    const layoutBox = layout?.getBoundingClientRect()
    const area =
      layoutBox !== undefined && layoutBox.width > 0 && layoutBox.height > 0 ? layoutBox : box
    const picture = pictureOnScreen({
      box,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    })
    const gloom = gloomOnScreen({ portrait: picture, area })
    anchor.style.setProperty("--gloom-left", `${gloom.left}px`)
    anchor.style.setProperty("--gloom-top", `${gloom.top}px`)
    anchor.style.setProperty("--gloom-width", `${gloom.width}px`)
    anchor.style.setProperty("--gloom-height", `${gloom.height}px`)
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

/** 外側が領域で切る箱、内側が下りる影。 */
function Gloom(): ReactElement {
  return (
    <span className={styles["manpu-gloom"]}>
      <span className={styles["manpu-gloom-shade"]} />
    </span>
  )
}

function pieces(manpu: SpeechManpu): ReactElement {
  switch (manpu) {
    case "surprise":
      return (
        <>
          {SURPRISES.map((piece) => (
            <span
              key={piece.vars?.["--r"]}
              className={styles["manpu-surprise"]}
              style={pieceStyle(piece)}
            />
          ))}
        </>
      )
    case "gloom":
      return (
        <>
          <Gloom />
          {VLINES.map((piece) => (
            <span key={piece.x} className={styles["manpu-vline"]} style={pieceStyle(piece)} />
          ))}
        </>
      )
    case "notes":
      return (
        <>
          {NOTES.map((piece) => (
            <span
              key={piece.vars?.["--dx"]}
              className={styles[piece.kind === "note" ? "manpu-notes-note" : "manpu-notes-star"]}
              style={pieceStyle(piece)}
            >
              {piece.glyph}
            </span>
          ))}
        </>
      )
    case "swirl":
      return (
        <span className={styles["manpu-swirl"]} style={pieceStyle({ ...SWIRL })}>
          ◎
        </span>
      )
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
