// 図の上のキー操作を、次に札を出す項目（か札を消すこと）へ直す。

export type ChartItemMove =
  | { readonly kind: "show"; readonly index: number }
  | { readonly kind: "hide" }
  | { readonly kind: "ignore" }

const IGNORE: ChartItemMove = { kind: "ignore" }

export function nextChartItem(key: string, count: number, current?: number): ChartItemMove {
  if (count <= 0) {
    return IGNORE
  }
  const last = count - 1
  switch (key) {
    case "ArrowRight":
      return { kind: "show", index: current === undefined ? 0 : Math.min(current + 1, last) }
    case "ArrowLeft":
      return { kind: "show", index: current === undefined ? last : Math.max(current - 1, 0) }
    case "Home":
      return { kind: "show", index: 0 }
    case "End":
      return { kind: "show", index: last }
    case "Escape":
      return { kind: "hide" }
    default:
      return IGNORE
  }
}
