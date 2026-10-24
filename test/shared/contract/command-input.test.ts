import { describe, expect, it } from "vitest"

import {
  MAX_CHARACTER_NAME_LENGTH,
  MAX_CHARACTER_TAGLINE_LENGTH,
} from "../../../src/shared/character-pack/character-definition.ts"
import { MAX_CHARACTER_PACK_NAME_LENGTH } from "../../../src/shared/character-pack/character.ts"
import { MAX_PERSONA_BODY_LENGTH } from "../../../src/shared/character-pack/persona-section.ts"
import { MAX_REMEMBERED_LINE_LENGTH } from "../../../src/shared/chat/persona-memory.ts"
import { MAX_SHOWN_WELCOME_GREETING_LENGTH } from "../../../src/shared/recommendation/welcome-greeting.ts"
import { commandContract } from "../../../src/shared/rpc.ts"
import {
  MAX_PROMPT_IMAGE_THUMBNAIL_DATA_URL_LENGTH,
  MAX_PROMPT_IMAGES,
} from "../../../src/shared/session-driver/prompt-image.ts"

/** 手続きの名前（`session.prompt` のように機能と手続きを `.` で繋いだもの）→ 入力のスキーマ。 */
const INPUT_SCHEMAS = new Map(
  Object.entries(commandContract).flatMap(([feature, procedures]) =>
    Object.entries(procedures).map(
      ([name, procedure]) => [`${feature}.${name}`, procedure["~orpc"].inputSchema] as const,
    ),
  ),
)

/**
 * 契約の手続き1つの入力として検証する。通れば受け手が受け取る形（`default` を埋めたもの）、
 * 通らなければ undefined（入力の無い手続きは何でも通さない）。
 */
