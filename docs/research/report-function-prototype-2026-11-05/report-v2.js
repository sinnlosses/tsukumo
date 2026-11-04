// PROTOTYPE: sonnet の書き手が catalog-v2.md だけを読んで書いた部品の一覧（手を入れていない）。
window.REPORT = [
  {
    id: "root",
    component: "Report",
    children: ["h", "p1", "sw", "sc", "st", "ch", "h2", "tb", "p2"],
    defs: {
      ws: "range(1, 8)",
      base: "240 + (e2e ? 120 : 0)",
      times: "base / ws + 6 * ws",
      cur: "base / w + 6 * w",
      diff: "cur - at(times, 0)",
      best: "argmin(times)",
      bestW: "at(ws, best)",
      bestT: "minOf(times)",
    },
  },
  { id: "h", component: "Heading", text: "検証コマンドの worker 数を決める" },
  {
    id: "p1",
    component: "Paragraph",
    text: "所要は 直列の秒数 / w + 6 × w で表せる。worker を増やすと分担で縮むが、1本ごとの立ち上げ 6 秒が足される。w と E2E の有無を動かして確かめられる。",
  },
  {
    id: "sw",
    component: "Slider",
    name: "w",
    label: "worker 数",
    min: 1,
    max: 8,
    step: 1,
    initial: 4,
  },
  {
    id: "sc",
    component: "CheckBox",
    name: "e2e",
    label: "E2E を含める（直列に 120 秒を足す）",
    initial: false,
  },
  {
    id: "st",
    component: "Stats",
    items: [
      { label: "いまの所要（秒）", value: { call: "format", args: { template: "${cur}" } } },
      { label: "w = 1 との差（秒）", value: { call: "format", args: { template: "${diff}" } } },
      { label: "直列の所要（秒）", value: { call: "format", args: { template: "${base}" } } },
      { label: "いちばん速い w", value: { call: "format", args: { template: "${bestW}" } } },
    ],
  },
  {
    id: "ch",
    component: "Chart",
    chartKind: "line",
    title: "w ごとの所要（秒）",
    labels: { call: "expr", args: { source: 'text(ws, "本")' } },
    series: [{ name: "所要（秒）", values: { call: "expr", args: { source: "times" } } }],
    emphasis: { call: "expr", args: { source: "best" } },
  },
  { id: "h2", component: "Heading", text: "w ごとの所要" },
  {
    id: "tb",
    component: "Table",
    columns: ["worker 数", "所要（秒）"],
    rows: { call: "expr", args: { source: "zip(ws, round(times, 1))" } },
    emphasis: { call: "expr", args: { source: "best" } },
  },
  {
    id: "p2",
    component: "Paragraph",
    text: {
      call: "format",
      args: {
        template:
          '結論: ${e2e ? "E2E を含めると" : "単体テストだけなら"}、1〜8 本のうち w = ${bestW} が最速で ${bestT} 秒。w = 1 の ${at(times, 0)} 秒より ${at(times, 0) - bestT} 秒縮む。いまの w = ${w} は最速より ${cur - bestT} 秒遅い。',
      },
    },
  },
]
