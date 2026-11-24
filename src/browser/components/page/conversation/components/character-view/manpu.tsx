// セリフが届いた瞬間やターンの終わりに、立ち絵の顔のまわりへ1回だけ出るエフェクト。
// 立ち絵とは別の要素で、パックの素材には触れない。左の列の領域は中身を切るので、body へ出して画面の座標に置く。
// 届くたびに呼ぶ側が `key` を替えて作り直し、作った瞬間に顔の位置を測って、そこを原点に CSS が1回だけ動かす。

import { useId, useRef, type CSSProperties, type ReactElement } from "react"
import { createPortal } from "react-dom"

import type { FaceAt } from "../../../../../../shared/character-pack/character-definition.ts"
import type { EndingManpu } from "../../../../../domain/portrait-motion.ts"
import { useExternalSync } from "../../../../../hooks/use-external-sync.ts"
import { useMountEffect } from "../../../../../hooks/use-mount-effect.ts"
import { faceOnScreen, gloomOnScreen, pictureOnScreen } from "../../domain/face-on-screen.ts"
import type { SpeechManpu } from "../../domain/speech-arrival.ts"
import styles from "./character-view.module.css"

const PORTRAIT_SELECTOR = "[data-character-stage] [data-expression]"
const AREA_SELECTOR = "[data-character-stage] > *"

/** 顔の位置（原点）からの距離（px）。 */
type Offset = { readonly x: number; readonly y: number }

/** 絵の幅に比例する単位（`--u`）での位置と、部品ごとの値。値の数は CSS が `--u` を掛ける。 */
type UnitPiece = Offset & { readonly vars?: Readonly<Record<string, number | string>> }

/** 普段のエフェクトより大きく出す、ターンの終わり方。 */
const LOUD: ReadonlySet<SpeechManpu | EndingManpu> = new Set(["stars", "shock"])

const FINISH_HALOS: readonly UnitPiece[] = [
  { x: 0, y: -10, vars: { "--d": "0s" } },
  { x: 0, y: -10, vars: { "--d": "0.2s" } },
]
const FINISH_BEAMS: readonly { readonly degree: number; readonly length: number }[] = Array.from(
  { length: 12 },
  (_, i) => ({ degree: i * 30 + 15, length: i % 2 === 1 ? 44 : 72 }),
)
const FINISH_SPARKLES: readonly UnitPiece[] = [
  { x: -86, y: -56, vars: { "--s": 38, "--d": "0.2s" } },
  { x: 92, y: -70, vars: { "--s": 30, "--d": "0.32s" } },
  { x: 76, y: 40, vars: { "--s": 22, "--d": "0.44s" } },
  { x: -72, y: 46, vars: { "--s": 20, "--d": "0.55s" } },
  { x: 8, y: -110, vars: { "--s": 26, "--d": "0.38s" } },
]
const FAIL_SHARDS: readonly UnitPiece[] = [
  { x: -50, y: -50, vars: { "--r": "10deg", "--d": "0.1s" } },
  { x: -20, y: -50, vars: { "--r": "-6deg", "--d": "0.25s" } },
  { x: 30, y: -50, vars: { "--r": "8deg", "--d": "0.15s" } },
  { x: 60, y: -50, vars: { "--r": "-10deg", "--d": "0.32s" } },
]

const THOUGHT_BUBBLES: readonly UnitPiece[] = [
  { x: 34, y: -78, vars: { "--s": 7, "--d": "0s" } },
  { x: 50, y: -98, vars: { "--s": 10, "--d": "0.1s" } },
  { x: 64, y: -120, vars: { "--s": 14, "--d": "0.2s" } },
]
const THOUGHT_CLOUD: Offset = { x: 96, y: -150 }
const THOUGHT_CLOUD_PATH =
  "M20 64 C8 64 2 56 4 47 C5 40 11 36 17 36 C15 26 22 18 32 19 C36 10 48 6 57 12 C64 7 76 10 79 20 C88 21 93 30 90 39 C95 45 93 58 82 62 C78 64 74 64 70 64 Z"
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
const SWEAT_DROP: UnitPiece = { x: -40, y: -14, vars: { "--s": 32 } }
const SLASH: UnitPiece = { x: 112, y: -18, vars: { "--w": 110 } }
const FLARE: Offset = { x: 84, y: -6 }
const EXCLAIM: Offset = { x: 58, y: -92 }
const EXCLAIM_TICKS: readonly UnitPiece[] = [
  { x: 34, y: -96, vars: { "--r": "-40deg", "--dx": -8, "--dy": -8 } },
  { x: 58, y: -128, vars: { "--r": "0deg", "--dx": 0, "--dy": -10 } },
  { x: 82, y: -96, vars: { "--r": "40deg", "--dx": 8, "--dy": -8 } },
]
/** 雨の筋の、影の箱の中の左端（%）と遅れ（秒）。箱は絵の左右へ広いので、絵の幅に当たる 30〜70% に降らせる。 */
const RAINS: readonly { readonly left: number; readonly delay: number }[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8,
].map((i) => ({ left: 30 + ((i * 37) % 40), delay: Number(((i * 0.13) % 0.9).toFixed(2)) }))
const DRIPS: readonly UnitPiece[] = [
  { x: -58, y: 96, vars: { "--d": "0.5s" } },
  { x: 44, y: 96, vars: { "--d": "0.8s" } },
]
const PETAL_COLORS = ["petal", "note", "accent", "star"] as const
type PetalPiece = UnitPiece & { readonly color: (typeof PETAL_COLORS)[number] }

