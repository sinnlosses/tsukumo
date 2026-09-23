// UTF-8 のバイト数を数える道具（`TextEncoder` は実行環境の API なので `lib/`。`docs/design.md`
// 2章「`lib/` と `utils/` に置く基準」）。「読み戻す量の上限」「雑談のログの走行合計」
// 「ツールの結果の長さ」の物差しは、この1つの定義で揃える。

const textEncoder = new TextEncoder()

/** 文面の UTF-8 バイト数。 */
export function byteLength(text: string): number {
  return textEncoder.encode(text).length
}
