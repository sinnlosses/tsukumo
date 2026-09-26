// 訪問の台本を使い捨ての `query()` に書かせるための材料・指示文・形の検査（`docs/design.md` 5章
// 「訪問の台本」、提案は `docs/research/character-visit.md` 論点2）。純関数と定数だけで、
// `query()` を呼ぶのは `src/server/visit/adapter/sdk-visit-script.ts`、材料を集めて呼ぶ順序は
// `visit-script-writer.ts`。
//
// 渡すのは2つの人格・いまの仕事の抜き書き（依頼・直近のセリフ・待っているもの）・経過時間・
// 時刻・今日の成果。どれも会話の内容に当たるので、ここで組んだ文面も受け取った台本も
// メモリにだけ持ち、ログにもファイルにも書かない（docs/coding-standards.md「会話内容の扱い」）。
//
// 指示文は「どういう場面の・どれくらいの掛け合いか」だけを書く。誰がどう話すかは人格
// （`persona.md`）の側で、キャラクターの名前もセリフもここには書かない（原則4）。

import { isPlainObject } from "remeda"

import { type DailyAchievement } from "../../../shared/achievement.ts"
import { type CharacterDefinition } from "../../../shared/character-definition.ts"
import {
  VISIT_SPEAKERS,
  type VisitScript,
  type VisitScriptLine,
  type VisitSpeaker,
} from "../../../shared/character-visit.ts"
import { type ExpressionChoice, expressionChoices } from "../../../shared/expression-choice.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"
import { type SessionRecord, type SessionState } from "../../../shared/session-state.ts"
import { isWaiting, type VisitWait } from "./visit-timing.ts"

/** 台本を書かせるモデル（軽いもの。仕事のセッションのモデルとは別に決める）。 */
export const VISIT_SCRIPT_MODEL = "haiku"

/** 作り始めてからこれだけ経っても届かなければ諦め、パックの台本へ落とす。 */
export const VISIT_SCRIPT_TIMEOUT_MS = 30_000

/**
 * 台本の形と、抜き書きの量。抜き書きは「いま何を待っているか」が伝わるところまでに絞る
 * （長い文脈はトークンを食うだけ）。足りなければここだけ直す。
 */
export const VISIT_SCRIPT_LIMITS = {
  /** 台本の行数の下限と上限。 */
  minLines: 3,
  maxLines: 6,
  /** 1行のセリフの長さの上限（文字）。 */
  lineChars: 60,
  /** 依頼の文面は最後の1件の先頭だけ。 */
  requestChars: 200,
  /** 直近のセリフの件数と、1件の長さ。 */
  speechCount: 3,
  speechChars: 100,
  /** 待っているもの（走っているツール・背景のタスク）の件数と、1件の長さ。 */
  waitingCount: 3,
  waitingChars: 150,
  /** 今日終えたタスクの summary の件数。 */
  doneTaskCount: 5,
} satisfies Readonly<Record<string, number>>

/**
 * `query()` の `systemPrompt` に渡す指示文。場面と台本の決まりだけで、口調は人格に任せる。
 */
export const VISIT_SCRIPT_INSTRUCTION = `あなたは2人のキャラクターの短い掛け合いの台本を書く。

場面: あるじ（host）は利用者と一緒に仕事をしていて、いまはテストやビルドなど時間の掛かる処理が
終わるのを待っている。そこへ客（guest）が様子を見に訪ねてきて、少しだけ言葉を交わす。

- ${VISIT_SCRIPT_LIMITS.minLines}〜${VISIT_SCRIPT_LIMITS.maxLines} 行。1行目は客が話す。あるじと客の両方が1回以上話す
- 1行は ${VISIT_SCRIPT_LIMITS.lineChars} 字まで。日本語で、それぞれの人格の口調を守る
- 「いまの仕事の抜き書き」の話題（待っているもの・依頼・今日の成果）に軽く触れる
- 仕事の指示・助言・約束はしない。抜き書きに無い事実（結果・数字・ファイル名）を作らない
- 表情は、その行の話し手が選べる表情の名前から選ぶ
- 利用者を話し手にしない。ト書き・括弧の動作描写を入れない`

/** いまの仕事の抜き書き（{@link visitWorkExcerpt}）。依頼が無ければ `request` は空文字。 */
export type VisitWorkExcerpt = {
  readonly request: string
  readonly speeches: readonly string[]
  readonly waitingOn: readonly string[]
}

/** 台本の片側（あるじか客）の人格と、選べる表情。 */
export type VisitScriptSide = {
  readonly persona: string
  readonly expressions: readonly ExpressionChoice[]
}

/** 台本の2人。 */
export type VisitCast = { readonly host: VisitScriptSide; readonly guest: VisitScriptSide }

/** 2人のどちらかのパックが見つからなければ `missing`（作らずに落とし先へ）。 */
export type VisitCastLookup =
  | { readonly kind: "found"; readonly cast: VisitCast }
  | { readonly kind: "missing" }

