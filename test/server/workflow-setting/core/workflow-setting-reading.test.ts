import { describe, expect, it } from "vitest"

import {
  changeWorkflowSetting,
  readWorkflowEntries,
  readWorkflowSetting,
  type TwConfigPort,
  type TwOutcome,
  type WorkflowSettingPlace,
} from "../../../../src/server/workflow-setting/core/workflow-setting-reading.ts"

const PLACE: WorkflowSettingPlace = {
  worktreeName: "架空の作業ツリー",
  configPathOf: (relativePath) => `/架空/根/${relativePath}`,
  twLocation: "/架空/取り込み/bin/tw",
}

const REPOSITORY = {
  worktreeName: "架空の作業ツリー",
  configPath: "/架空/根/.tw/config.toml",
}

const SCHEMA = {
  schema: 2,
  keys: [
    {
      key: "steps",
      label: "並び",
      description: "並びの説明",
      kind: "steps",
      default: ["架空:一つ目"],
      values: [
        { value: "架空:一つ目", label: "一つ目", title: "架空の一つ目", description: "" },
        // 日本語の名前を返さない古い `tw` の候補。
        { value: "架空:二つ目", label: "二つ目", description: "" },
      ],
    },
  ],
}

const SCHEMA_1 = {
  schema: 1,
  default_word: "既定の語",
  none_word: "なしの語",
  keys: [
    {
      key: "flow",
      label: "流れの名",
      description: "流れの説明",
      kind: "choice",
      default: "first",
      values: [{ value: "first", label: "一つ目", description: "一つ目の説明" }],
    },
  ],
}

function configJson(keys: readonly { key: string; value: unknown }[]): string {
  return JSON.stringify({
    config: ".tw/config.toml",
    keys: keys.map((entry) => ({ ...entry, source: "config" })),
  })
}

const CONFIG_JSON = configJson([
  { key: "verify", value: "架空の検証" },
  { key: "steps", value: ["架空:二つ目"] },
])

const ENTRIES_JSON = JSON.stringify({
  entries: [
    { value: "架空の入口", label: "入口", title: "架空の入口の題", description: "説明" },
    { value: "架空の別口", label: "別口", title: "架空の別口の題", description: "" },
  ],
})

function ran(exitCode: number, stdout: string, stderr = ""): TwOutcome {
  return { kind: "ran", exitCode, stdout, stderr }
}

function portOf(
  outcomes: Partial<Record<"schema" | "config" | "set" | "entries", TwOutcome>>,
): TwConfigPort & { readonly sets: (readonly [string, string])[] } {
  const sets: (readonly [string, string])[] = []
  return {
    sets,
    schema: () => Promise.resolve(outcomes.schema ?? ran(0, JSON.stringify(SCHEMA))),
    config: () => Promise.resolve(outcomes.config ?? ran(0, CONFIG_JSON)),
    entries: () => Promise.resolve(outcomes.entries ?? ran(0, ENTRIES_JSON)),
    set: (key, value) => {
      sets.push([key, value])
      return Promise.resolve(outcomes.set ?? ran(0, `SET\t${key}\t${value}`))
    },
  }
}

describe("readWorkflowEntries", () => {
  it("entries を value と title に畳む", async () => {
    expect(await readWorkflowEntries(portOf({}))).toEqual([
      { value: "架空の入口", title: "架空の入口の題" },
      { value: "架空の別口", title: "架空の別口の題" },
    ])
  })

  it("空の一覧は空", async () => {
    const port = portOf({ entries: ran(0, JSON.stringify({ entries: [] })) })

    expect(await readWorkflowEntries(port)).toEqual([])
  })

  it("tw が無い・古い（終了コード2）・壊れた JSON・形違いは空", async () => {
    const outcomes: TwOutcome[] = [
      { kind: "missing" },
      ran(2, "", "unrecognized arguments: --entries"),
      ran(0, "JSON でない"),
      ran(0, JSON.stringify({ entries: [{ value: 1 }] })),
    ]

    const results = await Promise.all(
      outcomes.map((entries) => readWorkflowEntries(portOf({ entries }))),
    )

    expect(results).toEqual([[], [], [], []])
  })
})