const PETALS = petalPieces(8, 1.2, 0.75)
const FINISH_PETALS = petalPieces(20, 1.9, 1.5)
const BLOOM: Offset = { x: 0, y: -40 }
const FINISH_BLOOM: UnitPiece = { x: 0, y: -40, vars: { "--bloom": "1.8" } }
const BUBBLES: readonly UnitPiece[] = [
  { x: 40, y: -30, vars: { "--s": 26, "--dx": -10, "--dy": -90, "--d": "0s" } },
  { x: 66, y: -10, vars: { "--s": 17, "--dx": 16, "--dy": -110, "--d": "0.3s" } },
  { x: 80, y: -40, vars: { "--s": 20, "--dx": 10, "--dy": -120, "--d": "0.6s" } },
]
const ASK: Offset = { x: 70, y: -50 }

export function Manpu({
  manpu,
  faceAt,
  onShown,
}: {
  readonly manpu: SpeechManpu | EndingManpu
  readonly faceAt: FaceAt
  /** 作ったときに1回だけ呼ぶ。 */
  readonly onShown: (manpu: SpeechManpu | EndingManpu) => void
}): ReactElement {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const { x, y } = faceAt

  useMountEffect(() => {
    onShown(manpu)
  })

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

/** 失敗の翳り。立ち絵の画の形に重ね、色を抜く層と縁を暗くする層を置く。`<Portrait>` の中に置く。 */
export function FailShade({ url }: { readonly url: string }): ReactElement {
  return (
    <span
      className={styles["manpu-fail-shade"]}
      style={{ "--portrait-image": `url(${JSON.stringify(url)})` }}
    >
      <span className={styles["manpu-fail-fade"]} />
      <span className={styles["manpu-fail-rim"]} />
    </span>
  )
}

/** 花びらを頭の上から弧に散らす。`spread` は弧の広さ（π の倍数）、`reach` は飛ぶ距離の倍率。 */
function petalPieces(count: number, spread: number, reach: number): readonly PetalPiece[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i / (count - 1) - 0.5) * Math.PI * spread
    const distance = (55 + (i % 4) * 14) * reach
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

/** ガラスの雲。輪郭は線1本で、中の点3つが左から順に灯る。塗りのグラデーションは部品ごとに id を分ける。 */
function ThoughtCloud({ style }: { readonly style: CSSProperties }) {
  const id = useId()
  return (
    <span className={styles["manpu-thought-cloud"]} style={style}>
      <svg
        className={styles["manpu-thought-outline"]}
        viewBox="0 0 94 68"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0.24" />
            <stop offset="1" stopColor="var(--manpu-glow-cool)" stopOpacity="0.07" />
          </linearGradient>
        </defs>
        <path d={THOUGHT_CLOUD_PATH} fill={`url(#${id})`} />
      </svg>
      {[0, 1, 2].map((i) => (
        <span key={i} className={styles["manpu-thought-dot"]} style={{ "--i": i }} />
      ))}
    </span>
  )
}

function pieces(manpu: SpeechManpu | EndingManpu): ReactElement {
  switch (manpu) {
    case "stars":
      return (
        <>
          <span className={styles["manpu-gloom"]}>
            <span className={styles["manpu-finish-glow"]} />
            <span className={styles["manpu-origin"]}>
              {FINISH_HALOS.map((piece) => (
                <span
                  key={piece.vars?.["--d"]}
                  className={styles["manpu-halo"]}
                  style={unitStyle(piece)}
                />
              ))}
              {FINISH_BEAMS.map(({ degree, length }) => (
                <span
                  key={degree}
                  className={styles["manpu-beam-arm"]}
                  style={{ "--r": `${degree}deg`, "--x": "0px", "--y": "calc(var(--u) * -10)" }}
                >
                  <span className={styles["manpu-beam"]} style={{ "--len": String(length) }} />
                </span>
              ))}
              {FINISH_SPARKLES.map((piece) => (
                <Star
                  key={piece.x}
                  className={styles["manpu-sparkle"] ?? ""}
                  style={unitStyle(piece)}
                />
              ))}
              <span className={styles["manpu-bloom"]} style={unitStyle(FINISH_BLOOM)} />
              {FINISH_PETALS.map((piece) => (
                <span
                  key={piece.vars?.["--rot"]}
                  className={styles["manpu-petal"]}
                  data-color={piece.color}
                  style={unitStyle(piece)}
                />
              ))}
            </span>
          </span>
        </>
      )
    case "shock":
      return (
        <>
          {FAIL_SHARDS.map((piece) => (
            <span key={piece.x} className={styles["manpu-shard"]} style={unitStyle(piece)} />
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
    case "thought":
      return (
        <>
          {THOUGHT_BUBBLES.map((piece) => (
            <span
              key={piece.x}
              className={styles["manpu-thought-bubble"]}
              style={unitStyle(piece)}
            />
          ))}
          <ThoughtCloud style={unitStyle(THOUGHT_CLOUD)} />
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
          <span className={styles["manpu-sweat-trail"]} style={unitStyle(SWEAT_DROP)} />
          <span className={styles["manpu-drop"]} style={unitStyle(SWEAT_DROP)} />
        </>
      )
    case "flash":
      return (
        <>
          <span className={styles["manpu-slash"]} style={unitStyle(SLASH)} />
          <Star className={styles["manpu-flare"] ?? ""} style={unitStyle(FLARE)} />
        </>
      )
    case "exclaim":
      return (
        <>
          <span className={styles["manpu-exclaim"]} style={unitStyle(EXCLAIM)}>
            ！
          </span>
          {EXCLAIM_TICKS.map((piece) => (
            <span
              key={piece.vars?.["--r"]}
              className={styles["manpu-exclaim-tick"]}
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
