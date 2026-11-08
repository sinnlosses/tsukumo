// Chart.js のツールチップを項目の番号で出し入れする。Chart.js の型はこのファイルの中に閉じる。

export type ChartTooltipControl = {
  readonly show: (index: number) => void
  readonly hide: () => void
}

type TooltipDataset = { readonly label?: string; readonly data: readonly unknown[] }

type TooltipChart = {
  readonly data: {
    readonly labels?: readonly unknown[]
    readonly datasets: readonly TooltipDataset[]
  }
  readonly tooltip?: {
    readonly setActiveElements: (
      active: readonly { datasetIndex: number; index: number }[],
      position: { x: number; y: number },
    ) => void
  }
  readonly setActiveElements: (active: readonly { datasetIndex: number; index: number }[]) => void
  readonly update: () => void
}

export function tooltipControlOf(
  chart: TooltipChart,
  onAnnounce: (text: string) => void,
): ChartTooltipControl {
  const apply = (
    active: readonly { datasetIndex: number; index: number }[],
    position: { x: number; y: number },
  ) => {
    chart.tooltip?.setActiveElements(active, position)
    chart.setActiveElements(active)
    chart.update()
  }
  return {
    show: (index) => {
      const labels = chart.data.labels ?? []
      if (!Number.isInteger(index) || index < 0 || index >= labels.length) {
        return
      }
      const active = chart.data.datasets.map((_, datasetIndex) => ({ datasetIndex, index }))
      apply(active, { x: 0, y: 0 })
      onAnnounce(tooltipTextOf(labels, chart.data.datasets, index))
    },
    hide: () => {
      apply([], { x: 0, y: 0 })
      onAnnounce("")
    },
  }
}

function tooltipTextOf(
  labels: readonly unknown[],
  datasets: readonly TooltipDataset[],
  index: number,
): string {
  if (index < 0 || index >= labels.length) {
    return ""
  }
  const lines = datasets.map((dataset) =>
    `${dataset.label ?? ""} ${String(dataset.data[index])}`.trim(),
  )
  return [String(labels[index]), ...lines].join("\n")
}
