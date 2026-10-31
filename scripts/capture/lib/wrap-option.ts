// 折れの比較の道具の引数の解釈と使い方の文。

import { parseArgs } from "node:util"

import { PREPARATION_OPTIONS, type Preparation, readPreparations } from "./capture-preparation.ts"
import { parseSize, type WindowSize } from "./capture-size.ts"

/** 既定の窓。最狭の幅で折れを見る。 */
const DEFAULT_SIZE: WindowSize = { width: 360, height: 900 }

export const WRAP_USAGE = `使い方:
  node scripts/capture/compare-wrap.ts --before <URL> --after <URL> [--size <幅>x<高さ>（既定 ${String(DEFAULT_SIZE.width)}x${String(DEFAULT_SIZE.height)}、何度でも）] [操作]

  --before <URL>   変更前のビュー（scripts/runtime/serve-revision.ts が出す URL など）
  --after <URL>    変更後のビュー
  --size           窓の大きさ（窓ごとに前後を測る）
  操作             capture-view.ts と同じ --click・--hover・--type <selector> <文字>・--wait-after・--hash・--press・--advance・--scroll-element <selector> <px>。前後の両方に同じ手を当てる
`

export type WrapOptions = {
  readonly before: string
  readonly after: string
  readonly sizes: readonly WindowSize[]
  readonly preparations: readonly Preparation[]
}

/** 崩れた引数・足りない URL・読めない窓や操作は undefined（呼び出し側が使い方を出す）。 */
export function parseWrapOptions(argv: readonly string[]): WrapOptions | undefined {
  try {
    const { values, tokens } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: true,
      tokens: true,
      options: {
        ...PREPARATION_OPTIONS,
        before: { type: "string" },
        after: { type: "string" },
        size: { type: "string", multiple: true },
      },
    })
    const prepared = readPreparations(tokens)
    const sizes = (values.size ?? []).map(parseSize)
    const strayPositional = tokens.some(
      (token, index) => token.kind === "positional" && !prepared?.textTokenIndexes.has(index),
    )
    if (
      prepared === undefined ||
      values.before === undefined ||
      values.after === undefined ||
      strayPositional ||
      sizes.some((size) => size === undefined)
    ) {
      return undefined
    }
    const given = sizes.filter((size) => size !== undefined)
    return {
      before: values.before,
      after: values.after,
      sizes: given.length === 0 ? [DEFAULT_SIZE] : given,
      preparations: prepared.preparations,
    }
  } catch {
    return undefined
  }
}
