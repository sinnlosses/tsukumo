// Agent SDK による本物のセッション駆動。Claude Code を子プロセスとして起こし、届いた
// メッセージを内部イベントに変えて流す（`src/server/core/session-driver.ts` の `SessionDriver` を
// 実装する2つのうちの本物。もう1つは `src/server/adapter/fake-driver.ts`）。
//
// **`@anthropic-ai/claude-agent-sdk` を import するのはこのファイルだけ**（原則3。`orca` を
// 呼ぶのが src/server/adapter/orca-host.ts だけなのと同じ扱い）。SDK の語彙を外へ漏らさないため、
// 外に出す型は `src/server/core/session-driver.ts` か shared から取る（**境目の基準は「shared の
// 語彙で書けるか / SDK の語彙を名乗るか」**）。
//
// **セッションは1プロセスに1つ**。起こし直したときは前の続きから始める（`resume`。
// docs/requirements.md 4.8「セッションの復元」。選ぶ計算は src/server/core/session-restore.ts）。
//
// 会話の内容（本文・ツールの入出力・セリフ）がここを通るが、**ログにもファイルにも書かない**
// （docs/coding-standards.md「会話内容の扱い」）。stderr に出すのは SDK 自身のエラー文だけ。

import {
  createSdkMcpServer,
  type EffortLevel,
  getSessionMessages,
  type HookCallbackMatcher,
  type HookEvent,
  listSessions,
  type PermissionResult,
  query,
  type SDKUserMessage,
  tagSession,
  tool,
} from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { type PermissionMode } from "../../shared/command.ts"
import {
  CONTEXT_CATEGORY_KINDS,
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../shared/context-usage.ts"
import {
  type ExpressionChoice,
  expressionNames as toExpressionNames,
} from "../../shared/expression-choice.ts"
import { type Expression } from "../../shared/expression.ts"
import { parsePromptImage, type PromptImage } from "../../shared/prompt-image.ts"
import { type SessionChoice } from "../../shared/session-choice.ts"
import { type SessionEvent } from "../../shared/session-event.ts"
import { readChatTopics } from "../core/chat-compact.ts"
import { chatRecallText } from "../core/chat-memory-prompt.ts"
import { createPendingAnswerQueue, type PendingAnswerQueue } from "../core/pending-answer.ts"
import { type ClaudeAccountTier, planName } from "../core/plan.ts"
import { recordedPromptImages } from "../core/prompt-image-shelf.ts"
import {
  SPEAK_TOOL_NAME,
  toCommandDescriptions,
  toPlan,
  toSessionEvents,
  TSUKUMO_MCP_SERVER_NAME,
} from "../core/sdk-message.ts"
import {
  type ChatKeep,
  type ChatRecall,
  type PersonaMemory,
  type SessionDriver,
  type SessionDriverOptions,
  type SessionMode,
} from "../core/session-driver.ts"
import {
  listMarkedSessions,
  selectSessionToResume,
  toRestoredEvents,
} from "../core/session-restore.ts"
import { readClaudeAccountTier } from "./claude-account.ts"

/**
 * 既定の reasoning effort。high に固定した
 * （docs/requirements.md 4.1）。画面には出さない（設定するだけ）。
 */
export const DEFAULT_EFFORT: EffortLevel = "high"

/**
 * ターンが終わってから印（`tagSession`）を付け直すまでの待ち。**本体もターンの終わりに
 * セッションの要約を自分で書き、そこに印が含まれない**ので、書き込みと重なると印が消える
 * （実測: `init` の直後・`result` の直後に付けた印はどちらも消え、ターンの3秒後に
 * 付けた印は入力を閉じたあとまで残った）。**ターンが終わるたびに付け直す**ので、途中の1回が
 * 消えても次のターンで戻る。
 */
const SESSION_TAG_DELAY_MS = 3_000

/** モデルに見せる `speak` ツールの説明。**セリフと本文の境目はここだけで説明する。** */
const SPEAK_TOOL_DESCRIPTION =
  "キャラクターがユーザーに向けて話す。掛け声・呼びかけ・リアクション・感想・完了報告はこのツールで言う。" +
  "手順・コード・表・判断とその理由は本文に書き、ここには入れない。"

/**
 * コンテキストの内訳を取るときの細かさ。**`'full'` に固定する**（分類ごとに token-count API で
 * 数えた値が返る）。`'summary'` は直前の応答の usage と手元の見積もりで答えるので、合計は同じ
 * でも**分類ごとの値が実測で最大2倍ずれる**（メモリファイル 12244 → 5730、システムツール
 * 8686 → 14612）。画面に出すのが分類ごとの内訳そのものなので、ずれた値では読めない。
 * **待たされるのは初回だけ**（実測: 初回 571ms、2回目以降 8-16ms。本体側が数えた結果を持つ）。
 */
const CONTEXT_USAGE_DETAIL = "full"

/**
 * {@link readContextUsage} が要る口だけを写した形。**`query()` の戻り値そのものを引数に取らない**
 * のは、本物のセッションを起こさずに写しを検査できるようにするため。
 */
type ContextUsageSource = {
  readonly getContextUsage: (opts: { readonly detail: "full" }) => Promise<unknown>
}

/**
 * SDK が返す内訳のうち**画面が要る鍵だけ**を見るスキーマ（外の世界の値なので境界で検証する。
 * `docs/coding-standards.md`「型を迂回するキャストを使わない」）。知らない鍵は zod が落とすので、
 * SDK 側に鍵が増えても写しは変わらない。
 */
const sdkContextUsageSchema = z.object({
  model: z.string(),
  totalTokens: z.number(),
  rawMaxTokens: z.number(),
  percentage: z.number(),
  categories: z.array(
    z.object({ name: z.string(), tokens: z.number(), kind: z.enum(CONTEXT_CATEGORY_KINDS) }),
  ),
  mcpTools: z.array(z.object({ name: z.string(), serverName: z.string(), tokens: z.number() })),
  memoryFiles: z.array(z.object({ path: z.string(), type: z.string(), tokens: z.number() })),
  skills: z
    .object({
      skillFrontmatter: z.array(
        z.object({ name: z.string(), source: z.string(), tokens: z.number() }),
      ),
    })
    .optional(),
})

/** 覚えたことを書き足すツールの名前（docs/glossary.md「remember ツール」）。 */
const REMEMBER_TOOL_NAME = "remember"

/**
 * モデルに見せる `remember` ツールの説明。**何を書いてよいかの条は
 * `src/server/core/chat-manner.ts` が持つ**ので、ここには置き場所と形だけを書く
 * （二重に書かない）。
 */
const REMEMBER_TOOL_DESCRIPTION =
  "キャラクター自身について決まったことを1行だけ覚える（好み・口調・呼び方・来歴）。" +
  "ユーザーについて知ったことは覚えない。呼ぶ条件は雑談モードの規約に従う。"

/** 覚えた1行を忘れるツールの名前（docs/glossary.md「forget ツール」）。 */
const FORGET_TOOL_NAME = "forget"

/**
 * モデルに見せる `forget` ツールの説明。**何を消してよいかの条は
 * `src/server/core/chat-manner.ts` が持つ**ので、ここには指し方と範囲だけを書く
 * （二重に書かない）。
 */
const FORGET_TOOL_DESCRIPTION =
  "「覚えたこと」に並んでいる1行を忘れる。消したい行の文面をそのまま渡す（完全一致。番号では指せない）。" +
  "消せるのは自分で覚えた行だけで、それ以外の人格の文面は消せない。呼ぶ条件は雑談モードの規約に従う。"

/** いまのやり取りに「残す」旗を立てるツールの名前（docs/glossary.md「keep ツール」）。 */
const KEEP_TOOL_NAME = "keep"

/**
 * モデルに見せる `keep` ツールの説明。**いつ立てるかの条は
 * `src/server/core/chat-manner.ts` が持つ**ので、ここには何が起きるかと指せる範囲だけを書く
 * （二重に書かない）。
 */
const KEEP_TOOL_DESCRIPTION =
  "いま話しているやり取りに「残す」印を付ける。引数は無く、指せるのはこのターンの1往復だけ。" +
  "印の付いたやり取りは、直近を読み戻す窓から溢れても忘れずに残る。呼ぶ条件は雑談モードの規約に従う。"

/** その日の見出しを索引に残すツールの名前（docs/glossary.md「index ツール」）。 */
const INDEX_TOOL_NAME = "index"

/**
 * モデルに見せる `index` ツールの説明。**いつ書くかの条は
 * `src/server/core/chat-manner.ts` が持つ**ので、ここには何が起きるかと指せる範囲だけを書く
 * （二重に書かない）。
 */
const INDEX_TOOL_DESCRIPTION =
  "今日の雑談に、あとで探すための見出しを1行だけ付ける。付くのは今日の日付で、前の日には付け直せない。" +
  "この見出しは `recall` で引く索引になる。呼ぶ条件は雑談モードの規約に従う。"

/** 索引を引いて古い雑談を思い出すツールの名前（docs/glossary.md「recall ツール」）。 */
const RECALL_TOOL_NAME = "recall"

/**
 * モデルに見せる `recall` ツールの説明。**いつ引くかの条は
 * `src/server/core/chat-manner.ts` が持つ**ので、ここには何が返るかと引ける回数だけを書く
 * （二重に書かない）。
 */
const RECALL_TOOL_DESCRIPTION =
  "日ごとの見出しの索引を言葉で引き、当たった日の雑談をそのままの文面で思い出す。" +
  "当たらなければ何も返らない。引けるのは1ターンに1回だけ。呼ぶ条件は雑談モードの規約に従う。"

/**
 * Agent SDK の駆動を1つ起こす（`docs/glossary.md`「セッション駆動」の実装）。**この関数は
 * 待たない**（`query()` の反復はバックグラウンドで回り続け、結果は `onEvent` に流れる）。
 *
 * **名前が `startSession` ではなく `startSdkDriver` なのは、`src/session-start.ts` の
 * `startSession`（セッションを1つ起こす配線）と役割が違うから** — こちらは駆動を1つ起こす
 * だけで、覚えた既定を読む・見張りを起こす・履歴を復元するといった一続きの段取りは持たない
 * （その段取りは `core/session-launch.ts`）。
 *
 * 反復が例外で終わったら `session-ended` を流すだけで、**プロセスは落とさない**
 * （docs/coding-standards.md「エラーハンドリング」）。`try`/`catch` は反復を包む1つだけに
 * まとめてある。
 */
export function startSdkDriver(options: SessionDriverOptions): SessionDriver {
  const input = createPromptStream()
  const queue = createPendingAnswerQueue({
    onChange: (pending) => {
      options.onEvent({ kind: "pending-changed", pending })
    },
    onAnswered: (questions, answers) => {
      options.onEvent({ kind: "question-answered", questions, answers })
    },
  })

  const session = query({
    prompt: input.stream(),
    options: {
      ...buildQuerySeedOptions(options),
      hooks: chatSummaryHooks(options.mode, options.onEvent),
      mcpServers: {
        [TSUKUMO_MCP_SERVER_NAME]: tsukumoServer(options.expressions, options.mode),
      },
      canUseTool: (toolName, toolInput, { signal, toolUseID }) =>
        askForAnswer(queue, toolUseID, toolName, toolInput, signal),
    },
  })

  void applyNeutralOutputStyle(session)
  void relayMessages(session, options)
  void relayCommandDescriptions(session, options)
  void relayPlan(session, options)

  return {
    prompt: (text, images) => {
      // **原寸と控えはここで分かれる。** 控えと id だけが記録（`request`）へ行き、原寸は
      // ストリーミング入力へ流れる（棚に残っているぶんは棚の寿命で捨てる。
      // `docs/requirements.md` 4.10）。
      options.onEvent({ kind: "request", text, images: recordedPromptImages(images) })
      input.push({ text, images: images.flatMap(toImageBlocks) })
    },
    promptWithoutRecord: (text) => {
      // **`request` を流さない**（送った文面をログにも記録にも残さない。docs/screen-design.md 13.7）。
      // 代わりにターンの始まりだけを流し、吹き出しと進行中の印は依頼と同じに動かす。
      options.onEvent({ kind: "turn-started" })
      input.push({ text, images: [] })
    },
    interrupt: async () => {
      await session.interrupt()
    },
    answer: (id, answer) => queue.answer(id, answer),
    pending: () => queue.list(),
    readContextUsage: () => readContextUsage(session),
    setModel: async (model) => {
      await session.setModel(model)
      // サイドバーの `<select>` は `state.model` をそのまま出すので、ここで確認の合図を
      // 出さないと次のターンの `init` まで古い値に居座る（`/model` チャットコマンドのために
      // 足した `model-changed` を、駆動が確定させた切り替えにもそのまま使う。実測:
      // fake driver（fake-driver.ts）は最初からこれをやっていたが、本物の駆動は抜けていた）。
      if (model !== undefined) {
        options.onEvent({ kind: "model-changed", model })
      }
    },
    setPermissionMode: (mode) => session.setPermissionMode(mode),
    close: () => {
      input.end()
    },
  }
}

/** `query()` の `options` のうち、`mcpServers` / `canUseTool`（クロージャが要る）を除いた部分。 */
export type QuerySeedOptions = {
  readonly cwd: string
  readonly includePartialMessages: true
  readonly systemPrompt: {
    readonly type: "preset"
    readonly preset: "claude_code"
    readonly append: string
  }
  readonly permissionMode: PermissionMode
  readonly model: string
  readonly effort: EffortLevel
  /**
   * 続きから始めるセッションのID。新規に起こすときは undefined（SDK 側は省略と同じ扱い）。
   * **ここだけは `SessionDriverOptions.start`（判別可能な合併型）を `query()` 自身の語彙
   * （`resume?: string`）へ畳んだ値**——`query()` へそのまま渡す形を検査できるように
   * `buildQuerySeedOptions` を切り出してあるのと同じ理由で、この1箇所だけ外の世界（SDK）の
   * 形をそのまま写す（`docs/coding-standards.md`「「無いかもしれない」値」の例外1）。
   */
  readonly resume: string | undefined
}

/**
 * `query()` に渡す `options` のうち、クロージャを含まない部分を組み立てる。**本物の
 * `query()` を呼ばずに、覚えた既定（モデル・許可モード）と {@link DEFAULT_EFFORT} が渡る形を
 * 検査できるように、`startSdkDriver` から切り出してある。**
 *
 * **モデルと許可モードは呼び出し側から来る**（`src/session-start.ts` が
 * `readRememberedSessionDefault` で読んだ値。`docs/screen-design.md` 13.6）。ここで定数に倒すと、
 * 歯車で変えた既定が起こし直しても効かない。
 */
export function buildQuerySeedOptions(options: SessionDriverOptions): QuerySeedOptions {
  return {
    cwd: options.cwd,
    includePartialMessages: true,
    systemPrompt: { type: "preset", preset: "claude_code", append: options.systemPromptAppend },
    permissionMode: options.permissionMode,
    model: options.model,
    effort: DEFAULT_EFFORT,
    resume: options.start.kind === "resume" ? options.start.sessionId : undefined,
  }
}

/**
 * 雑談の要約の写しへ書き込む `PostCompact` フック（`docs/design.md` 7章）。**雑談のとき
 * （`options.mode` が `chat`）だけ登録する**——仕事のときは `hooks`
 * そのものを渡さない（undefined。`query()` 側は省略と同じ扱い）。
 *
 * `compact_summary` は**ログに出さず**、中身を読まずに {@link ChatSummary.write} へそのまま
 * 渡す（`docs/coding-standards.md`「会話内容の扱い」）。フックは `trigger` が `"manual"` でも
 * `"auto"` でも同じ扱いにする（`docs/design.md` 7章）。
 *
 * 写したあとは、**書いた写しから取り出した最近の話題の見出しだけ**を `chat-topics-changed` で
 * 流す（`docs/screen-design.md` 13.7）。取り出し方は core（`readChatTopics`）が持ち、ここは中身を
 * 見ない。
 *
 * `startSdkDriver` から切り出してあるのは、本物の `query()` を呼ばずにフックの中身を検査できる
 * ようにするため（{@link buildQuerySeedOptions} と同じ理由）。
 */
export function chatSummaryHooks(
  mode: SessionMode,
  onEvent: (event: SessionEvent) => void,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> | undefined {
  if (mode.kind !== "chat") {
    return undefined
  }

  const { chatSummary } = mode
  return {
    PostCompact: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name === "PostCompact") {
              chatSummary.write(input.compact_summary)
              onEvent({ kind: "chat-topics-changed", topics: readChatTopics(chatSummary) })
            }
            return {}
          },
        ],
      },
    ],
  }
}

