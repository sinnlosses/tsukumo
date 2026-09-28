// 数（トークン数など）を桁を揃えて短く書く道具（`1234567` → `1.23M`）。

/**
 * トークン数（`1234567` → `1.23M`）。3桁までに丸めて単位を付ける。1000 未満はそのまま。
 * 表の桁が揃わないと大小が読めず、素の桁数だと列が広がって横に溢れる。
 */
export function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${round(value / 1_000_000)}M`
  }
  if (value >= 1000) {
    return `${round(value / 1000)}k`
  }
  return String(value)
}

/** 有効数字3桁のつもりで小数第2位まで（`1.23` / `12.3` / `123`）。`formatBytes` と桁の詰め方を揃える。 */
export function round(value: number): string {
  if (value >= 100) {
    return value.toFixed(0)
  }
  return value >= 10 ? value.toFixed(1) : value.toFixed(2)
}
