// 記録（JSONL）を書くモジュールのテストが、書かれたファイルを読み戻す。
// 読み戻しに `src` 側の読み手を使わないのは、書き手と読み手が同じ誤りを抱えても通ってしまうため。

import { readFileSync } from "node:fs"

/** `path` の JSONL を1行1値で読む。空行は飛ばす。 */
export function readJsonLines(path: string): unknown[] {
  return readFileSync(path, "utf8")
    .trimEnd()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): unknown => JSON.parse(line))
}

/** 読み戻した1行のキーの並び（オブジェクトでなければ空）。 */
export function keysOf(value: unknown): readonly string[] {
  return typeof value === "object" && value !== null ? Object.keys(value) : []
}
