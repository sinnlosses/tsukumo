// セリフが届いた瞬間やターンの終わりに、立ち絵の顔のまわりへ1回だけ出るエフェクト。
// 立ち絵とは別の要素で、パックの素材には触れない。左の列の領域は中身を切るので、body へ出して画面の座標に置く。
// 届くたびに呼ぶ側が `key` を替えて作り直し、作った瞬間に顔の位置を測って、そこを原点に CSS が1回だけ動かす。

import { useId, useRef, type CSSProperties, type ReactElement } from "react"
import { createPortal } from "react-dom"

import type { FaceAt } from "../../../../../../shared/character-pack/character-definition.ts"
import type { EndingManpu } from "../../../../../domain/portrait-motion.ts"
import { useExternalSync } from "../../../../../hooks/use-external-sync.ts"
import { faceOnScreen, gloomOnScreen, pictureOnScreen } from "../../domain/face-on-screen.ts"
import type { SpeechManpu } from "../../domain/speech-arrival.ts"
import styles from "./character-view.module.css"

const PORTRAIT_SELECTOR = "[data-character-stage] [data-expression]"
const AREA_SELECTOR = "[data-character-stage] > *"

/** 顔の位置（原点）からの距離（px）。 */
type Offset = { readonly x: number; readonly y: number }

type Piece = Offset & { readonly vars?: Readonly<Record<string, string>> }

/** 絵の幅に比例する単位（`--u`）での位置と、部品ごとの値。値の数は CSS が `--u` を掛ける。 */
type UnitPiece = Offset & { readonly vars?: Readonly<Record<string, number | string>> }

/** 普段のエフェクトより大きく出す、ターンの終わり方。 */
const LOUD: ReadonlySet<SpeechManpu | EndingManpu> = new Set(["stars", "shock"])

const FINISH_STARS: readonly Piece[] = [
  { x: -90, y: 36, vars: { "--x": "calc(var(--pic-w) * -0.3)", "--dx": "-40px", "--dy": "-90px" } },
  { x: 90, y: 36, vars: { "--x": "calc(var(--pic-w) * 0.3)", "--dx": "40px", "--dy": "-100px" } },
  { x: 108, y: 36, vars: { "--x": "calc(var(--pic-w) * 0.36)", "--dx": "20px", "--dy": "-40px" } },
]
const SHOCKS: readonly Piece[] = [
  { x: 60, y: -24 },
  { x: -60, y: -12 },
]