function parseInput(procedure: `${string}.${string}`, value: unknown): unknown {
  const schema = INPUT_SCHEMAS.get(procedure)
  if (schema === undefined) {
    return undefined
  }
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

// 立ち絵の代わりに使う、1バイトぶんの架空の data URL（中身は見ないので何でもよい）。
const TINY_PNG_DATA_URL = "data:image/png;base64,AAAA"

/** 依頼に添える画像1枚ぶん（原寸と控えの対）。どちらも手で作った最小の data URL。 */
const TINY_PROMPT_IMAGE = { full: TINY_PNG_DATA_URL, thumbnail: TINY_PNG_DATA_URL }

const SVG_DATA_URL = "data:image/svg+xml;base64,AAAA"

/** 画像を `count` 枚添えた `prompt`（ほかの欄は通る形で固定する）。 */
function promptWithImages(images: readonly unknown[]): unknown {
  return { text: "架空の依頼", images }
}

/** `characterPack.create` の入力（通る形に `overrides` を重ねる。`undefined` を渡した欄は省く）。 */
function createCharacter(overrides: Record<string, unknown>): unknown {
  return Object.fromEntries(
    Object.entries({
      id: "fictional-2",
      name: "",
      portraits: { default: TINY_PNG_DATA_URL },
      accent: "#b8c7ff",
      chatAccent: "#eaa77a",
      persona: "",
      ...overrides,
    }).filter(([, value]) => value !== undefined),
  )
}

describe("コマンドの契約の入力（受け付ける形）", () => {
  it("prompt を受け付ける", () => {
    expect(parseInput("session.prompt", { text: "架空の依頼" })).toEqual({
      text: "架空の依頼",
      // 画像を添えない依頼は、field ごと省いた形で届いて空に畳まれる。
      images: [],
      routing: "new-request",
    })
    expect(
      parseInput("session.prompt", { text: "架空の依頼", routing: "aside-when-background" }),
    ).toMatchObject({ routing: "aside-when-background" })
  })

  it("nudge・interrupt は入力を持たない（押した事実だけが届く）", () => {
    // 文面の欄が無いのが nudge の形そのもの（送る一言は
    // `CHAT_NUDGE_PROMPT` が持つ。docs/architecture/screen-design.md「雑談モードの画面」）。
    expect(INPUT_SCHEMAS.get("session.nudge")).toBeUndefined()
    expect(INPUT_SCHEMAS.get("session.interrupt")).toBeUndefined()
  })

  it("session.recordWelcomeGreeting は上限までの文と知っている表情を受け付ける", () => {
    const text = "あ".repeat(MAX_SHOWN_WELCOME_GREETING_LENGTH)
    expect(parseInput("session.recordWelcomeGreeting", { text, expression: "curious" })).toEqual({
      text,
      expression: "curious",
    })
  })

  it("見た目の編集は、パックの名前として通る形なら受け付ける", () => {
    expect(parseInput("characterPack.clearBackground", { pack: "fictional-2" })).toEqual({
      pack: "fictional-2",
    })
  })

  it("characterPack.create の名前と人格は空文字でも受け付ける（空なら書き込む側が id へ落とす・人格を書かない）", () => {
    expect(parseInput("characterPack.create", createCharacter({}))).toMatchObject({
      name: "",
      persona: "",
    })
  })

  it("session.switchSession を受け付ける", () => {
    expect(parseInput("session.switchSession", { sessionId: "s-架空" })).toEqual({
      sessionId: "s-架空",
    })
  })

  it("上限の枚数までは、原寸と控えの対をそのまま通す", () => {
    const images = Array.from({ length: MAX_PROMPT_IMAGES }, () => TINY_PROMPT_IMAGE)

    expect(parseInput("session.prompt", promptWithImages(images))).toEqual({
      text: "架空の依頼",
      images,
      routing: "new-request",
    })
  })

  it("半角の英数字と `.` `_` `-` だけで `.` で始まらない名前なら、新しいパックを作らせる", () => {
    expect(parseInput("characterPack.create", createCharacter({ id: "my_pack-2.0" }))).toBeDefined()
  })

  it("characterPack.generateFromPortrait はモデルへ渡せる画像（png など）を受け付ける", () => {
    expect(
      parseInput("characterPack.generateFromPortrait", { portrait: TINY_PNG_DATA_URL }),
    ).toEqual({ portrait: TINY_PNG_DATA_URL })
  })

  it("characterPack.delete はパックの名前を受け付ける", () => {
    expect(parseInput("characterPack.delete", { pack: "fictional-2" })).toEqual({
      pack: "fictional-2",
    })
  })
})

describe("コマンドの契約の入力（落とす形）", () => {
  const tooLargeThumbnail = `data:image/png;base64,${"A".repeat(
    MAX_PROMPT_IMAGE_THUMBNAIL_DATA_URL_LENGTH,
  )}`
  const tooManyImages = Array.from({ length: MAX_PROMPT_IMAGES + 1 }, () => TINY_PROMPT_IMAGE)
  const welcome = (text: string, expression: string) => ({ text, expression })
  const profile = (overrides: Record<string, unknown>) => ({
    pack: "fictional",
    name: "架空",
    tagline: "ひとこと",
    ...overrides,
  })

  // 名前はディレクトリ名になるので、パスの区切りと `..` を通さない。必須の立ち絵は消させない
  // （docs/architecture/character-pack.md「画面から作るときの置き場と受け取り方」）。
  const rejected: readonly (readonly [string, `${string}.${string}`, unknown])[] = [
    ["prompt の routing が知らない値", "session.prompt", { text: "架空の依頼", routing: "aside" }],
    ["空白だけの依頼", "session.prompt", { text: "   " }],
    ["上限を超えた依頼", "session.prompt", { text: "あ".repeat(20_001) }],
    [
      "枚数が上限を超えた依頼（1枚だけ落とさず、コマンドごと受け付けない）",
      "session.prompt",
      promptWithImages(tooManyImages),
    ],
    [
      "原寸も控えも svg の画像（API が取らない）",
      "session.prompt",
      promptWithImages([{ full: SVG_DATA_URL, thumbnail: SVG_DATA_URL }]),
    ],
    [
      "原寸だけ svg の画像",
      "session.prompt",
      promptWithImages([{ full: SVG_DATA_URL, thumbnail: TINY_PNG_DATA_URL }]),
    ],
    ["data URL でない画像", "session.prompt", promptWithImages(["架空の文字列"])],
    [
      "対の片側（控え）が欠けた画像",
      "session.prompt",
      promptWithImages([{ full: TINY_PNG_DATA_URL }]),
    ],
    [
      "対の片側（原寸）が欠けた画像",
      "session.prompt",
      promptWithImages([{ thumbnail: TINY_PNG_DATA_URL }]),
    ],
    [
      "控えが大きすぎる画像（記録に残るのは控えなので原寸より厳しく見る）",
      "session.prompt",
      promptWithImages([{ full: TINY_PNG_DATA_URL, thumbnail: tooLargeThumbnail }]),
    ],
    ["reflectAchievement の YYYY-MM-DD でない日付", "session.reflectAchievement", { date: "9/23" }],
    ["reflectAchievement の空の日付", "session.reflectAchievement", { date: "" }],
    ["recordWelcomeGreeting の空の文", "session.recordWelcomeGreeting", welcome("", "curious")],
    [
      "recordWelcomeGreeting の上限超えの文",
      "session.recordWelcomeGreeting",
      welcome("あ".repeat(MAX_SHOWN_WELCOME_GREETING_LENGTH + 1), "curious"),
    ],
    [
      "recordWelcomeGreeting の知らない表情",
      "session.recordWelcomeGreeting",
      welcome("架空の挨拶", "架空の顔"),
    ],
    ["clearBackground のパックの名前が無い", "characterPack.clearBackground", {}],
    ...["", "..", "../fictional", "fictional/other", ".hidden", "架空"].map(
      (pack) =>
        [
          `clearBackground のパックの名前 ${JSON.stringify(pack)}`,
          "characterPack.clearBackground",
          { pack },
        ] as const,
    ),
    [
      "clearPortrait で default を消そうとする（必須は消せない）",
      "characterPack.clearPortrait",
      { pack: "fictional", expression: "default" },
    ],
    [
      "create の人格の本文が上限超え",
      "characterPack.create",
      createCharacter({ persona: "あ".repeat(MAX_PERSONA_BODY_LENGTH + 1) }),
    ],
    [
      "setProfile の名前が長すぎる",
      "characterPack.setProfile",
      profile({ name: "あ".repeat(MAX_CHARACTER_NAME_LENGTH + 1) }),
    ],
    [
      "setProfile のひとことが長すぎる",
      "characterPack.setProfile",
      profile({ tagline: "あ".repeat(MAX_CHARACTER_TAGLINE_LENGTH + 1) }),
    ],
    [
      "setProfile のパックの名前がパスになる",
      "characterPack.setProfile",
      profile({ pack: "../escape" }),
    ],
    ["switchSession の空のID", "session.switchSession", { sessionId: "" }],
    ["switchSession のIDが無い", "session.switchSession", {}],
    ...[
      "../escape",
      "..",
      ".hidden",
      "nested/name",
      "back\\slash",
      "空白 入り",
      "日本語",
      "",
      "a".repeat(MAX_CHARACTER_PACK_NAME_LENGTH + 1),
    ].map(
      (id) =>
        [
          `create のパックの名前 ${JSON.stringify(id.length > 40 ? "長すぎる名前" : id)}`,
          "characterPack.create",
          createCharacter({ id }),
        ] as const,
    ),
    [
      "generateFromPortrait の svg",
      "characterPack.generateFromPortrait",
      { portrait: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}` },
    ],
    [
      "generateFromPortrait の壊れた data URL",
      "characterPack.generateFromPortrait",
      { portrait: "data:image/png,AAAA" },
    ],
    ["generateFromPortrait の空", "characterPack.generateFromPortrait", { portrait: "" }],
    ...["../escape", "..", ".hidden", "nested/name", ""].map(
      (pack) =>
        [
          `delete のパックの名前 ${JSON.stringify(pack)}`,
          "characterPack.delete",
          { pack },
        ] as const,
    ),
    [
      "create の必須の立ち絵が欠けている",
      "characterPack.create",
      createCharacter({ portraits: {}, persona: undefined }),
    ],
    [
      "create の必須の立ち絵が data URL でない",
      "characterPack.create",
      createCharacter({
        portraits: { default: "data:text/plain;base64,AAAA" },
        persona: undefined,
      }),
    ],
    [
      "create の雑談の差し色が欠けている（両方 required）",
      "characterPack.create",
      createCharacter({ chatAccent: undefined, persona: undefined }),
    ],
    ["forgetRememberedLine の空の行", "chat.forgetRememberedLine", { line: "" }],
    [
      "forgetRememberedLine の上限を超えた行",
      "chat.forgetRememberedLine",
      { line: "あ".repeat(MAX_REMEMBERED_LINE_LENGTH + 1) },
    ],
    ["host.openFile の空の path", "host.openFile", { path: "" }],
    ["一覧に無いモデル", "session.setModel", { model: "gpt" }],
    ["一覧に無い許可モード", "session.setPermissionMode", { mode: "dontAsk" }],
    ["一覧に無い effort", "session.setEffort", { effort: "ultra" }],
    ["形の合わない答え", "session.answer", { id: "toolu_1", answer: { kind: "??" } }],
    ...[
      ["labels が数の配列", { kind: "answers", labels: [1, 2] }],
      ["labels が文字列の配列（配列の配列でない）", { kind: "answers", labels: ["答え"] }],
      ["labels が文字列", { kind: "answers", labels: "答え" }],
      ["labels が無い", { kind: "answers" }],
    ].map(
      ([name, answer]) =>
        [`answers の${String(name)}`, "session.answer", { id: "toolu_1", answer }] as const,
    ),
  ]

  it.each(rejected)("%s は undefined", (_, procedure, input) => {
    expect(parseInput(procedure, input)).toBeUndefined()
  })
})
