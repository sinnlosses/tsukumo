import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  readRememberedBackgroundModels,
  readRememberedCharacter,
  readRememberedSessionDefault,
  readRememberedSpeakingPace,
  writeRememberedBackgroundModels,
  writeRememberedCharacter,
  writeRememberedSessionDefault,
  writeRememberedSpeakingPace,
} from "../../../../src/server/session/adapter/remembered-default.ts"
import { BUILTIN_BACKGROUND_MODELS } from "../../../../src/shared/session/background-model.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../../src/shared/session/session-default.ts"
import { BUILTIN_SPEAKING_PACE } from "../../../../src/shared/session/speaking-pace.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("remembered-default")

function statePath(): string {
  return join(dir(), "state.json")
}

describe("readRememberedCharacter", () => {
  it("ファイルが無いときは undefined", () => {
    expect(readRememberedCharacter(statePath())).toBeUndefined()
  })

  it("JSON が壊れているときは undefined", () => {
    writeFileSync(statePath(), "{ 壊れた")
    expect(readRememberedCharacter(statePath())).toBeUndefined()
  })

  it("形が違う JSON（character が無い）のときは undefined", () => {
    writeFileSync(statePath(), JSON.stringify({ other: "value" }))
    expect(readRememberedCharacter(statePath())).toBeUndefined()
  })
})

// 起動時の初期パックの決め方（一覧に無い名前は既定へ落ちる／`TSUKUMO_CHARACTER` が
// 覚えた値より優先される、など）は `selectInitialCharacterPack` の契約で、
// そちらが持ち主として検査する。
// ここで確かめるのは `readRememberedCharacter` 自身の読み取りまで（このファイル冒頭の describe）。

// 新しいセッションの既定（モデル・effort・許可モード・図の既定。docs/architecture/screen-design.md「設定の置き場所」）。壊れた
// state.json でも起動を止めないので、読めないときは同梱の既定へ畳む。
describe("readRememberedSessionDefault", () => {
  it("ファイルが無いときは同梱の既定", () => {
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
  })

  it("JSON が壊れているときは同梱の既定", () => {
    writeFileSync(statePath(), "{ 壊れた")
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
  })

  it("欄が無いときは同梱の既定", () => {
    writeFileSync(statePath(), JSON.stringify({ character: "tsukumo-spirit" }))
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
  })

  it("知らないモデル名のときは同梱の既定", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({
        sessionDefault: { model: "no-such-model", effort: "high", permissionMode: "plan" },
      }),
    )
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
  })

  it("「全部許す」が書かれていても受け付けない（同梱の既定に落ちる）", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({
        sessionDefault: { model: "sonnet", effort: "high", permissionMode: "bypassPermissions" },
      }),
    )
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
  })

  it("既定の欄が壊れていても、覚えたキャラクターは読める", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({ character: "tsukumo", sessionDefault: { model: "no-such-model" } }),
    )

    expect(readRememberedCharacter(statePath())).toBe("tsukumo")
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
  })

  // effort だけ、無い古い state.json でも他の2つを読める（欄が無い＝ effort を足す前に
  // 覚えたファイル）。model / permissionMode は今までどおり1組のまま——effort だけ optional
  // にしてある（`sessionDefaultStateSchema`）。
  it("effort の無い古い state.json でも、モデル・許可モードは読めて effort だけ同梱の既定に落ちる", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({ sessionDefault: { model: "sonnet", permissionMode: "plan" } }),
    )

    expect(readRememberedSessionDefault(statePath())).toEqual({
      model: "sonnet",
      effort: "medium",
      permissionMode: "plan",
      figurePreference: "chart",
    })
  })

  it("figurePreference の無い古い state.json でも、ほかの3つは読めて図の既定だけ同梱の既定に落ちる", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({
        sessionDefault: { model: "sonnet", effort: "high", permissionMode: "plan" },
      }),
    )

    expect(readRememberedSessionDefault(statePath())).toEqual({
      model: "sonnet",
      effort: "high",
      permissionMode: "plan",
      figurePreference: "chart",
    })
  })

  it("知らない figurePreference が書かれているときは4つとも同梱の既定に落ちる", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({
        sessionDefault: {
          model: "sonnet",
          effort: "high",
          permissionMode: "plan",
          figurePreference: "no-such-preference",
        },
      }),
    )
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
  })

  it("知らない effort が書かれているときは3つとも同梱の既定に落ちる", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({
        sessionDefault: { model: "sonnet", effort: "no-such-effort", permissionMode: "plan" },
      }),
    )
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
  })

  it("effort が書かれているときはその値を読める", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({
        sessionDefault: {
          model: "sonnet",
          effort: "high",
          permissionMode: "plan",
          figurePreference: "text",
        },
      }),
    )

    expect(readRememberedSessionDefault(statePath())).toEqual({
      model: "sonnet",
      effort: "high",
      permissionMode: "plan",
      figurePreference: "text",
    })
  })
})

describe("writeRememberedSessionDefault", () => {
  // ディレクトリが無ければ作って書く／書き込み先が塞がっていても例外を投げないのは
  // `writeJsonFile` の契約で、
  // 2つの覚える口（character・sessionDefault）はどちらもその薄いラッパー。

  // 同じファイルを2つの口が書くので、片方の書き込みがもう片方を消さないことを見る
  // （書き込みはファイル丸ごとの置き換え。`writeRememberedSessionDefault`）。
  it("既定を書いても覚えたキャラクターは残る", () => {
    writeRememberedCharacter("tsukumo", statePath())
    writeRememberedSessionDefault(
      { model: "sonnet", effort: "high", permissionMode: "plan", figurePreference: "text" },
      statePath(),
    )

    expect(readRememberedCharacter(statePath())).toBe("tsukumo")
    expect(readRememberedSessionDefault(statePath())).toEqual({
      model: "sonnet",
      effort: "high",
      permissionMode: "plan",
      figurePreference: "text",
    })
  })

  it("キャラクターを覚え直しても既定は残る", () => {
    writeRememberedSessionDefault(
      { model: "sonnet", effort: "high", permissionMode: "plan", figurePreference: "text" },
      statePath(),
    )
    writeRememberedCharacter("kagami", statePath())

    expect(readRememberedSessionDefault(statePath())).toEqual({
      model: "sonnet",
      effort: "high",
      permissionMode: "plan",
      figurePreference: "text",
    })
    expect(readRememberedCharacter(statePath())).toBe("kagami")
  })
})

