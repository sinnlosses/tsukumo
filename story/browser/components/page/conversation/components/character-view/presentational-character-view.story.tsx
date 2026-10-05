// キャラビュー（立ち絵と吹き出しの並び）の見本。セリフはすべて架空。
// 領域の大きさは外から決まる部品なので、既定の領域に近い枠に入れて見る。

import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactElement } from "react"

import type { CharacterViewSpeech } from "../../../../../../../src/browser/components/page/conversation/components/character-view/hooks/use-character-view.ts"
import { PresentationalCharacterView } from "../../../../../../../src/browser/components/page/conversation/components/character-view/presentational-character-view.tsx"
import { characterAssetPath } from "../../../../../../../src/shared/character-pack/character-asset.ts"

/** 見本では押しても何も変わらない（押す挙動そのものは別のテストが見る）。 */
function speech(text: string): CharacterViewSpeech {
  return { text, selected: false, onToggle: () => {} }
}

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
    speeches: [speech("読み終わったよ。"), speech("次はテストを走らせてみるね（架空）。")],
    reaction: { kind: "none" },
    speakerName: "つくもの精霊",
    pinnedSpeech: undefined,
    onToggleSpeech: () => {},
  },
} satisfies Meta<typeof PresentationalCharacterView>

export default meta

type Story = StoryObj<typeof meta>

export const Speaking = {} satisfies Story

/** セリフも反応も無いときは吹き出しを出さない。 */
export const NoSpeech = { args: { speeches: [] } } satisfies Story

/** 迎えの挨拶を書いている途中。吹き出しに「…」が出る。 */
export const Writing = {
  args: {
    speeches: [],
    reaction: { kind: "writing" },
  },
} satisfies Story

/** API の呼び直しを待っているときの反応（パックに書いた1行）。 */
export const Reacting = {
  args: {
    expression: "thinking",
    portraitUrl: characterAssetPath("tsukumo-spirit", "thinking.svg", undefined),
    speeches: [],
    reaction: { kind: "shown", reaction: "retrying", text: "もう一回やってみるね（架空）。" },
  },
} satisfies Story

/** 失敗で閉じたとき、そのターンのセリフの下に反応が最新として出る。 */
export const ReactingAfterSpeech = {
  args: {
    expression: "sad",
    speeches: [speech("手早くいくね（架空）。")],
    reaction: { kind: "shown", reaction: "failed", text: "途中で止まっちゃった（架空）。" },
  },
} satisfies Story

/** 長いセリフの折り返しと、過去の吹き出しの押し上げ。 */
export const LongSpeech = {
  args: {
    expression: "proud",
    portraitUrl: characterAssetPath("tsukumo-spirit", "proud.svg", undefined),
    speeches: [
      speech("まずは読むね。"),
      speech(
        "3つのファイルを直して、テストも足しておいたよ。見た目に関わる変更だから、撮った画面も並べておくね（架空の例）。",
      ),
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
