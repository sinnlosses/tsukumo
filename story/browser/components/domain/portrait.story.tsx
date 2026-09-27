// 立ち絵1件の見本。素材は同梱のパック（`characters/`）を `/character/<pack>/<file>` で読む。
// 置き方（大きさ）は呼び出し側が決める部品なので、ここでは固定の枠に入れて見る。

import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactElement } from "react"

import { Portrait } from "../../../../src/browser/components/domain/portrait.tsx"
import { characterAssetPath } from "../../../../src/shared/character-pack/character-asset.ts"

const meta = {
  component: Portrait,
  decorators: [withFrame],
  args: {
    url: characterAssetPath("tsukumo-spirit", "default.svg", undefined),
    accent: "#b8c7ff",
    altText: "つくもの精霊",
    expression: "default",
    outfit: "default",
    motion: undefined,
    className: undefined,
  },
} satisfies Meta<typeof Portrait>

export default meta

type Story = StoryObj<typeof meta>

/** インラインの SVG。差し色（`--outfit-accent`）が効く。 */
export const Svg = {} satisfies Story

export const SvgHeavyOutfit = {
  args: {
    url: characterAssetPath("tsukumo-spirit", "flustered.svg", undefined),
    accent: "#ffb3a7",
    expression: "flustered",
    outfit: "heavy",
  },
} satisfies Story

/** ラスタは `<img>` で出す。 */
export const Raster = {
  args: {
    url: characterAssetPath("tsukumo", "proud.png", undefined),
    accent: undefined,
    altText: "つくも",
    expression: "proud",
  },
} satisfies Story

/** 待っている間の移動（`data-motion` を CSS が読む）。 */
export const Waiting = { args: { motion: "waiting" } } satisfies Story

function withFrame(Story: () => ReactElement): ReactElement {
  return (
    <div style={{ display: "flex", width: 320, height: 420, padding: 16 }}>
      <Story />
    </div>
  )
}
