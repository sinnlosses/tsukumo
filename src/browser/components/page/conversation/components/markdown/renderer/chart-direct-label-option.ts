// Chart.js の `options.plugins["tsukumo-direct-label"]` に積まれた、グラフの種類と系列名を読む。

export const DIRECT_LABEL_PLUGIN_ID = "tsukumo-direct-label"

export type DirectLabelOption = {
  readonly mode: "arrow" | "slope" | "span" | "share" | "values"
  readonly names: readonly string[]
}

export function directLabelOptionOf(chart: ChartInstance): DirectLabelOption | undefined {
  const value: unknown = chart.options.plugins[DIRECT_LABEL_PLUGIN_ID]
  if (typeof value !== "object" || value === null || !("mode" in value) || !("names" in value)) {
    return undefined
  }
  const { mode, names } = value
  if (
    (mode !== "arrow" &&
      mode !== "slope" &&
      mode !== "span" &&
      mode !== "share" &&
      mode !== "values") ||
    !Array.isArray(names) ||
    !names.every((name): name is string => typeof name === "string")
  ) {
    return undefined
  }
  return { mode, names }
}