describe("readRememberedBackgroundModels", () => {
  it("ファイルが無いときは4つとも同梱の既定", () => {
    expect(readRememberedBackgroundModels(statePath())).toEqual(BUILTIN_BACKGROUND_MODELS)
  })

  it("欄が無いときは4つとも同梱の既定", () => {
    writeFileSync(statePath(), JSON.stringify({ character: "tsukumo" }))
    expect(readRememberedBackgroundModels(statePath())).toEqual(BUILTIN_BACKGROUND_MODELS)
  })

  it("知らない値・欠けた役はその役だけ同梱の既定に落ち、ほかの役は読める", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({ backgroundModels: { recommendation: "opus", welcomeGreeting: "gpt-9" } }),
    )
    expect(readRememberedBackgroundModels(statePath())).toEqual({
      ...BUILTIN_BACKGROUND_MODELS,
      recommendation: "opus",
    })
  })

  it("裏方のモデルの欄が壊れていても、キャラクターと新しいセッションの既定は読める", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({
        character: "kagami",
        sessionDefault: {
          model: "sonnet",
          effort: "high",
          permissionMode: "plan",
          figurePreference: "text",
        },
        backgroundModels: "壊れた",
      }),
    )
    expect(readRememberedBackgroundModels(statePath())).toEqual(BUILTIN_BACKGROUND_MODELS)
    expect(readRememberedCharacter(statePath())).toBe("kagami")
    expect(readRememberedSessionDefault(statePath()).model).toBe("sonnet")
  })
})

describe("writeRememberedBackgroundModels", () => {
  it("書いた値を読め、覚えたキャラクターと既定は残る", () => {
    writeRememberedCharacter("tsukumo", statePath())
    writeRememberedSessionDefault(
      { model: "sonnet", effort: "high", permissionMode: "plan", figurePreference: "text" },
      statePath(),
    )
    writeRememberedBackgroundModels(
      { ...BUILTIN_BACKGROUND_MODELS, chatConsolidation: "sonnet" },
      statePath(),
    )

    expect(readRememberedBackgroundModels(statePath()).chatConsolidation).toBe("sonnet")
    expect(readRememberedCharacter(statePath())).toBe("tsukumo")
    expect(readRememberedSessionDefault(statePath()).model).toBe("sonnet")
  })

  it("キャラクターを覚え直しても裏方のモデルは残る", () => {
    writeRememberedBackgroundModels(
      { ...BUILTIN_BACKGROUND_MODELS, characterGeneration: "sonnet" },
      statePath(),
    )
    writeRememberedCharacter("kagami", statePath())

    expect(readRememberedBackgroundModels(statePath()).characterGeneration).toBe("sonnet")
  })
})

describe("readRememberedSpeakingPace", () => {
  it("ファイルが無いときは2分・5分", () => {
    expect(readRememberedSpeakingPace(statePath())).toEqual(BUILTIN_SPEAKING_PACE)
  })

  it("欄が無いときは2分・5分", () => {
    writeFileSync(statePath(), JSON.stringify({ character: "tsukumo" }))
    expect(readRememberedSpeakingPace(statePath())).toEqual({
      waitingLine: "2m",
      progressNudge: "5m",
    })
  })

  it("片方が知らない値ならその欄だけ既定に落ち、もう片方は読める", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({ speakingPace: { waitingLine: "9m", progressNudge: "off" } }),
    )
    expect(readRememberedSpeakingPace(statePath())).toEqual({
      waitingLine: "2m",
      progressNudge: "off",
    })
  })

  it("欄が壊れていても、キャラクター・新しいセッションの既定・裏方のモデルは読める", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({
        character: "kagami",
        sessionDefault: {
          model: "sonnet",
          effort: "high",
          permissionMode: "plan",
          figurePreference: "text",
        },
        backgroundModels: { recommendation: "opus" },
        speakingPace: "壊れた",
      }),
    )
    expect(readRememberedSpeakingPace(statePath())).toEqual(BUILTIN_SPEAKING_PACE)
    expect(readRememberedCharacter(statePath())).toBe("kagami")
    expect(readRememberedSessionDefault(statePath()).model).toBe("sonnet")
    expect(readRememberedBackgroundModels(statePath()).recommendation).toBe("opus")
  })
})

describe("writeRememberedSpeakingPace", () => {
  it("書いた値を読め、ほかの欄は消えない", () => {
    writeRememberedCharacter("tsukumo", statePath())
    writeRememberedBackgroundModels(
      { ...BUILTIN_BACKGROUND_MODELS, chatConsolidation: "sonnet" },
      statePath(),
    )
    writeRememberedSpeakingPace({ waitingLine: "off", progressNudge: "10m" }, statePath())

    expect(readRememberedSpeakingPace(statePath())).toEqual({
      waitingLine: "off",
      progressNudge: "10m",
    })
    expect(readRememberedCharacter(statePath())).toBe("tsukumo")
    expect(readRememberedBackgroundModels(statePath()).chatConsolidation).toBe("sonnet")
  })
})