const RING_BEADS: readonly UnitPiece[] = [
  { x: 18, y: -20, vars: { "--s": 8, "--dx": 22, "--dy": -30, "--d": "0s" } },
  { x: 34, y: -44, vars: { "--s": 12, "--dx": 18, "--dy": -26, "--d": "0.15s" } },
]
const RING: Offset = { x: 84, y: -86 }
const SPARKLES: readonly UnitPiece[] = [
  { x: -60, y: -40, vars: { "--s": 30, "--d": "0s" } },
  { x: 64, y: -58, vars: { "--s": 22, "--d": "0.2s" } },
]
const DUSTS: readonly UnitPiece[] = [0, 1, 2, 3, 4, 5].map((i) => {
  const angle = (i / 6) * Math.PI * 2
  return {
    x: Math.round(Math.cos(angle) * 30),
    y: Math.round(Math.sin(angle) * 24 - 20),
    vars: {
      "--dx": Math.round(Math.cos(angle) * 46),
      "--dy": Math.round(Math.sin(angle) * 38 - 20),
      "--d": `${0.1 + (i % 3) * 0.08}s`,
    },
  }
})
const DROPS: readonly UnitPiece[] = [
  { x: -64, y: -50, vars: { "--s": 22, "--dx": -40, "--dy": -30, "--rot": "-28deg", "--d": "0s" } },
  {
    x: -72,
    y: -24,
    vars: { "--s": 16, "--dx": -50, "--dy": -4, "--rot": "-44deg", "--d": "0.1s" },
  },
  {
    x: -48,
    y: -70,
    vars: { "--s": 13, "--dx": -22, "--dy": -40, "--rot": "-10deg", "--d": "0.2s" },
  },
]
const SPLASHES: readonly UnitPiece[] = [
  { x: -108, y: -82, vars: { "--d": "0.35s" } },
  { x: -124, y: -30, vars: { "--d": "0.42s" } },
  { x: -72, y: -112, vars: { "--d": "0.48s" } },
]
const SLASH: UnitPiece = { x: 112, y: -18, vars: { "--w": 110 } }
const FLARE: Offset = { x: 84, y: -6 }
const RIPPLE: Offset = { x: 0, y: -30 }
const RAYS: readonly UnitPiece[] = [-50, -18, 18, 50].map((degree) => {
  const angle = ((degree - 90) * Math.PI) / 180
  return {
    x: Math.round(Math.cos(angle) * 50),
    y: Math.round(Math.sin(angle) * 50 - 30),
    vars: { "--r": `${degree}deg` },
  }
})
/** 雨の筋の、影の箱の中の左端（%）と遅れ（秒）。箱は絵の左右へ広いので、絵の幅に当たる 30〜70% に降らせる。 */
const RAINS: readonly { readonly left: number; readonly delay: number }[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8,
].map((i) => ({ left: 30 + ((i * 37) % 40), delay: Number(((i * 0.13) % 0.9).toFixed(2)) }))
const DRIPS: readonly UnitPiece[] = [
  { x: -58, y: 96, vars: { "--d": "0.5s" } },
  { x: 44, y: 96, vars: { "--d": "0.8s" } },
]
const PETAL_COLORS = ["petal", "note", "accent", "star"] as const
const PETALS: readonly (UnitPiece & { readonly color: (typeof PETAL_COLORS)[number] })[] = [
  0, 1, 2, 3, 4, 5, 6, 7,
].map((i) => {
  const angle = -Math.PI / 2 + (i / 7 - 0.5) * Math.PI * 1.2
  const distance = (55 + (i % 4) * 14) * 0.75
  return {
    x: 0,
    y: -40,
    color: PETAL_COLORS[i % PETAL_COLORS.length] ?? "petal",
    vars: {
      "--dx": Math.round(Math.cos(angle) * distance * 1.3),
      "--dy": Math.round(Math.sin(angle) * distance),
      "--rot": `${(i % 2 === 1 ? 1 : -1) * (240 + i * 20)}deg`,
      "--d": `${(i % 5) * 0.04}s`,
    },
  }
})
const BLOOM: Offset = { x: 0, y: -40 }
const BUBBLES: readonly UnitPiece[] = [
  { x: 40, y: -30, vars: { "--s": 26, "--dx": -10, "--dy": -90, "--d": "0s" } },
  { x: 66, y: -10, vars: { "--s": 17, "--dx": 16, "--dy": -110, "--d": "0.3s" } },
  { x: 80, y: -40, vars: { "--s": 20, "--dx": 10, "--dy": -120, "--d": "0.6s" } },
]
const ASK: Offset = { x: 70, y: -50 }

export function Manpu({
  manpu,
  faceAt,
}: {
  readonly manpu: SpeechManpu | EndingManpu
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
    anchor.style.setProperty("--pic-w", `${picture.width}px`)
    anchor.style.setProperty("--gloom-left", `${gloom.left}px`)
    anchor.style.setProperty("--gloom-top", `${gloom.top}px`)
    anchor.style.setProperty("--gloom-width", `${gloom.width}px`)
    anchor.style.setProperty("--gloom-height", `${gloom.height}px`)
    anchor.dataset["placed"] = ""
  }, [x, y])

  return createPortal(
    <span
      ref={anchorRef}
      className={styles["manpu"]}
      data-manpu={manpu}
      data-calm={!LOUD.has(manpu)}
      aria-hidden="true"
    >
      {pieces(manpu)}
    </span>,
    document.body,
  )
}

function pieceStyle({ x, y, vars }: Piece): CSSProperties {
  return { "--x": `${x}px`, "--y": `${y}px`, ...vars }
}

/** 位置と数の値に `--u` を掛ける。文字の値（秒・角度）はそのまま渡す。 */
function unitStyle({ x, y, vars = {} }: UnitPiece): CSSProperties {
  const scaled = Object.fromEntries(
    Object.entries(vars).map(([name, value]) => [
      name,
      typeof value === "number" ? `calc(var(--u) * ${value})` : value,
    ]),
  )
  return { "--x": `calc(var(--u) * ${x})`, "--y": `calc(var(--u) * ${y})`, ...scaled }
}

/** 外側が領域で切る箱、内側が下りる影。 */
function Gloom(): ReactElement {
  return (
    <span className={styles["manpu-gloom"]}>
      <span className={styles["manpu-gloom-shade"]} />
    </span>
  )
}

