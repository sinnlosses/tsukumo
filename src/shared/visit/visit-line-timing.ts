// 訪問の台本の1行（と帰りの一言）を出しておく間（`docs/screen-design.md`「間は字数で延ばす」）。

/** 間の下限（`docs/screen-design.md`「吹き出しどうしは最低2秒空ける」）。 */
export const VISIT_LINE_MIN_INTERVAL_MS = 2_000

/** 字数1つが延ばす間。 */
export const VISIT_LINE_MS_PER_CHARACTER = 150

/**
 * 台本の1行を出しておく間（`VISIT_LINE_MIN_INTERVAL_MS` と、字数 × `VISIT_LINE_MS_PER_CHARACTER`
 * の長いほう）。字数はコードポイントで数える（台本の行の長さの検査と同じ数え方）。
 */
export function visitLineIntervalMs(text: string): number {
  return Math.max(VISIT_LINE_MIN_INTERVAL_MS, [...text].length * VISIT_LINE_MS_PER_CHARACTER)
}
