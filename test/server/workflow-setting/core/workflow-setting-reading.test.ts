import { describe, expect, it } from "vitest"

import {
  changeWorkflowSetting,
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
      values: [
        { value: "first", label: "一つ目", description: "一つ目の説明" },
        { value: "second", label: "二つ目", description: "二つ目の説明" },
      ],
    },
    {
      key: "parts.reviewer",
      label: "見る役",
      description: "見る役の説明",
      kind: "part",
      default: "既定の語",
      candidates: "agent",
      allow_none: true,
    },
  ],
}

const CONFIG_LINES = [
  "CONFIG\t.tw/config.toml",
  "verify\t架空の検証\tconfig",
  "flow\tsecond\tconfig",
  "parts.reviewer\t既定の語\tdefault",
].join("\n")

function ran(exitCode: number, stdout: string, stderr = ""): TwOutcome {
  return { kind: "ran", exitCode, stdout, stderr }
}

const SCHEMA_2 = {
  schema: 2,
  keys: [
    {
      key: "steps",
      label: "並び",
      description: "並びの説明",
      kind: "steps",
      default: ["架空:一つ目"],
      values: [
        { value: "架空:一つ目", label: "一つ目", description: "" },
        { value: "架空:二つ目", label: "二つ目", description: "" },
      ],
    },
  ],
}

/** `schema2` を渡さなければ `--version` を知らない古い `tw`（終了コード2）として振る舞う。 */
function portOf(
  outcomes: Partial<Record<"schema" | "schema2" | "config" | "set", TwOutcome>>,
): TwConfigPort & { readonly sets: (readonly [string, string])[] } {
  const sets: (readonly [string, string])[] = []
  return {
    sets,
    schema: (version) =>
      Promise.resolve(
        version === 2
          ? (outcomes.schema2 ?? ran(2, "", "unrecognized arguments: --version"))
          : (outcomes.schema ?? ran(0, JSON.stringify(SCHEMA))),
      ),
    config: () => Promise.resolve(outcomes.config ?? ran(0, CONFIG_LINES)),
    set: (key, value) => {
      sets.push([key, value])
      return Promise.resolve(outcomes.set ?? ran(0, `SET\t${key}\t${value}`))
    },
  }
}

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

  it("--schema が失敗する・JSON でない・schema が描ける版でなければ schema-unsupported", async () => {
    const outcomes = [
      ran(2, "", "unrecognized arguments: --schema"),
      ran(0, "JSON でない"),
      ran(0, JSON.stringify({ ...SCHEMA, schema: 3 })),
    ]

    const reasons = await Promise.all(
      outcomes.map(async (schema) => {
        const view = await readWorkflowSetting(portOf({ schema }), PLACE)
        return view.kind === "unavailable" ? view.reason : view.kind
      }),
    )

    expect(reasons).toEqual(["schema-unsupported", "schema-unsupported", "schema-unsupported"])
  })

  it("tw config が MISSING（終了コード6）なら config-missing", async () => {
    const view = await readWorkflowSetting(
      portOf({ config: ran(6, "MISSING\t.tw/config.toml") }),
      PLACE,
    )

    expect(view).toMatchObject({ kind: "unavailable", reason: "config-missing" })
  })

  it("tw config がほかの理由で失敗すれば config-unreadable で、stderr の1行目を添える", async () => {
    const view = await readWorkflowSetting(
      portOf({ config: ran(3, "", "\n.tw/config.toml の flow が語彙の外\n2行目\n") }),
      PLACE,
    )

    expect(view).toEqual({
      kind: "unavailable",
      repository: REPOSITORY,
      reason: "config-unreadable",
      detail: ".tw/config.toml の flow が語彙の外",
    })
  })

  it("読めれば、schema の欄ごとに今の値を添えて available", async () => {
    const view = await readWorkflowSetting(portOf({}), PLACE)

    expect(view).toEqual({
      kind: "available",
      repository: REPOSITORY,
      defaultWord: "既定の語",
      noneWord: "なしの語",
      fields: [
        {
          kind: "choice",
          key: "flow",
          label: "流れの名",
          description: "流れの説明",
          values: SCHEMA.keys[0]?.values,
          current: "second",
        },
        {
          kind: "part",
          key: "parts.reviewer",
          label: "見る役",
          description: "見る役の説明",
          candidates: "agent",
          allowNone: true,
          current: "既定の語",
        },
      ],
    })
  })
})

describe("readWorkflowSetting（schema 2）", () => {
  const withSchema2 = { schema2: ran(0, JSON.stringify(SCHEMA_2)) }

  it("--version 2 が通れば steps の欄を、config の値の列の JSON の配列で描く", async () => {
    const view = await readWorkflowSetting(
      portOf({
        ...withSchema2,
        config: ran(0, 'CONFIG\t.tw/config.toml\nsteps\t["架空:二つ目","架空:消えた"]\tconfig'),
      }),
      PLACE,
    )

    expect(view).toMatchObject({
      kind: "available",
      fields: [
        {
          kind: "steps",
          key: "steps",
          values: SCHEMA_2.keys[0]?.values,
          current: ["架空:二つ目", "架空:消えた"],
        },
      ],
    })
  })

  it("steps の値が config に無い・JSON として読めなければ default を使う", async () => {
    const lines = ["CONFIG\t.tw/config.toml", "CONFIG\t.tw/config.toml\nsteps\t壊れた\tconfig"]

    const currents = await Promise.all(
      lines.map(async (config) => {
        const view = await readWorkflowSetting(
          portOf({ ...withSchema2, config: ran(0, config) }),
          PLACE,
        )
        const field = view.kind === "available" ? view.fields[0] : undefined
        return field?.kind === "steps" ? field.current : undefined
      }),
    )

    expect(currents).toEqual([["架空:一つ目"], ["架空:一つ目"]])
  })

  it("--version 2 が失敗すれば引数なしの schema 1 に落ちて choice と part を描く", async () => {
    const view = await readWorkflowSetting(portOf({}), PLACE)

    expect(view).toMatchObject({
      kind: "available",
      defaultWord: "既定の語",
      fields: [{ kind: "choice" }, { kind: "part" }],
    })
  })

  it("--version 2 で tw が起動できなければ tw-missing", async () => {
    const view = await readWorkflowSetting(portOf({ schema2: { kind: "missing" } }), PLACE)

    expect(view).toMatchObject({ kind: "unavailable", reason: "tw-missing" })
  })
})

describe("changeWorkflowSetting", () => {
  it("SET なら読み直した面を返す", async () => {
    const port = portOf({})

    const change = await changeWorkflowSetting(port, PLACE, "flow", "second")

    expect(port.sets).toEqual([["flow", "second"]])
    expect(change).toMatchObject({ kind: "view", view: { kind: "available" } })
  })

  it("語彙の外（終了コード2）なら failed で、stderr の1行目を添える", async () => {
    const change = await changeWorkflowSetting(
      portOf({ set: ran(2, "", "tw config set: 架空の値 は語彙の外\n") }),
      PLACE,
      "flow",
      "架空の値",
    )

    expect(change).toEqual({
      kind: "failed",
      key: "flow",
      message: "tw config set: 架空の値 は語彙の外",
    })
  })

  it("設定が無い（終了コード6）なら config-missing の面", async () => {
    const change = await changeWorkflowSetting(
      portOf({ set: ran(6, "MISSING\t.tw/config.toml") }),
      PLACE,
      "flow",
      "second",
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
      "flow",
      "second",
    )

    expect(change).toMatchObject({
      kind: "view",
      view: { kind: "unavailable", reason: "tw-missing" },
    })
  })
})