/**
 * 続きから始めるセッションを探す（起動時と、キャラクターを切り替えるたび。
 * docs/requirements.md 4.8）。**同じ作業ディレクトリで、渡された印を持つもの**のうち最新の1つを
 * 返し、無ければ undefined（新規に起こす）。
 *
 * **`includeWorktrees` を入れてある**のは、**セッションごとに別の worktree で起こされうる**ため
 * （作業ツリーを用意するのは orca の側）。起こすたびに違うディレクトリなら、作業ディレクトリ
 * だけで絞ると**前の続きが一度も見つからなくなる**。同じリポジトリの worktree を全部見たうえで、
 * 印（`tsukumo:<パック>@<ポート>`）で絞る。
 *
 * **一覧が読めなくても落とさない**（前提不足ではなく動作中の一時的な失敗として扱い、新規に
 * 起こす。docs/coding-standards.md「エラーハンドリング」）。
 */
export async function findSessionToResume(cwd: string, tag: string): Promise<string | undefined> {
  try {
    return selectSessionToResume(await listSessions({ dir: cwd, includeWorktrees: true }), tag)
  } catch {
    return undefined
  }
}

/**
 * 切り替え先として選べるセッションを一覧にする（画面のセッションの `<select>`。
 * `docs/requirements.md` 4.8）。絞り込みと並びは `src/server/core/session-restore.ts` の
 * `listMarkedSessions` が決める。
 *
 * 絞り込みの鍵も `includeWorktrees` を入れる理由も {@link findSessionToResume} と同じで、違うのは
 * 「最新の1つ」ではなく「同じ印を持つものを全部」返すところだけ。
 *
 * **一覧が読めなくても落とさない**（切り替えの選択肢が出ないだけ。
 * docs/coding-standards.md「エラーハンドリング」）。
 */