describe("readWorkflowSetting", () => {
  it("tw が起動できなければ tw-missing で、探した場所を添える", async () => {
    const view = await readWorkflowSetting(portOf({ schema: { kind: "missing" } }), PLACE)

    expect(view).toEqual({
      kind: "unavailable",
      repository: REPOSITORY,
      reason: "tw-missing",
      detail: "/架空/取り込み/bin/tw",
    })
  })

  it("--schema が失敗する・JSON でない・schema 1・schema が描ける版でなければ schema-unsupported", async () => {
    const outcomes = [
      ran(2, "", "unrecognized arguments: --schema"),
      ran(0, "JSON でない"),
      ran(0, JSON.stringify(SCHEMA_1)),
      ran(0, JSON.stringify({ ...SCHEMA, schema: 3 })),
    ]

    const reasons = await Promise.all(
      outcomes.map(async (schema) => {
        const view = await readWorkflowSetting(portOf({ schema }), PLACE)
        return view.kind === "unavailable" ? view.reason : view.kind
      }),
    )

    expect(reasons).toEqual([
      "schema-unsupported",
      "schema-unsupported",
      "schema-unsupported",
      "schema-unsupported",
    ])
  })

  it("tw config が MISSING（終了コード6）なら config-missing", async () => {
    const view = await readWorkflowSetting(
      portOf({ config: ran(6, "MISSING\t.tw/config.toml") }),
      PLACE,
    )

    expect(view).toMatchObject({ kind: "unavailable", reason: "config-missing" })
  })

  it("tw config が失敗すれば config-unreadable で、理由は stderr でなく終了コードの意味で言う", async () => {
    const exitCodes = [3, 2, 1]

    const details = await Promise.all(
      exitCodes.map(async (exitCode) => {
        const view = await readWorkflowSetting(
          portOf({ config: ran(exitCode, "", "stderr の文は使わない\n") }),
          PLACE,
        )
        return view.kind === "unavailable" ? [view.reason, view.detail] : view.kind
      }),
    )

    expect(details).toEqual([
      ["config-unreadable", "設定ファイルが不正で、tw が読めない"],
      ["config-unreadable", "tw が config --json を知らない古い版"],
      ["config-unreadable", "終了コード 1"],
    ])
  })

  it("終了コード0でも出力が JSON として読めなければ config-unreadable", async () => {
    const outputs = ["JSON でない", JSON.stringify({ keys: [] })]

    const reasons = await Promise.all(
      outputs.map(async (config) => {
        const view = await readWorkflowSetting(portOf({ config: ran(0, config) }), PLACE)
        return view.kind === "unavailable" ? view.reason : view.kind
      }),
    )

    expect(reasons).toEqual(["config-unreadable", "config-unreadable"])
  })

  it("読めれば、steps の欄を config の値の配列で描き、title の無い候補は label で埋める", async () => {
    const view = await readWorkflowSetting(
      portOf({
        config: ran(0, configJson([{ key: "steps", value: ["架空:二つ目", "架空:消えた"] }])),
      }),
      PLACE,
    )

    expect(view).toEqual({
      kind: "available",
      repository: REPOSITORY,
      fields: [
        {
          kind: "steps",
          key: "steps",
          label: "並び",
          description: "並びの説明",
          values: [
            { value: "架空:一つ目", label: "一つ目", title: "架空の一つ目", description: "" },
            { value: "架空:二つ目", label: "二つ目", title: "二つ目", description: "" },
          ],
          current: ["架空:二つ目", "架空:消えた"],
        },
      ],
    })
  })

  it("steps の値が config に無い・文字列の配列でなければ default を使う", async () => {
    const outputs = [configJson([]), configJson([{ key: "steps", value: "壊れた" }])]

    const currents = await Promise.all(
      outputs.map(async (config) => {
        const view = await readWorkflowSetting(portOf({ config: ran(0, config) }), PLACE)
        return view.kind === "available" ? view.fields[0]?.current : undefined
      }),
    )

    expect(currents).toEqual([["架空:一つ目"], ["架空:一つ目"]])
  })

  it("読まない kind の欄は読み飛ばし、読める欄だけを返す", async () => {
    const fixed = { key: "架空の固定", label: "固定", kind: "架空の種類" }
    const mixed = { ...SCHEMA, keys: [...SCHEMA.keys, fixed] }

    const view = await readWorkflowSetting(portOf({ schema: ran(0, JSON.stringify(mixed)) }), PLACE)

    expect(view.kind === "available" ? view.fields.map((field) => field.key) : view.kind).toEqual([
      "steps",
    ])
  })

  it("読める欄が無ければ欄は空で、schema-unsupported にしない", async () => {
    const onlyFixed = { schema: 2, keys: [{ key: "架空の固定", kind: "架空の種類" }] }

    const view = await readWorkflowSetting(
      portOf({ schema: ran(0, JSON.stringify(onlyFixed)) }),
      PLACE,
    )

    expect(view).toEqual({ kind: "available", repository: REPOSITORY, fields: [] })
  })

  it("steps・choice・readonly・command の欄を schema の順に返す", async () => {
    const schema = {
      schema: 2,
      keys: [
        ...SCHEMA.keys,
        {
          key: "架空の選択",
          label: "選択",
          description: "選択の説明",
          kind: "choice",
          default: "a",
          values: [
            { value: "a", label: "甲", description: "甲の説明" },
            { value: "b", label: "乙", description: "乙の説明" },
          ],
        },
        { key: "架空の固定", label: "固定", description: "", kind: "readonly" },
        {
          key: "架空の命令",
          label: "命令",
          description: "命令の説明",
          kind: "command",
          default: "なし",
        },
      ],
    }
    const config = configJson([
      { key: "steps", value: ["架空:二つ目"] },
      { key: "架空の選択", value: "b" },
      { key: "架空の命令", value: "架空の命令行" },
      { key: "架空の固定", value: "固定の値" },
    ])

    const view = await readWorkflowSetting(
      portOf({ schema: ran(0, JSON.stringify(schema)), config: ran(0, config) }),
      PLACE,
    )

    expect(view.kind === "available" ? view.fields.map((field) => field.kind) : view.kind).toEqual([
      "steps",
      "choice",
      "readonly",
      "command",
    ])
    expect(view.kind === "available" ? view.fields.slice(1) : []).toEqual([
      {
        kind: "choice",
        key: "架空の選択",
        label: "選択",
        description: "選択の説明",
        values: [
          { value: "a", label: "甲", description: "甲の説明" },
          { value: "b", label: "乙", description: "乙の説明" },
        ],
        current: "b",
      },
      {
        kind: "readonly",
        key: "架空の固定",
        label: "固定",
        description: "",
        current: "固定の値",
      },
      {
        kind: "command",
        key: "架空の命令",
        label: "命令",
        description: "命令の説明",
        current: "架空の命令行",
      },
    ])
  })

  it("readonly の値は1行の文字列にする（無い・null は -、数・真偽値・配列・入れ子）", async () => {
    const schema = {
      schema: 2,
      keys: [
        "文字列",
        "数",
        "真偽値",
        "配列",
        "空の配列",
        "入れ子",
        "配列の入れ子",
        "null",
        "欠け",
      ].map((key) => ({ key, label: key, description: "", kind: "readonly" })),
    }
    const config = configJson([
      { key: "文字列", value: "架空の文字列" },
      { key: "数", value: 12 },
      { key: "真偽値", value: false },
      { key: "配列", value: ["甲", 2, true] },
      { key: "空の配列", value: [] },
      { key: "入れ子", value: { 甲: 1 } },
      { key: "配列の入れ子", value: [{ 乙: 2 }, "丙"] },
      { key: "null", value: null },
    ])

    const view = await readWorkflowSetting(
      portOf({ schema: ran(0, JSON.stringify(schema)), config: ran(0, config) }),
      PLACE,
    )

    expect(
      view.kind === "available"
        ? view.fields.map((field) => [field.key, field.current])
        : view.kind,
    ).toEqual([
      ["文字列", "架空の文字列"],
      ["数", "12"],
      ["真偽値", "false"],
      ["配列", "甲, 2, true"],
      ["空の配列", "-"],
      ["入れ子", '{"甲":1}'],
      ["配列の入れ子", '{"乙":2}, 丙'],
      ["null", "-"],
      ["欠け", "-"],
    ])
  })

  it("readonly の欄で label が欠けると欄は作られず schema-unsupported になる", async () => {
    const broken = {
      schema: 2,
      keys: [{ key: "架空の固定", description: "", kind: "readonly" }],
    }

    const view = await readWorkflowSetting(
      portOf({ schema: ran(0, JSON.stringify(broken)) }),
      PLACE,
    )

    expect(view.kind === "unavailable" ? view.reason : view.kind).toBe("schema-unsupported")
  })

  it("--json に値が無い、または文字列でない choice・command は default が current になる", async () => {
    const schema = {
      schema: 2,
      keys: [
        {
          key: "架空の選択",
          label: "選択",
          description: "",
          kind: "choice",
          default: "a",
          values: [{ value: "a", label: "甲", description: "" }],
        },
        { key: "架空の命令", label: "命令", description: "", kind: "command", default: "なし" },
      ],
    }
    const configs = [configJson([]), configJson([{ key: "架空の命令", value: ["配列"] }])]

    const currents = await Promise.all(
      configs.map(async (config) => {
        const view = await readWorkflowSetting(
          portOf({ schema: ran(0, JSON.stringify(schema)), config: ran(0, config) }),
          PLACE,
        )
        return view.kind === "available"
          ? view.fields.map((field) => (field.kind === "steps" ? "" : field.current))
          : view.kind
      }),
    )

    expect(currents).toEqual([
      ["a", "なし"],
      ["a", "なし"],
    ])
  })

  it("choice の values が欠けた欄があると欄は作られず schema-unsupported になる", async () => {
    const broken = {
      schema: 2,
      keys: [
        ...SCHEMA.keys,
        { key: "架空の選択", label: "選択", description: "", kind: "choice", default: "a" },
      ],
    }

    const view = await readWorkflowSetting(
      portOf({ schema: ran(0, JSON.stringify(broken)) }),
      PLACE,
    )

    expect(view).toEqual({
      kind: "unavailable",
      repository: { worktreeName: "架空の作業ツリー", configPath: "/架空/根/.tw/config.toml" },
      reason: "schema-unsupported",
      detail: "",
    })
  })

  it("steps だけを返す古い出力は steps の欄だけを返す", async () => {
    const view = await readWorkflowSetting(portOf({}), PLACE)

    expect(view.kind === "available" ? view.fields.map((field) => field.kind) : view.kind).toEqual([
      "steps",
    ])
  })

  it("kind が steps で形の崩れた欄は schema-unsupported のまま", async () => {
    const broken = { schema: 2, keys: [{ key: "steps", kind: "steps" }] }

    const view = await readWorkflowSetting(
      portOf({ schema: ran(0, JSON.stringify(broken)) }),
      PLACE,
    )

    expect(view.kind === "unavailable" ? view.reason : view.kind).toBe("schema-unsupported")
  })
})

