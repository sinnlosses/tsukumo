// キャラビュー（立ち絵と吹き出しの並び）の見本。セリフはすべて架空。
// 領域の大きさは外から決まる部品なので、既定の領域に近い枠に入れて見る。

import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactElement } from "react"

import { PresentationalCharacterView } from "../../../../../../../src/browser/components/page/conversation/components/character-view/presentational-character-view.tsx"
import { characterAssetPath } from "../../../../../../../src/shared/character-pack/character-asset.ts"

const meta = {
  component: PresentationalCharacterView,
  decorators: [withRegion],
  args: {
    portraitUrl: characterAssetPath("tsukumo-spirit", "default.svg", undefined),
    accent: "#b8c7ff",
    altText: "つくもの精霊",
    expression: "default",
    outfit: "default",
    motion: "reading",
    speeches: ["読み終わったよ。", "次はテストを走らせてみるね（架空）。"],
    emptyMessage: undefined,
    speakerName: "つくもの精霊",
  },
} satisfies Meta<typeof PresentationalCharacterView>

export default meta

type Story = StoryObj<typeof meta>

export const Speaking = {} satisfies Story

/** セリフが1件も無いときはプレースホルダを吹き出し1件として出す。 */
export const NoSpeech = { args: { speeches: [] } } satisfies Story

/** 長いセリフの折り返しと、過去の吹き出しの押し上げ。 */
export const LongSpeech = {
  args: {
    expression: "proud",
    portraitUrl: characterAssetPath("tsukumo-spirit", "proud.svg", undefined),
    speeches: [
      "まずは読むね。",
      "3つのファイルを直して、テストも足しておいたよ。見た目に関わる変更だから、撮った画面も並べておくね（架空の例）。",
    ],
  },
} satisfies Story

/** 立ち絵の素材が無いときは吹き出しだけで成立させる。 */
export const WithoutPortrait = { args: { portraitUrl: undefined } } satisfies Story

function withRegion(Story: () => ReactElement): ReactElement {
  return (
    <div style={{ width: 560, height: 300, padding: 16 }}>
      <Story />
    </div>
  )
}