export async function listSwitchableSessions(
  cwd: string,
  tag: string,
): Promise<readonly SessionChoice[]> {
  try {
    return listMarkedSessions(await listSessions({ dir: cwd, includeWorktrees: true }), tag)
  } catch {
    return []
  }
}

/**
 * 前のセッションの transcript を読み直して、画面の履歴を組み直すためのイベントにする
 * （docs/requirements.md 4.8）。**読めなければ空**（会話（`resume`）だけ生きていれば続行する）。
 *
 * **`includeSystemMessages: true` を渡す**。既定では `system` のメッセージ
 * （`compact_boundary` を含む）が返らず、`getSessionMessages` は親子の鎖をたどるので、圧縮が
 * 起きたセッションでは**そこより前が既定では返らない**（docs/glossary.md「圧縮の区切り」）。
 * 他の `system` メッセージが混ざっても、`toSessionEvents` 側が知らない種別を空へ倒すので落ちない。
 *
 * **`dir` は渡さない**（SDK 側はすべてのプロジェクトから探す）。続きから始めるセッションは
 * **別の worktree で起きたもの**でありうるので、いまの作業ディレクトリで絞ると見つからない
 * （`findSessionToResume` が `includeWorktrees` を入れてあるのと同じ理由）。指しているのは
 * 一意なセッションIDなので、絞らなくても別のものには当たらない。
 *
 * 読んだ内容はそのままイベントの流れに渡すだけで、**どこにも書き出さない**
 * （docs/coding-standards.md「会話内容の扱い」）。
 */
