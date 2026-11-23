// 架空の小さな地図（大2つ・中3つ・小4つ・外の世界1つ）。値は毎回新しく作るので、テストが欄を書き換えてよい。

export type SampleMap = ReturnType<typeof sampleMap>

/** 区画を書いた `sampleMap()`。`app`→`front`・`server`→`back`（`title` 無し）・`vault`→`outside`。 */
export function sampleLanedMap() {
  const map = sampleMap()
  const laneOf: Readonly<Record<string, string>> = {
    app: "front",
    server: "back",
    vault: "outside",
  }
  return {
    ...map,
    lanes: [
      { id: "front", title: "表側", kind: "runtime" },
      { id: "back", kind: "runtime" },
      { id: "outside", title: "外", kind: "external" },
    ],
    boxes: map.boxes.map((box) => ({ ...box, lane: laneOf[box.id] })),
  }
}

export function sampleMap() {
  return {
    version: 1,
    source: { producer: "sample-producer 0.0.1", commit: "0123abc" },
    overview: "架空の小さなリポジトリ。画面と手続きの2つからできていて、外の保管庫とやり取りする。",
    boxes: [
      {
        id: "app",
        title: "アプリ",
        summary: "画面の側",
        purpose: "画面を手続きの実装から隔てる",
        paths: ["src/ui/**", "src/view/**"],
        aliases: ["frontend"],
        place: { column: 0, row: 0 },
        children: [
          {
            id: "app/ui",
            summary: "部品",
            paths: ["src/ui/**"],
            children: [
              { id: "src/ui/part", paths: ["src/ui/part/*"] },
              { id: "src/ui/page", paths: ["src/ui/page/*"] },
            ],
          },
          {
            id: "app/view",
            summary: "表示の判断",
            paths: ["src/view/**"],
            children: [{ id: "src/view/core", paths: ["src/view/core/*"] }],
          },
        ],
      },
      {
        id: "server",
        summary: "手続きの側",
        paths: ["src/server/**"],
        place: { column: 1, row: 0 },
        children: [
          {
            id: "server/store",
            summary: "保管",
            paths: ["src/server/store/**"],
            children: [{ id: "src/server/store", paths: ["src/server/store/*"] }],
          },
        ],
      },
      { id: "vault", summary: "外の保管庫", paths: [], external: true },
    ],
    edges: {
      intended: [
        { from: "app", to: "server", label: "RPC", origin: "rule:app-to-server" },
        { from: "server/store", to: "vault" },
      ],
      actual: [
        { from: "src/ui/page", to: "src/ui/part", count: 3 },
        { from: "src/ui/page", to: "src/view/core", count: 2 },
        { from: "src/view/core", to: "src/server/store", count: 4 },
      ],
    },
    findings: [
      {
        kind: "undeclared-edge",
        severity: "error",
        from: "app/view",
        to: "server/store",
        count: 4,
        sample: { from: "src/view/core/a.ts", to: "src/server/store/b.ts" },
      },
      { kind: "empty-box", severity: "error", box: "app/ui" },
      { kind: "future-kind", severity: "warn", extra: "読み捨てる" },
    ],
    extraField: "読み捨てる",
  }
}