/** 2人を探す元のパック（adapter の `CharacterPack` のうち、ここが読む部分だけ）。 */
export type VisitCastSource = {
  readonly name: string
  readonly persona: string | undefined
  readonly definition: CharacterDefinition | undefined
}

/** 台本を書かせる材料。 */
export type VisitScriptMaterial = {
  readonly cast: VisitCast
  readonly excerpt: VisitWorkExcerpt
  /** 待ち始めてからの長さ（ミリ秒）。 */
  readonly waitedMs: number
  /** いまのローカル時刻（`HH:MM`）。 */
  readonly localTime: string
  readonly achievement: DailyAchievement
}

/** `query()` に渡すもの（モデル・指示文・依頼の文面・出力の形）。 */
export type VisitScriptQuery = {
  readonly model: string
  readonly systemPrompt: string
  readonly prompt: string
  readonly schema: Readonly<Record<string, unknown>>
}

/**
 * いまの姿から仕事の抜き書きを作る。依頼は最後の1件、セリフは最後の数件、待っているものは
 * 走っているトップレベルのツール（無ければ背景のタスク）。
 */
export function visitWorkExcerpt(state: SessionState): VisitWorkExcerpt {
  const { records } = state
  const request = records.findLast((record) => record.kind === "request")
  const speeches = records
    .flatMap((record) => (record.kind === "speech" ? [record.text] : []))
    .slice(-VISIT_SCRIPT_LIMITS.speechCount)
    .map((text) => clip(text, VISIT_SCRIPT_LIMITS.speechChars))
  const running = runningTopLevelTools(records).map(describeTool)
  const waitingOn = (
    running.length > 0 ? running : state.backgroundTasks.map((task) => task.description)
  )
    .slice(0, VISIT_SCRIPT_LIMITS.waitingCount)
    .map((text) => clip(text, VISIT_SCRIPT_LIMITS.waitingChars))
  return {
    request: request === undefined ? "" : clip(request.text, VISIT_SCRIPT_LIMITS.requestChars),
    speeches,
    waitingOn,
  }
}

/** 待ち始めてからの長さ。待っていない（勘定が `waiting` でない）ときは 0。 */
export function visitWaitedMs(wait: VisitWait, now: number): number {
  return wait.kind === "waiting" ? Math.max(0, now - wait.since) : 0
}

/**
 * 台本を作っている最中に、そのイベントで作るのをやめるか。帰る合図（`visit-timing.ts` の
 * `visitDeparture`）と同じ顔ぶれ——依頼・本物の `speak`・セッションの終わり・待ちの終わり
 * （答え待ちが積まれたときも待ちでなくなる）。歯車の「訪問」をオフにしたときも中断する
 * （`visit-started` がまだ流れていないので `visitDeparture` は関与しない——ここで止めないと、
 * オフにした直後でも作りかけの客がそのまま来てしまう）。
 */
export function interruptsVisitScript(state: SessionState, event: SessionEvent): boolean {
  switch (event.kind) {
    case "request":
    case "speech":
    case "session-ended":
      return true
    case "visit-enabled-changed":
      return !event.visitEnabled
    default:
      return !isWaiting(state)
  }
}

/** パックの一覧から、あるじと客の人格と表情を拾う。人格の「無い」は空文字に畳む。 */
export function visitCast(
  packs: readonly VisitCastSource[],
  host: string,
  guest: string,
): VisitCastLookup {
  const hostPack = packs.find((pack) => pack.name === host)
  const guestPack = packs.find((pack) => pack.name === guest)
  if (hostPack === undefined || guestPack === undefined) {
    return { kind: "missing" }
  }
  return { kind: "found", cast: { host: toSide(hostPack), guest: toSide(guestPack) } }
}

/** 材料から `query()` に渡すものを組む。 */
export function visitScriptQuery(material: VisitScriptMaterial): VisitScriptQuery {
  return {
    model: VISIT_SCRIPT_MODEL,
    systemPrompt: VISIT_SCRIPT_INSTRUCTION,
    prompt: visitScriptPrompt(material),
    schema: visitScriptSchema(material.cast),
  }
}

/**
 * 受け取った台本（`structured_output`）を検査する。どこか1つでも崩れていたら丸ごと
 * undefined（1行だけ直して使うことはしない。落とし先へ回す）。
 *
 * - 形: `lines` が {@link VISIT_SCRIPT_LIMITS} の行数の並びで、各行のセリフが空でなく長すぎない
 * - 話し手: `host` か `guest` のどちらか。1行目は客で、2人とも1回以上話す
 * - 表情: その行の話し手のパックが選べる表情のどれか（客の表情をあるじの行に使わない）
 */
export function parseVisitScript(value: unknown, cast: VisitCast): VisitScript | undefined {
  if (!isPlainObject(value) || !Array.isArray(value.lines)) {
    return undefined
  }
  const { lines } = value
  if (lines.length < VISIT_SCRIPT_LIMITS.minLines || lines.length > VISIT_SCRIPT_LIMITS.maxLines) {
    return undefined
  }
  const script = lines.map((line) => toScriptLine(line, cast))
  if (!script.every((line): line is VisitScriptLine => line !== undefined)) {
    return undefined
  }
  const speakers = new Set(script.map((line) => line.speaker))
  return script[0]?.speaker === "guest" && speakers.size === VISIT_SPEAKERS.length
    ? script
    : undefined
}