export async function readRestoredEvents(
  sessionId: string,
  expressions: readonly ExpressionChoice[],
): Promise<readonly SessionEvent[]> {
  try {
    return toRestoredEvents(
      await getSessionMessages(sessionId, { includeSystemMessages: true }),
      toExpressionNames(expressions),
    )
  } catch {
    return []
  }
}

/**
 * いまのコンテキストの内訳を SDK に問い合わせる（`docs/glossary.md`「コンテキストの内訳」）。
 * **取れなかった回は「取れない」を返すだけ**で、例外は外へ出さない。
 *
 * **ターンの実行中に呼んでも待たされない**（実測: 実行中の呼び出しが13ms で返り、値は直前の
 * 応答までの積み上がりを指す）。だから画面は進行中でも同じ経路で取りに行く。
 */
async function readContextUsage(session: ContextUsageSource): Promise<ContextUsageReport> {
  try {
    return toContextUsage(await session.getContextUsage({ detail: CONTEXT_USAGE_DETAIL }))
  } catch {
    return UNAVAILABLE_CONTEXT_USAGE
  }
}

/**
 * SDK が返した内訳を tsukumo の形に写す（**SDK の語彙を外へ出さない**）。読めない形のときは
 * 「取れない」（届く形が変わっても画面は札を1枚落とすだけで、他は動き続ける）。
 *
 * **`skills` は1件ずつの並びではなく、まとめの中の `skillFrontmatter` に入っている**ので、
 * そこから取り出して他の2つと同じ形に揃える。`rawMaxTokens` のほうを窓の大きさに使うのは、
 * 使用量を測る相手がそれだと SDK の型の説明にあるため。
 *
 * **本物の `query()` を呼ばずに写しを検査できるように**、`startSdkDriver` の外に出して公開して
 * ある（{@link buildQuerySeedOptions} と同じ理由）。
 */
