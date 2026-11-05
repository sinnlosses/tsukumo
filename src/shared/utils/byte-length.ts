// UTF-8 のバイト数を数える道具。
// 「読み戻す量の上限」「雑談のログの走行合計」「ツールの結果の長さ」の物差しは、この1つの定義で揃える。

const textEncoder = new TextEncoder()

/** 文面の UTF-8 バイト数。 */
export function byteLength(text: string): number {
  return textEncoder.encode(text).length
}