/** 4方向に伸びる光の星。塗りのグラデーションは部品ごとに id を分ける。 */
function Star({ className, style }: { readonly className: string; readonly style: CSSProperties }) {
  const id = useId()
  return (
    <svg className={className} style={style} viewBox="0 0 100 100">
      <defs>
        <radialGradient id={id}>
          <stop offset="0" stopColor="white" />
          <stop offset="1" stopColor="var(--star-edge)" />
        </radialGradient>
      </defs>
      <path
        d="M50 0 C54 38 62 46 100 50 C62 54 54 62 50 100 C46 62 38 54 0 50 C38 46 46 38 50 0Z"
        fill={`url(#${id})`}
      />
    </svg>
  )
}

function pieces(manpu: SpeechManpu | EndingManpu): ReactElement {
  switch (manpu) {
    case "stars":
      return (
        <>
          {FINISH_STARS.map((piece) => (
            <span key={piece.x} className={styles["manpu-finish-star"]} style={pieceStyle(piece)}>
              ★
            </span>
          ))}
        </>
      )
    case "shock":
      return (
        <>
          <Gloom />
          {SHOCKS.map((piece) => (
            <span key={piece.x} className={styles["manpu-shock"]} style={pieceStyle(piece)}>
              ϟ
            </span>
          ))}
        </>
      )
    case "ask":
      return (
        <>
          <span className={styles["manpu-ask-ping"]} style={unitStyle(ASK)} />
          <span className={styles["manpu-ask"]} style={unitStyle(ASK)}>
            ？
          </span>
        </>
      )
    case "ring":
      return (
        <>
          {RING_BEADS.map((piece) => (
            <span key={piece.x} className={styles["manpu-ring-bead"]} style={unitStyle(piece)} />
          ))}
          <svg className={styles["manpu-ring"]} style={unitStyle(RING)} viewBox="0 0 84 84">
            <circle className={styles["manpu-ring-track"]} cx="42" cy="42" r="36" />
            <g className={styles["manpu-ring-orbit"]}>
              <circle cx="42" cy="6" r="3" />
              <circle cx="78" cy="42" r="2.2" opacity="0.8" />
              <circle cx="42" cy="78" r="1.6" opacity="0.6" />
            </g>
          </svg>
        </>
      )
    case "sparkle":
      return (
        <>
          {SPARKLES.map((piece) => (
            <Star
              key={piece.x}
              className={styles["manpu-sparkle"] ?? ""}
              style={unitStyle(piece)}
            />
          ))}
          {DUSTS.map((piece) => (
            <span
              key={`${piece.x},${piece.y}`}
              className={styles["manpu-dust"]}
              style={unitStyle(piece)}
            />
          ))}
        </>
      )
    case "sweat":
      return (
        <>
          {DROPS.map((piece) => (
            <span key={piece.x} className={styles["manpu-drop"]} style={unitStyle(piece)} />
          ))}
          {SPLASHES.map((piece) => (
            <span key={piece.x} className={styles["manpu-splash"]} style={unitStyle(piece)} />
          ))}
        </>
      )
    case "flash":
      return (
        <>
          <span className={styles["manpu-slash"]} style={unitStyle(SLASH)} />
          <Star className={styles["manpu-flare"] ?? ""} style={unitStyle(FLARE)} />
        </>
      )
    case "ripple":
      return (
        <>
          <span className={styles["manpu-ripple"]} style={unitStyle(RIPPLE)} />
          {RAYS.map((piece) => (
            <span
              key={piece.vars?.["--r"]}
              className={styles["manpu-ray"]}
              style={unitStyle(piece)}
            />
          ))}
        </>
      )
    case "rain":
      return (
        <>
          <span className={styles["manpu-gloom"]}>
            <span className={styles["manpu-rain-veil"]} />
            {RAINS.map(({ left, delay }) => (
              <span
                key={left}
                className={styles["manpu-rain"]}
                style={{ "--left": `${left}%`, "--d": `${delay}s` }}
              />
            ))}
          </span>
          {DRIPS.map((piece) => (
            <span key={piece.x} className={styles["manpu-drip"]} style={unitStyle(piece)} />
          ))}
        </>
      )
    case "petals":
      return (
        <>
          <span className={styles["manpu-bloom"]} style={unitStyle(BLOOM)} />
          {PETALS.map((piece) => (
            <span
              key={piece.vars?.["--rot"]}
              className={styles["manpu-petal"]}
              data-color={piece.color}
              style={unitStyle(piece)}
            />
          ))}
        </>
      )
    case "bubbles":
      return (
        <>
          {BUBBLES.map((piece) => (
            <span key={piece.x} className={styles["manpu-bubble"]} style={unitStyle(piece)} />
          ))}
        </>
      )
  }
}