export function toContextUsage(value: unknown): ContextUsageReport {
  const parsed = sdkContextUsageSchema.safeParse(value)
  if (!parsed.success) {
    return UNAVAILABLE_CONTEXT_USAGE
  }

  const usage = parsed.data
  return {
    kind: "ready",
    usage: {
      model: usage.model,
      totalTokens: usage.totalTokens,
      maxTokens: usage.rawMaxTokens,
      percentage: usage.percentage,
      categories: usage.categories,
      mcpTools: usage.mcpTools.map((mcpTool) => ({
        name: mcpTool.name,
        source: mcpTool.serverName,
        tokens: mcpTool.tokens,
      })),
      memoryFiles: usage.memoryFiles.map((memoryFile) => ({
        name: memoryFile.path,
        source: memoryFile.type,
        tokens: memoryFile.tokens,
      })),
      skills: usage.skills?.skillFrontmatter ?? [],
    },
  }
}

/**
 * 届いたメッセージを内部イベントに変えて流し続ける。**反復を包む `try`/`catch` はここだけ**で、
 * 反復が終わる・落ちるのどちらもセッションの終わりとして扱う。
 */
async function relayMessages(
  session: AsyncIterable<unknown>,
  options: SessionDriverOptions,
): Promise<void> {
  // セッションIDは `session-info`（ターンのたびに届く）から取り、ターンが終わるたびに
  // 印を付け直す（{@link SESSION_TAG_DELAY_MS}）。
  let sessionId: string | undefined = undefined
  try {
    for await (const message of session) {
      for (const event of toSessionEvents(message, toExpressionNames(options.expressions))) {
        if (event.kind === "session-info") {
          sessionId = event.sessionId
        }
        if (event.kind === "turn-finished") {
          // **1ターンに書けるのは1行**（docs/design.md 7.1）。ターンの区切りを知っているのは
          // ここだけなので、終わるたびに次の1行を受け付けさせる。
          if (options.mode.kind === "chat") {
            options.mode.personaMemory.finishTurn()
          }
          if (sessionId !== undefined) {
            scheduleMarkSession(sessionId, options)
          }
        }
        if (event.kind === "conversation-cleared") {
          // `/clear` を見た合図。写しの印を「未渡し」に戻す——印はターンが終わるたびに
          // そのときのセッションIDへ付け直されるので、`/clear` のあと1ターン回すと空のほうが
          // 印を持つ（`docs/requirements.md` 4.9「印はターンが終わるたびに…」）。ここで戻さないと
          // 次に起こしたとき記憶が二度と戻らない。
          if (options.mode.kind === "chat") {
            options.mode.chatSummary.markUndelivered()
          }
        }
        options.onEvent(event)
      }
    }
    options.onEvent({ kind: "session-ended", reason: "セッションが終了した" })
  } catch (error) {
    options.onEvent({ kind: "session-ended", reason: describeError(error) })
  }
}

