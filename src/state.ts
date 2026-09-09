// hook が書く状態ファイル（JSON文字列）を読み、表情・衣装の判断材料になる値を取り出す。「読む」層。
//
// 状態ファイルは hook スクリプト（外部）が書くので構造を信用しない。unknown で受けて検証し、
// 壊れているときは undefined を返す。イベント種別は文字列のまま持ち出し、それが既知のものか
// どうかの判断は「決める」層（src/expression.ts）に任せる（ここでは弾かない）。
//
// transcript.ts と同じく、ここはファイルI/Oを持たない。ファイルを読むのは src/index.ts。

export type StateFileContents = {
  readonly event: string
  readonly model: string | undefined
}

/**
 * 状態ファイルの中身をパースする。JSON として不正、`event` が文字列でない、
 * `model` が文字列でも undefined でもない場合は undefined を返す
 * （状態ファイルが無いときと同じ「既定の表情」に倒せるようにするため）。
 */
export function parseStateFile(content: string): StateFileContents | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return undefined
  }

  return toStateFileContents(parsed)
}

function toStateFileContents(value: unknown): StateFileContents | undefined {
  if (!isRecord(value) || typeof value.event !== "string") {
    return undefined
  }

  const model = value.model
  if (model !== undefined && typeof model !== "string") {
    return undefined
  }

  return { event: value.event, model }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
