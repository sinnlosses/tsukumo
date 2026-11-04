// PROTOTYPE: sonnet の書き手が catalog.md だけを読んで書いた部品の一覧（手を入れていない）。
window.REPORT = [
  {
    id: "root",
    component: "Report",
    children: ["h1", "concl", "w", "e2e", "st", "ch", "h2", "tbl", "note"],
  },
  { id: "h1", component: "Heading", text: "検証コマンドの worker 数: 所要は 6〜8 本で底になる" },
  {
    id: "concl",
    component: "Paragraph",
    text: "所要は 直列の秒数 / w + 6 × w で、w を増やすと割り算の項は減り、立ち上げの項は増える。単体テストだけ（直列 240 秒）なら w = 6 の 76 秒が最速で、w = 7 は 76.3 秒とほぼ同じ。E2E を含める（直列 360 秒）と最適は 7.75 付近に移り、1〜8 の範囲では w = 8 の 93 秒が最速（w = 7 は 93.4 秒）。E2E を含めるほど worker を増やす価値が上がるが、6 本を超えた先の伸びは 1 秒未満で、立ち上げの負担のほうが目立ち始める。",
  },
  {
    id: "w",
    component: "Slider",
    label: "worker 数 w",
    min: 1,
    max: 8,
    step: 1,
    initial: 4,
    value: { path: "/params/w" },
  },
  {
    id: "e2e",
    component: "CheckBox",
    label: "E2E を含める（直列に 120 秒を足す）",
    initial: false,
    value: { path: "/params/e2e" },
  },
  {
    id: "st",
    component: "Stats",
    items: [
      {
        label: "いまの w",
        value: { call: "format", args: { template: "{w} 本", w: { path: "/params/w" } } },
      },
      {
        label: "所要（秒）",
        value: {
          call: "round",
          args: {
            digits: 1,
            x: {
              call: "add",
              args: {
                a: {
                  call: "div",
                  args: {
                    a: {
                      call: "if",
                      args: { cond: { path: "/params/e2e" }, then: 360, else: 240 },
                    },
                    b: { path: "/params/w" },
                  },
                },
                b: { call: "mul", args: { a: 6, b: { path: "/params/w" } } },
              },
            },
          },
        },
      },
      {
        label: "w = 1 との差（秒）",
        value: {
          call: "round",
          args: {
            digits: 1,
            x: {
              call: "sub",
              args: {
                a: {
                  call: "add",
                  args: {
                    a: {
                      call: "div",
                      args: {
                        a: {
                          call: "if",
                          args: { cond: { path: "/params/e2e" }, then: 360, else: 240 },
                        },
                        b: { path: "/params/w" },
                      },
                    },
                    b: { call: "mul", args: { a: 6, b: { path: "/params/w" } } },
                  },
                },
                b: {
                  call: "add",
                  args: {
                    a: {
                      call: "if",
                      args: { cond: { path: "/params/e2e" }, then: 360, else: 240 },
                    },
                    b: 6,
                  },
                },
              },
            },
          },
        },
      },
      {
        label: "いちばん速い w",
        value: {
          call: "if",
          args: { cond: { path: "/params/e2e" }, then: "8 本（93 秒）", else: "6 本（76 秒）" },
        },
      },
    ],
  },
  {
    id: "ch",
    component: "Chart",
    chartKind: "line",
    title: "w ごとの所要（秒）",
    labels: {
      call: "toText",
      args: { values: { call: "range", args: { from: 1, to: 8 } }, suffix: "本" },
    },
    series: [
      {
        name: "選んだ条件",
        values: {
          call: "round",
          args: {
            digits: 1,
            x: {
              call: "add",
              args: {
                a: {
                  call: "div",
                  args: {
                    a: {
                      call: "if",
                      args: { cond: { path: "/params/e2e" }, then: 360, else: 240 },
                    },
                    b: { call: "range", args: { from: 1, to: 8 } },
                  },
                },
                b: { call: "mul", args: { a: 6, b: { call: "range", args: { from: 1, to: 8 } } } },
              },
            },
          },
        },
      },
    ],
  },
  { id: "h2", component: "Heading", text: "w ごとの所要（秒）と最速" },
  {
    id: "tbl",
    component: "Table",
    columns: ["w", "単体のみ", "E2E 込み"],
    rows: [
      ["1", 246, 366],
      ["2", 132, 192],
      ["3", 98, 138],
      ["4", 84, 114],
      ["5", 78, 102],
      ["6", "76（最速）", 96],
      ["7", 76.3, 93.4],
      ["8", 78, "93（最速）"],
    ],
  },
  {
    id: "note",
    component: "Paragraph",
    text: {
      call: "format",
      args: {
        template: "いま選んでいる w = {w} は、最速の {best} 本より {gap} 秒{dir}。",
        w: { path: "/params/w" },
        best: { call: "if", args: { cond: { path: "/params/e2e" }, then: 8, else: 6 } },
        gap: {
          call: "round",
          args: {
            digits: 1,
            x: {
              call: "sub",
              args: {
                a: {
                  call: "add",
                  args: {
                    a: {
                      call: "div",
                      args: {
                        a: {
                          call: "if",
                          args: { cond: { path: "/params/e2e" }, then: 360, else: 240 },
                        },
                        b: { path: "/params/w" },
                      },
                    },
                    b: { call: "mul", args: { a: 6, b: { path: "/params/w" } } },
                  },
                },
                b: { call: "if", args: { cond: { path: "/params/e2e" }, then: 93, else: 76 } },
              },
            },
          },
        },
        dir: "遅い（0 なら最速）",
      },
    },
  },
]