/**
 * ターンの終わりに tsukumo の印を付け直す予約をする（次に起こしたときに自分のセッションを
 * 見分けるため。docs/requirements.md 4.8「鍵」）。本体側の書き込みと重ならないように
 * {@link SESSION_TAG_DELAY_MS} だけ待つ。
 *
 * 待っている間に tsukumo が終わるなら印はどのみち要らないので、タイマーでプロセスを
 * 引き延ばさない（`unref`）。
 */
function scheduleMarkSession(sessionId: string, options: SessionDriverOptions): void {
  setTimeout(() => {
    void markSession(sessionId, options)
  }, SESSION_TAG_DELAY_MS).unref()
}

/**
 * セッションに tsukumo の印を付ける。**失敗しても続行する** — 付かなかったときに起きるのは
 * 「次回は新規から始まる」ことだけで、いま動いているセッションには影響しない
 * （docs/coding-standards.md「エラーハンドリング」）。
 */
async function markSession(sessionId: string, options: SessionDriverOptions): Promise<void> {
  try {
    await tagSession(sessionId, options.tag, { dir: options.cwd })
  } catch {
    // 印が付かないだけなので、何も流さずに諦める。
  }
}

/**
 * グローバルの出力スタイル（`~/.claude/settings.json` の `outputStyle`）をこのセッションの中だけ
 * 中立に戻す。**そうしないと人格が二重に効く**（パックの `persona.md` と、全プロジェクトに効く
 * 出力スタイルが重なる。実測: 応答が両方の人格を名乗った。docs/requirements.md 4.4）。
 *
 * 触るのは**セッション限りのフラグ層だけ**で、設定ファイルは書き換えない（`updateSettings` の
 * ほうはファイルを書くので使わない）。**失敗しても続行する** — 人格が二重になるだけで、
 * セッション自体は動く（docs/coding-standards.md「エラーハンドリング」）。
 */
async function applyNeutralOutputStyle(session: {
  readonly applyFlagSettings: (settings: { readonly outputStyle: string }) => Promise<void>
}): Promise<void> {
  try {
    await session.applyFlagSettings({ outputStyle: "default" })
  } catch {
    // 中立に戻せなかっただけなので、何も流さずに諦める。
  }
}

/**
 * コマンドの説明を1回だけ取りに行く。`init` の `slash_commands` は名前だけなので、説明は
 * この制御リクエストから受け取る（組み込みコマンドの分も返る）。
 * 以降セッション中に増減したときは `commands_changed` が押してくる（src/server/core/sdk-message.ts）。
 *
 * **取れなくてもセッションは続ける**（説明が無いまま名前だけの補完に戻るだけ。
 * docs/coding-standards.md「エラーハンドリング」の「動作中の一時的な失敗」）。
 */
async function relayCommandDescriptions(
  session: { readonly supportedCommands: () => Promise<unknown> },
  options: SessionDriverOptions,
): Promise<void> {
  try {
    const descriptions = toCommandDescriptions(await session.supportedCommands())
    if (descriptions.length > 0) {
      options.onEvent({ kind: "command-descriptions", descriptions })
    }
  } catch {
    // 説明が付かないだけなので、何も流さずに諦める。
  }
}

/**
 * プラン（`docs/glossary.md`「プラン」）を1回だけ取りに行く。`accountInfo()` は `email` /
 * `organization` も返すが、**駆動の外へ出すのは `toPlan` が取り出した `subscriptionType` だけ**
 * （`toPlan` の戻り値しか触らないので、他のフィールドに触れる経路が無い）。
 *
 * **名前は Claude Code の控えを先に見て決める**（`src/server/core/plan.ts`。SDK の
 * `subscriptionType` は契約の段と合わないことがあり、控えのほうが段と枠を別々に持つ）。
 * 控えから決まらなければ SDK の値をそのまま出す。
 *
 * **取れなくてもセッションは続ける**（API キーや Bedrock のときは元々この値が無い。
 * docs/coding-standards.md「エラーハンドリング」の「動作中の一時的な失敗」。
 * {@link relayCommandDescriptions} と同じ形）。
 */
async function relayPlan(
  session: { readonly accountInfo: () => Promise<unknown> },
  options: SessionDriverOptions,
  readTier: () => ClaudeAccountTier = readClaudeAccountTier,
): Promise<void> {
  try {
    const plan = planName(readTier(), toPlan(await session.accountInfo()))
    if (plan !== undefined) {
      options.onEvent({ kind: "plan", plan })
    }
  } catch {
    // プランが取れないだけなので、何も流さずに諦める。
  }
}

/**
 * 許可要求と質問を答え待ちの列へ回す。**`canUseTool` の戻り値の型（`PermissionResult`）に
 * 合わせるのはここだけ**で、列の側は SDK を知らない（構造は一致している）。
 */