function toSide(pack: VisitCastSource): VisitScriptSide {
  return { persona: pack.persona ?? "", expressions: expressionChoices(pack.definition) }
}

function toScriptLine(value: unknown, cast: VisitCast): VisitScriptLine | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }
  const { speaker, expression, text } = value
  if (!isVisitSpeaker(speaker) || typeof text !== "string") {
    return undefined
  }
  const trimmed = text.trim()
  if (trimmed === "" || [...trimmed].length > VISIT_SCRIPT_LIMITS.lineChars) {
    return undefined
  }
  const choice = cast[speaker].expressions.find((candidate) => candidate.name === expression)
  return choice === undefined ? undefined : { speaker, expression: choice.name, text: trimmed }
}

function isVisitSpeaker(value: unknown): value is VisitSpeaker {
  return typeof value === "string" && VISIT_SPEAKERS.some((speaker) => speaker === value)
}

/**
 * 出力の形。表情は2人の選択肢を合わせた enum にし、話し手ごとの照合は受け取ってから
 * （{@link parseVisitScript}）行う。
 */
function visitScriptSchema(cast: VisitCast): Readonly<Record<string, unknown>> {
  const expressions = [
    ...new Set([...cast.host.expressions, ...cast.guest.expressions].map((choice) => choice.name)),
  ]
  return {
    type: "object",
    properties: {
      lines: {
        type: "array",
        minItems: VISIT_SCRIPT_LIMITS.minLines,
        maxItems: VISIT_SCRIPT_LIMITS.maxLines,
        items: {
          type: "object",
          properties: {
            speaker: { type: "string", enum: [...VISIT_SPEAKERS] },
            expression: { type: "string", enum: expressions },
            text: { type: "string" },
          },
          required: ["speaker", "expression", "text"],
          additionalProperties: false,
        },
      },
    },
    required: ["lines"],
    additionalProperties: false,
  }
}

function visitScriptPrompt(material: VisitScriptMaterial): string {
  const { cast, excerpt } = material
  return [
    "## あるじ（host）の人格",
    cast.host.persona,
    "## 客（guest）の人格",
    cast.guest.persona,
    "## あるじが選べる表情",
    expressionList(cast.host.expressions),
    "## 客が選べる表情",
    expressionList(cast.guest.expressions),
    "## いまの仕事の抜き書き",
    [
      `- 依頼: ${excerpt.request === "" ? "（なし）" : excerpt.request}`,
      `- 直近のあるじのセリフ:${bulletList(excerpt.speeches)}`,
      `- 待っているもの:${bulletList(excerpt.waitingOn)}`,
      `- 待ち始めてから: 約 ${Math.max(1, Math.round(material.waitedMs / 60_000))} 分`,
      `- いまの時刻: ${material.localTime}`,
      `- 今日の成果: ${achievementLine(material.achievement)}`,
    ].join("\n"),
  ].join("\n\n")
}

function expressionList(choices: readonly ExpressionChoice[]): string {
  return choices.map((choice) => `- ${choice.name}: ${choice.label}`).join("\n")
}

function bulletList(items: readonly string[]): string {
  return items.length === 0 ? " （なし）" : items.map((item) => `\n  - ${item}`).join("")
}

function achievementLine(achievement: DailyAchievement): string {
  if (achievement.kind === "unknown") {
    return "（分からない）"
  }
  const commits = `コミット ${String(achievement.commitCount)} 件`
  if (achievement.doneTasks.kind === "unknown" || achievement.doneTasks.items.length === 0) {
    return commits
  }
  const tasks = achievement.doneTasks.items
    .slice(0, VISIT_SCRIPT_LIMITS.doneTaskCount)
    .map((task) => task.summary)
    .join(" / ")
  return `${commits}。終えたタスク: ${tasks}`
}

/** 走っているトップレベルのツール（いまのやり取り＝最後の依頼より後ろだけ）。 */
function runningTopLevelTools(
  records: readonly SessionRecord[],
): readonly Extract<SessionRecord, { readonly kind: "tool" }>[] {
  const lastRequest = records.findLastIndex((record) => record.kind === "request")
  return records
    .slice(lastRequest + 1)
    .flatMap((record) =>
      record.kind === "tool" && !record.nested && record.status.kind === "running" ? [record] : [],
    )
}

/** ツールの名前と、添えられた説明とコマンド（どちらも無ければ名前だけ）。 */
function describeTool(tool: Extract<SessionRecord, { readonly kind: "tool" }>): string {
  const input = isPlainObject(tool.input) ? tool.input : {}
  const details = [input.description, input.command].filter(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  )
  return details.length === 0 ? tool.name : `${tool.name}: ${details.join(" / ")}`
}

function clip(text: string, max: number): string {
  const chars = [...text.trim()]
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : chars.join("")
}