describe("changeWorkflowSetting", () => {
  it("SET なら読み直した面を返す", async () => {
    const port = portOf({})

    const change = await changeWorkflowSetting(port, PLACE, "steps", '["架空:二つ目"]')

    expect(port.sets).toEqual([["steps", '["架空:二つ目"]']])
    expect(change).toMatchObject({ kind: "view", view: { kind: "available" } })
  })

  it("語彙の外（終了コード2）なら failed で、stderr の1行目を添える", async () => {
    const change = await changeWorkflowSetting(
      portOf({ set: ran(2, "", "tw config set: 架空の値 は語彙の外\n") }),
      PLACE,
      "steps",
      "架空の値",
    )

    expect(change).toEqual({
      kind: "failed",
      key: "steps",
      message: "tw config set: 架空の値 は語彙の外",
    })
  })

  it("設定が無い（終了コード6）なら config-missing の面", async () => {
    const change = await changeWorkflowSetting(
      portOf({ set: ran(6, "MISSING\t.tw/config.toml") }),
      PLACE,
      "steps",
      "[]",
    )

    expect(change).toMatchObject({
      kind: "view",
      view: { kind: "unavailable", reason: "config-missing" },
    })
  })

  it("tw が起動できなければ tw-missing の面", async () => {
    const change = await changeWorkflowSetting(
      portOf({ set: { kind: "missing" } }),
      PLACE,
      "steps",
      "[]",
    )

    expect(change).toMatchObject({
      kind: "view",
      view: { kind: "unavailable", reason: "tw-missing" },
    })
  })
})