function askForAnswer(
  queue: PendingAnswerQueue,
  id: string,
  toolName: string,
  input: Readonly<Record<string, unknown>>,
  signal: AbortSignal,
): Promise<PermissionResult> {
  return queue.ask({ id, toolName, input, signal })
}

/**
 * プロセス内の MCP サーバ。**戻り値は既定が "ok" だけ**で、tsukumo の内部の状態や画面の事情が
 * モデルへ戻る経路を作らない（docs/architecture.md「セリフはテキストの規約ではなく、ツール
 * 呼び出しで受け取る」・docs/design.md 7.1）。**例外は `recall` の1つ**で、返すのは**そのセッションが
 * 自分で読める外の事実**（自分の過去の雑談）だけ。
 *
 * 常に載るのは `speak` の1つで、**`remember` / `forget` / `keep` / `index` / `recall` は
 * 雑談モードのときだけ**（`mode` が `chat` のときだけ）載る。仕事のときに出すと、作業の文脈が
 * 人格に入り込む経路（7.1）や、仕事の会話をアーカイブに残す経路になる。
 *
 * セリフそのものは、この handler ではなく `assistant` メッセージの変換から取り出す
 * （src/server/core/sdk-message.ts）。受け取り口を1つにしておくと、イベントの流れが1本で済む。
 */
function tsukumoServer(expressions: readonly ExpressionChoice[], mode: SessionMode) {
  return createSdkMcpServer({
    name: TSUKUMO_MCP_SERVER_NAME,
    version: "0.0.0",
    tools: [
      tool(
        SPEAK_TOOL_NAME,
        SPEAK_TOOL_DESCRIPTION,
        {
          text: z.string().describe("セリフ。1〜2文の短い一言"),
          expression: z
            .enum(speakExpressionEnum(expressions))
            .describe(expressionGuide(expressions)),
        },
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      ),
      ...(mode.kind === "chat"
        ? [
            rememberTool(mode.personaMemory),
            forgetTool(mode.personaMemory),
            keepTool(mode.chatKeep),
            indexTool(mode.chatRecall),
            recallTool(mode.chatRecall),
          ]
        : []),
    ],
  })
}

/**
 * 覚えたことを書き足すツール。**上限に当たった回も "ok" を返す**（受け付けたかどうかを
 * モデルへ戻さない。docs/design.md 7.1）。どこにどう書くかは
 * src/server/adapter/persona-memory.ts の仕事。
 */
function rememberTool(memory: PersonaMemory) {
  return tool(
    REMEMBER_TOOL_NAME,
    REMEMBER_TOOL_DESCRIPTION,
    { line: z.string().describe("覚えること。キャラクター自身についての1行（120文字まで）") },
    async ({ line }) => {
      memory.remember(line)
      return { content: [{ type: "text" as const, text: "ok" }] }
    },
  )
}

/**
 * 覚えた1行を忘れるツール。**一致する行が無かった回も "ok" を返す**（消せたかどうかを
 * モデルへ戻さない。docs/design.md 7.1）。どの行と突き合わせるかは
 * src/server/adapter/persona-memory.ts の仕事。
 */
function forgetTool(memory: PersonaMemory) {
  return tool(
    FORGET_TOOL_NAME,
    FORGET_TOOL_DESCRIPTION,
    { line: z.string().describe("忘れること。「覚えたこと」に並んでいる1行の文面そのまま") },
    async ({ line }) => {
      memory.forget(line)
      return { content: [{ type: "text" as const, text: "ok" }] }
    },
  )
}

/**
 * いまのやり取りに「残す」旗を立てるツール。**引数を取らない** — 指せるのはそのターンの
 * 1往復だけで、**会話の文面がツールの引数を通って戻ってくる経路を作らない**
 * （docs/coding-standards.md「会話内容の扱い」）。**旗が立ったかどうかもモデルへ戻さない**
 * （返すのは "ok" だけ。docs/design.md 7章）。どこにどう書くかは
 * src/server/adapter/chat-archive.ts の仕事。
 */
function keepTool(chatKeep: ChatKeep) {
  return tool(KEEP_TOOL_NAME, KEEP_TOOL_DESCRIPTION, {}, async () => {
    chatKeep.keep()
    return { content: [{ type: "text" as const, text: "ok" }] }
  })
}

/**
 * その日の見出しを索引に1行残すツール。**上限に当たった回も "ok" を返す**（受け付けたかどうかを
 * モデルへ戻さない。`remember` と同じ）。どこにどう書くかは
 * src/server/adapter/chat-archive.ts の仕事。
 */
function indexTool(chatRecall: ChatRecall) {
  return tool(
    INDEX_TOOL_NAME,
    INDEX_TOOL_DESCRIPTION,
    { line: z.string().describe("今日の見出し。あとで探すための1行（120文字まで）") },
    async ({ line }) => {
      chatRecall.index(line)
      return { content: [{ type: "text" as const, text: "ok" }] }
    },
  )
}

/**
 * 索引を引いて古い雑談を思い出すツール。**戻り値が "ok" でない唯一のツール**で、返すのは
 * **その会話自身の過去**だけ（tsukumo の状態も画面の事情も載せない。
 * docs/requirements.md 4.9「古い雑談は索引を引いて思い出す」）。**文面に組み立てるのは core**
 * （src/server/core/chat-memory-prompt.ts）で、**どの日を開くかを決めるのは
 * src/server/adapter/chat-archive.ts**。
 */
function recallTool(chatRecall: ChatRecall) {
  return tool(
    RECALL_TOOL_NAME,
    RECALL_TOOL_DESCRIPTION,
    { keyword: z.string().describe("引く言葉。語を空白で区切ると、どれかに当たった日が返る") },
    async ({ keyword }) => ({
      content: [{ type: "text" as const, text: chatRecallText(chatRecall.recall(keyword)) }],
    }),
  )
}

/**
 * zod の `enum` に渡す表情名。**空にならないこと**が型の要求なので、`default` を必ず先頭に置く
 * （`expressionChoices` も `default` を必ず含むが、ここで型としても保証しておく）。
 */
function speakExpressionEnum(
  expressions: readonly ExpressionChoice[],
): [Expression, ...Expression[]] {
  return ["default", ...toExpressionNames(expressions).filter((name) => name !== "default")]
}

/**
 * 表情名とラベルの対応。モデルが名前だけで意味を取れるように説明へ入れる。
 * **ラベルはキャラクターパックの定義から来る**（コードに持たない。docs/design.md 7章）。
 */
function expressionGuide(expressions: readonly ExpressionChoice[]): string {
  const guide = speakExpressionEnum(expressions)
    .map((name) => `${name}（${labelOf(expressions, name)}）`)
    .join(" / ")
  return `表情。${guide}`
}

function labelOf(expressions: readonly ExpressionChoice[], name: Expression): string {
  return expressions.find((choice) => choice.name === name)?.label ?? name
}

/**
 * 送る依頼1件。**駆動が持つ原寸の画像はここまでで、`stream()` が渡したあとは持たない**
 * （拡大表示のために残すのは棚 = `src/server/core/prompt-image-shelf.ts` の側）。
 */
type Prompt = {
  readonly text: string
  readonly images: readonly PromptContentBlock[]
}

/**
 * user メッセージの内容ブロック1つ。**`MessageParam` の型をそのまま使う**（自前の型を作らない。
 * `docs/requirements.md` 4.10 の裏取り）。
 */
type PromptContentBlock = Extract<SDKUserMessage["message"]["content"], readonly unknown[]>[number]

/**
 * ストリーミング入力。`query` には「まだ終わらない」非同期イテレータを渡し、依頼が届くたびに
 * user メッセージを1つ流す（docs/requirements.md 4.1「同じ `query` への追加入力」）。
 *
 * **画像を添えられるのはストリーミング入力だけ**（単発入力は受け付けない。
 * `docs/requirements.md` 4.10）。添えたときは `content` を配列にし、画像のブロックを先に、
 * 文面を後ろに置く。
 */
function createPromptStream(): {
  readonly push: (prompt: Prompt) => void
  readonly end: () => void
  readonly stream: () => AsyncIterable<SDKUserMessage>
} {
  const waiting: Prompt[] = []
  let wake: (() => void) | undefined = undefined
  let closed = false

  const notify = (): void => {
    const resume = wake
    wake = undefined
    resume?.()
  }

  return {
    push: (prompt) => {
      waiting.push(prompt)
      notify()
    },
    end: () => {
      closed = true
      notify()
    },
    stream: async function* () {
      while (true) {
        const prompt = waiting.shift()
        if (prompt === undefined) {
          if (closed) {
            return
          }
          await new Promise<void>((resolve) => {
            wake = resolve
          })
          continue
        }

        yield {
          type: "user",
          message: { role: "user", content: promptContent(prompt) },
          parent_tool_use_id: null,
          session_id: "",
        }
      }
    },
  }
}

/** 依頼1件の `content`。画像が無ければ文字列のまま（いままでと同じ形）。 */
function promptContent(prompt: Prompt): SDKUserMessage["message"]["content"] {
  return prompt.images.length === 0
    ? prompt.text
    : [...prompt.images, { type: "text", text: prompt.text }]
}

/**
 * 依頼に添えられた画像1枚を、モデルへ渡す内容ブロックにする。**渡せない形・大きすぎるものは
 * 空**（その1枚を諦めて依頼そのものは送る。docs/coding-standards.md「エラーハンドリング」）。
 *
 * 形は境界（`src/shared/command.ts` の zod）で見てあるので、ここは同じ関数でほどくだけ
 * （立ち絵を書き込む側が `parsePortraitImage` でほどくのと同じ扱い）。
 */
function toImageBlocks(image: PromptImage): readonly PromptContentBlock[] {
  const source = parsePromptImage(image.full)
  return source === undefined
    ? []
    : [
        {
          type: "image",
          source: { type: "base64", media_type: source.mediaType, data: source.base64 },
        },
      ]
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "原因不明"
}
