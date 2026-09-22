// セッションの状態と、イベント1件を畳み込む純粋関数。**サーバ（core）とブラウザ（browser）の
// 両方が同じものを回す**ので、shared に置く（docs/design.md 4.2）。
//
// **`node:` にも `document` にも触らない。** 状態を持つのは呼び出し側
// （core の session-manager と、ブラウザ側の <App>）。
//
// 時刻は畳み込みの中で時計を読まず、イベントに打たれた `at`（エポックミリ秒）を受け取る
// （両側の状態が同じになるように、時刻はイベントの発生側が決める。docs/design.md 4.1）。
//
// **姿から導くだけのものはここに置かない**（メインビューに出す形は `main-view.ts`、
// 入力欄の `/` 補完の候補は `command-suggestion.ts`）。ここが持つのは「状態そのもの」と
// 「イベント1件でどう変わるか」だけ。

import { type CharacterInfo, type CharacterPackChoice } from "./character.ts"
import { commandCandidates } from "./command-suggestion.ts"
import { isModelAlias } from "./command.ts"
import { type Expression } from "./expression.ts"
import { type PendingAsk } from "./pending-ask.ts"
import { type Question, type QuestionAnswer } from "./question.ts"
import { type SessionChoice } from "./session-choice.ts"
import { type CommandDescription, type SessionEvent } from "./session-event.ts"
import { type TaskSummaryItem } from "./task-summary.ts"
import { type Workspace } from "./workspace.ts"

/**
 * サイドバーの「終わったもの」に残す、直近に使い終えたツールの数。並びは自前でスクロールするが、
 * 常駐プロセスがセッションを通して持ち続けるので無限には増やさない。
 */
const MAX_RECENT_FINISHED_TOOLS = 50

/**
 * メインビューに残す記録の窓（直近何ターンぶんを持ち続けるか）。**過去のやり取りは
 * `buildMainBody` 側のタブ（`MAX_MAIN_VIEW_TURNS`）でさらに絞られる**が、常駐プロセスが
 * セッションを通して動き続ける以上、ここで持つ記録自体も無限に増やさない。
 *
 * **モードごとに値が違う**（`docs/requirements.md` 4.9）。雑談の1ターンは
 * セリフ1〜2件で軽く、仕事と同じ20往復では会話として短すぎるため、雑談だけ100まで持つ。
 */
const MAX_SESSION_STATE_TURNS = {
  work: 20,
  chat: 100,
} satisfies Record<"work" | "chat", number>

/**
 * サイドバーの「いま何をしているか」1件分。**引数はここまで持ち込む**（要約は表示側
 * `src/browser/lib/tool-summary.ts` の `summarizeToolInput` の仕事。`docs/coding-standards.md`
 * 「会話内容の扱い」のとおり、要約に断片が入りうることは呼び出し側が承知した上で使う）。
 */
export type ToolActivity = {
  readonly toolUseId: string
  readonly name: string
  readonly input: unknown
  /** サブエージェントの中で動いたか（`tool-started` の `parentToolUseId` があるか）。 */
  readonly nested: boolean
  /**
   * 失敗して終わったときの出力。成功したときと実行中は undefined
   * （**「失敗した」という印そのもの**を兼ねる）。**ツールの実行はレポートに出さない**
   * （docs/requirements.md 4.2）ので、エラーの内容を読める場所はここから開くサイドバーの
   * 並びだけになる。
   */
  readonly failureOutput: string | undefined
}

/**
 * セッションの中で起きたことを起きた順に並べたもの。メインビューに出す形（`MainViewEntry`。
 * `shared/main-view.ts`）とほぼ同じだが、
 * **ツールは `toolUseId` を持つ**（あとから届く結果を突き合わせるため。表示には使わない）。
 *
 * **`speech` はここにしか無い**（`MainViewEntry` には対応する種類が無く、
 * `mainViewEntries` が落とす）。セリフが出るのは吹き出しだけで、レポートには混ぜない
 * （docs/requirements.md 4.2）。記録に残すのは、過去のターンの吹き出しを引き直せるように
 * するため（`shared/turn-speech.ts` の `turnSpeeches`）。
 */
export type SessionRecord =
  /**
   * 利用者の依頼。`images` は添えた画像の**控え**だけ（`docs/requirements.md` 4.10）。
   * **原寸は記録に入らない**ので、ここから拡大して見る道は無い。
   *
   * `turnId` は**そのターンの通し番号**（{@link SessionState.nextTurnId}）。窓から古い記録が
   * 落ちても番号は振り直されないので、**同じターンはセッションが続くかぎり同じ番号**になる。
   */
  | {
      readonly kind: "request"
      readonly turnId: number
      readonly text: string
      readonly images: readonly string[]
    }
  | { readonly kind: "detail"; readonly markdown: string }
  /**
   * 答え終わった質問（`question-answered`）。**積むのは答えが確定した1回だけ**で、あとから
   * 書き換えない（docs/requirements.md 4.2「許可と質問」）。形は
   * `MainViewEntry` の `question` と同じなので、`mainViewEntries` はそのまま通す
   * （`shared/main-view.ts`）。
   */
  | {
      readonly kind: "question"
      readonly questions: readonly Question[]
      readonly answers: readonly QuestionAnswer[]
    }
  | { readonly kind: "speech"; readonly text: string; readonly expression: Expression }
  | {
      readonly kind: "tool"
      readonly toolUseId: string
      readonly name: string
      readonly input: unknown
      readonly nested: boolean
      readonly result: { readonly content: string; readonly isError: boolean } | undefined
    }
  /**
   * 圧縮の区切り（`compact-boundary`。docs/glossary.md）。**中身を持たない**（画面に出すのは
   * 細い線1本だけで、文言も数値も添えない）。`trimToRecentTurns` の数え方（`request` の数）は
   * 変えない — 他の記録と同じく、窓から外れれば一緒に落ちる。
   */
  | { readonly kind: "compact-boundary" }

/**
 * セッションの今の姿。**イベントを1件ずつ畳んで作る**ので、ここに無い情報は画面にも出ない。
 *
 * `partialUtterance` は書きかけの本文で、完成した本文（`utterance`）が来たら空に戻る。
 * こうしておくと、断片と完成メッセージの**両方が届いても二重に積まれない**
 * （docs/requirements.md 4.2「書きかけの本文がそのまま流れていき、ターンが終わった瞬間に
 * 整形し直す」）。
 */
export type SessionState = {
  /**
   * 吹き出しに並べて出す、今のターンのセリフ（古い→新しいの順。**件数の上限は無い**、
   * ターンの境目だけで区切る）。**`request` の時点で空にする**（プレースホルダーに切り替わり、
   * 次のターンに移ったことが画面から分かる。docs/requirements.md 4.2。
   * {@link applySessionEvent} の `request` を参照）。まだ一度も `speak` が呼ばれていない・
   * そのターンでまだ呼ばれていなければ空配列。
   */
  readonly speeches: readonly string[]
  /** 直近のセリフ（`speak`）に添えられた表情。**表情の源はこれだけ**（自動の上書きは無い）。 */
  readonly speechExpression: Expression
  /**
   * 今のターンで `speak` が呼ばれたか（前のターンのセリフを捨てて今のターンだけの並びにするか、
   * 今のターンに積み重ねるかの判定に使う。`speech` イベントを参照）。`request` で false に戻る。
   */
  readonly speechCalledInTurn: boolean
  /** 確定した記録。書きかけの本文は含まない。 */
  readonly records: readonly SessionRecord[]
  /** 書きかけの本文。完成した本文が来たら空に戻る。 */
  readonly partialUtterance: string
  /** 実行中のツール（`tool_use` は届いたが結果がまだ来ていないもの）。新しい順。 */
  readonly runningTools: readonly ToolActivity[]
  /**
   * 直近に使い終えたツール。新しい順、最大 {@link MAX_RECENT_FINISHED_TOOLS} 件
   * （サイドバーの「いま何をしているか」の並びに、実行中の下へ積む）。
   */
  readonly finishedTools: readonly ToolActivity[]
  /** 答え待ちの列（許可プロンプトと質問）。 */
  readonly pending: readonly PendingAsk[]
  readonly sessionId: string | undefined
  readonly model: string | undefined
  readonly permissionMode: string | undefined
  /**
   * 入力欄の `/` 補完に出せるコマンド名（`init` のたびに上書きされる）。**端末専用
   * （`terminal_slash_commands`）は除いてある**（`commandCandidates`。
   * docs/requirements.md 4.2「入力欄」）。**`init`（`session-info`）は最初の依頼を送るまで
   * 届かない**（実測。SDK の `system`/`init` はターンのたびに届く仕組みで、
   * セッション開始直後には来ない）ので、それまでは空配列のまま。その間の名前の出どころは
   * `commandSuggestions`（`shared/command-suggestion.ts`）が `commandDescriptions` 側に振る。
   */
  readonly slashCommands: readonly string[]
  /**
   * SDK から届いたコマンドの説明（名前と説明の組）。**端末専用のものも混ざったままの生の一覧**。
   * `supportedCommands()`（駆動側が起動直後に呼ぶ）はセッション開始後すぐに届く
   * （実測。`init` を待たない）ので、`slashCommands` が空の間は `commandSuggestions` が
   * ここを名前の出どころとして使う（端末専用の除外はまだ効かせられない。`init` が届き
   * `slashCommands` が埋まった時点で、除外込みの一覧に戻る）。説明がまだ届いていなければ
   * 空配列。
   */
  readonly commandDescriptions: readonly CommandDescription[]
  /** セッションが終わった理由。動いている間は undefined。 */
  readonly endedReason: string | undefined
  /**
   * ターンが進行中か。`request` で始まり、`turn-finished` / `session-ended` で終わる
   * （入力欄が送信と中断を切り替える判断材料。docs/requirements.md 4.7）。
   */
  readonly turnInProgress: boolean
  /**
   * 次に始まるターンに振る通し番号。**ターンが始まるたびに1つ増え、記録が窓から落ちても
   * 戻らない**ので、**同じターンはセッションが続くかぎり同じ番号**になる。
   *
   * 番号を位置（何番目のターンか）で決めると、窓（{@link MAX_SESSION_STATE_TURNS}）が
   * いっぱいになったあと**いちばん新しいターンの番号が止まる**。描く側はその番号を
   * React の `key` に使っているので、止まると別のターンが同じ部品として使い回され、
   * **書き上げる演出がマウント時にしか走らないために二度と起動しなくなる**（実測）。
   */
  readonly nextTurnId: number
  /**
   * develop/tasks.json の一覧（サイドバーのタスク一覧）。`tasks-changed` が届くまでは undefined
   * （読めない・まだ読んでいないのどちらも同じ「不明」表示になる。docs/design.md 4.1）。
   */
  readonly tasks: readonly TaskSummaryItem[] | undefined
  /**
   * キャラビューが立ち絵を取りに行く先（`character-changed` が届くまでは undefined）。
   * **素材そのものは持たない**（`portraits` の値は `/character/<file>` の URL。docs/design.md
   * 4.2）。
   */
  readonly character: CharacterInfo | undefined
  /**
   * 切り替えられるキャラクターパックの一覧（サイドバーの `<select>`。docs/design.md 7章）。
   * `character-changed` と一緒に届く。**まだ届いていないときは空**で、そのときは選択肢を
   * 出せないので `<select>` ごと出さない。
   */
  readonly characterPacks: readonly CharacterPackChoice[]
  /**
   * 切り替え先として選べるセッションの一覧（サイドバーの `<select>`。
   * `docs/requirements.md` 4.8）。`sessions-changed` と一緒に届き、**起こしたときの姿のまま
   * 変わらない**（ターンのたびには引き直さない）。まだ届いていない・印の付いたセッションが
   * 1つも無いときは空で、そのときは選択肢を出せないので `<select>` ごと出さない。
   */
  readonly sessions: readonly SessionChoice[]
  /**
   * 今のターンが始まった時刻（`request` の `at`）。表す意味は「依頼を送ってから、そのターンが
   * 終わるまでの時間」の起点で、次の `request` まではそのまま持ち続ける（入力欄の経過時間表示
   * `src/browser/features/dispatch/turn-status.tsx` が使う。docs/design.md 4.2）。まだ一度も依頼が無ければ
   * undefined。
   */
  readonly turnStartedAt: number | undefined
  /**
   * 今のターンが終わった時刻（`turn-finished` / `session-ended` の `at`）。**`request` で
   * undefined に戻る**（次のターンが始まったら経過時間を0から数え直す）。終わっていない間は
   * undefined。
   */
  readonly turnFinishedAt: number | undefined
  /**
   * 直近でツールが失敗した時刻（`tool-finished` の `isError` が true のときの `at`）。
   * **立ち絵の「失敗でびくっ」の判定にだけ使う**（`shared/portrait-motion.ts` の
   * `resolvePortraitMotion`）。次のターンが始まっても戻さない（時間の窓が過ぎれば
   * `resolvePortraitMotion` 側で自然に「今は失敗直後ではない」に戻るため、`turnFinishedAt`
   * と違って `request` での巻き戻しは要らない）。まだ一度も失敗していなければ undefined。
   */
  readonly lastToolFailureAt: number | undefined
  /**
   * いまどこで動いているか（`docs/architecture.md`「worktree でセッションを分ける」）。
   * `workspace` が届くまでは undefined（サイドバーは何も出さない）。**プロセスが動いている間は
   * 中身が変わらない**が、起こし直すと状態が初期値へ戻るので `character` と同じく流し直される。
   */
  readonly workspace: Workspace | undefined
  /**
   * 雑談モードに入っているか（`docs/requirements.md` 4.9）。入っている間はレポートを出さず、
   * メインビューが立ち絵と会話のログになる（`docs/design.md` 13.7）。
   *
   * **源は `chat-mode-changed` だけ。** 切り替えは駆動の起こし直しなので、起こし直したあとに
   * サーバから流れ直す（起こし直しで状態が初期値へ戻るため）。
   */
  readonly chatMode: boolean
}

export const INITIAL_SESSION_STATE: SessionState = {
  speeches: [],
  speechExpression: "default",
  speechCalledInTurn: false,
  records: [],
  partialUtterance: "",
  runningTools: [],
  finishedTools: [],
  pending: [],
  sessionId: undefined,
  model: undefined,
  permissionMode: undefined,
  slashCommands: [],
  commandDescriptions: [],
  endedReason: undefined,
  turnInProgress: false,
  nextTurnId: 0,
  tasks: undefined,
  character: undefined,
  characterPacks: [],
  sessions: [],
  turnStartedAt: undefined,
  turnFinishedAt: undefined,
  lastToolFailureAt: undefined,
  workspace: undefined,
  chatMode: false,
}

/**
 * イベント1件を畳み込んで次の姿を返す。知らない状況でも必ず姿を返す（落ちない）。
 *
 * `at` はイベントが起きた時刻（`StampedEvent.at`）。ターンの起点・終点と、ツールが失敗した
 * 時刻を記録するのに使う。時計をここで読まないのは、この関数を純粋関数のまま保ち、
 * **サーバとブラウザで同じ結果になる**ようにするため（docs/design.md 4.1）。
 */
export function applySessionEvent(
  state: SessionState,
  event: SessionEvent,
  at: number,
): SessionState {
  switch (event.kind) {
    case "session-info":
      return {
        ...state,
        sessionId: event.sessionId,
        model: event.model,
        permissionMode: event.permissionMode,
        slashCommands: commandCandidates(event.slashCommands, event.terminalSlashCommands),
      }
    case "workspace":
      return { ...state, workspace: event.workspace }
    case "command-descriptions":
      return { ...state, commandDescriptions: event.descriptions }
    case "model-changed":
      // **`MODEL_ALIASES` に完全一致するときだけ先回りで更新する**（`/model best` のような
      // tsukumo が知らない値では状態を変えない。次の依頼の `init` が正しい値で上書きするので、
      // ここで間違った値に倒す必要は無い）。
      return isModelAlias(event.model) ? { ...state, model: event.model } : state
    case "request":
      return {
        ...beginTurn(state, at),
        records: trimToRecentTurns(
          [
            ...state.records,
            {
              kind: "request",
              turnId: state.nextTurnId,
              text: event.text,
              images: event.images,
            },
          ],
          state.chatMode,
        ),
      }
    case "turn-started":
      // **記録を持たないターンの始まり**（キャラクターから話しかけてもらう。docs/design.md 13.7）。
      // 積むものが無いだけで、吹き出し・表情・進行中の印は `request` と同じに動かす。
      return beginTurn(state, at)
    case "partial-utterance":
      return { ...state, partialUtterance: state.partialUtterance + event.text }
    case "utterance":
      return settleUtterance({ ...state, partialUtterance: event.text })
    case "speech":
      return {
        ...state,
        // 記録は積みっぱなし（`speeches` と違ってターンの境目で捨てない）。過去のターンの
        // 吹き出しと表情をここから引き直す（`shared/turn-speech.ts`）。
        records: [
          ...state.records,
          { kind: "speech", text: event.text, expression: event.expression },
        ],
        // 前のターンのセリフが残っているなら、ここで捨てて今のターンだけの並びにする
        // （docs/requirements.md 4.2「次の speak が来た時点でそのターンのものだけになる」）。
        speeches: [...(state.speechCalledInTurn ? state.speeches : []), event.text],
        speechExpression: event.expression,
        speechCalledInTurn: true,
      }
    case "tool-started": {
      const nested = event.parentToolUseId !== undefined
      return {
        ...state,
        records: [
          ...state.records,
          {
            kind: "tool",
            toolUseId: event.toolUseId,
            name: event.name,
            input: event.input,
            nested,
            result: undefined,
          },
        ],
        runningTools: [
          {
            toolUseId: event.toolUseId,
            name: event.name,
            input: event.input,
            nested,
            failureOutput: undefined,
          },
          ...state.runningTools,
        ],
      }
    }
    case "tool-finished":
      return finishTool(state, event.toolUseId, event.content, event.isError, at)
    case "pending-changed":
      return { ...state, pending: event.pending }
    case "question-answered":
      // 答えが確定した1回だけ積む（未回答の質問は記録に残さない）。`request` と違って
      // 窓の切り詰め（`trimToRecentTurns`）は要らない — 質問はやり取りの境目にならないので、
      // 次の `request` が来たときに一緒に古いぶんが落ちる。
      return {
        ...state,
        records: [
          ...state.records,
          { kind: "question", questions: event.questions, answers: event.answers },
        ],
      }
    // 書きかけのまま終わったターン（中断など）の本文を捨てず、確定した記録に移す。
    case "turn-finished":
      return { ...settleUtterance(state), turnInProgress: false, turnFinishedAt: at }
    case "session-ended":
      return {
        ...settleUtterance(state),
        endedReason: event.reason,
        runningTools: [],
        turnInProgress: false,
        turnFinishedAt: at,
      }
    case "conversation-cleared":
      // `/clear` で会話が消えたら、**画面に残っている前の会話も消す**。
      // 消すのは吹き出しとメインビューが読む値だけで、キャラクター・セッション情報・
      // 答え待ちの列は残す（`pending` の正典は core の待ち行列なので、状態側で空にすると
      // 実際の待ちと食い違う）。**普通の `request` と違うのは `records` も空にする点**
      // （普通のターンは過去のターンを遡れるように records を残す。`/clear` は会話そのものを
      // 消す操作なので records も落とす）。
      return {
        ...state,
        speeches: [],
        speechExpression: INITIAL_SESSION_STATE.speechExpression,
        speechCalledInTurn: false,
        records: [],
        partialUtterance: "",
      }
    case "tasks-changed":
      return { ...state, tasks: event.tasks }
    case "sessions-changed":
      // **`sessionId` もここで決まる**（`session-info` は最初の依頼まで届かないので、それまで
      // 「いまどのセッションに居るか」を言えるのはこの経路だけ）。新規に起こしたときは
      // undefined のままで、`init` が届いたら本物のIDで上書きされる。
      return {
        ...state,
        sessions: event.sessions,
        sessionId: event.current ?? state.sessionId,
      }
    case "character-changed":
      return {
        ...state,
        character: {
          pack: event.pack,
          name: event.name,
          accent: event.accent,
          expressions: event.expressions,
          portraits: event.portraits,
          mini: event.mini,
          outfitAccents: event.outfitAccents,
          background: event.background,
          editable: event.editable,
        },
        characterPacks: event.packs,
      }
    case "token-usage":
    case "step-usage":
      // **画面に出すものが何も無い**（数の記録は `~/.tsukumo/token-usage/` へ書くだけで、
      // 書くかどうかを決めるのは `src/server/core/session-manager.ts`）。ここで畳むと
      // ブラウザ側にも同じ数を持たせることになるので、姿は変えない。
      return state
    case "chat-mode-changed":
      return { ...state, chatMode: event.chat }
    case "compact-boundary":
      return { ...state, records: [...state.records, { kind: "compact-boundary" }] }
  }
}

/**
 * ターンの始まりを畳む（記録は動かさない）。**`request` と「記録を持たないターンの始まり」
 * （`turn-started`）で共通**の部分で、積むものがあるかどうかだけが違う。
 */
function beginTurn(state: SessionState, at: number): SessionState {
  return {
    ...state,
    // 送信した時点で吹き出しを空にする（プレースホルダー「（まだ発話がありません）」に
    // 切り替わる。前のターンの一言が残ったままだと、次のターンに移ったことが画面から
    // 分からない。以前は前のターンの並びの最後の1件を残していたが、
    // それが「切り替わったのか分からない」の原因だった）。
    speeches: [],
    // 表情も既定へ戻す。次の `speak` が来るまではこのままで、ツールの実行状況では動かない
    // （表情の源は `speak` の1つだけ。docs/requirements.md 4.3）。
    speechExpression: INITIAL_SESSION_STATE.speechExpression,
    partialUtterance: "",
    turnInProgress: true,
    nextTurnId: state.nextTurnId + 1,
    speechCalledInTurn: false,
    turnStartedAt: at,
    turnFinishedAt: undefined,
  }
}

/**
 * 書きかけの本文を確定した記録に移す。空のときは何もしない（空の本文を積まない）。
 */
function settleUtterance(state: SessionState): SessionState {
  if (state.partialUtterance.trim() === "") {
    return { ...state, partialUtterance: "" }
  }

  const markdown = state.partialUtterance

  return {
    ...state,
    records:
      markdown.trim() === "" ? state.records : [...state.records, { kind: "detail", markdown }],
    partialUtterance: "",
  }
}

/**
 * ツール1件の結果を記録に合わせる。**対応する `tool_use` が見つからないときは何もしない**
 * （対応が取れない結果を作らない）。`isError` が true のときは `lastToolFailureAt` に `at` を
 * 打ち（立ち絵の「失敗でびくっ」の判定材料。`docs/design.md` 6.5）、出力を
 * {@link ToolActivity.failureOutput} に移す（サイドバーで開いて読むため）。
 */
function finishTool(
  state: SessionState,
  toolUseId: string,
  content: string,
  isError: boolean,
  at: number,
): SessionState {
  const index = state.records.findIndex(
    (record) => record.kind === "tool" && record.toolUseId === toolUseId,
  )
  const record = index === -1 ? undefined : state.records[index]
  if (record === undefined || record.kind !== "tool") {
    return state
  }

  const activity: ToolActivity = {
    toolUseId: record.toolUseId,
    name: record.name,
    input: record.input,
    nested: record.nested,
    failureOutput: isError ? content : undefined,
  }

  return {
    ...state,
    records: [
      ...state.records.slice(0, index),
      { ...record, result: { content, isError } },
      ...state.records.slice(index + 1),
    ],
    runningTools: state.runningTools.filter((running) => running.toolUseId !== toolUseId),
    finishedTools: [activity, ...state.finishedTools].slice(0, MAX_RECENT_FINISHED_TOOLS),
    lastToolFailureAt: isError ? at : state.lastToolFailureAt,
  }
}

/**
 * 直近何ターンぶんだけを残す。**ターンの境目は `request`** なので、古い `request` から数えて
 * 窓の外に出たものをまとめて落とす。窓の広さは `chatMode` で選ぶ
 * （{@link MAX_SESSION_STATE_TURNS}）。
 */
function trimToRecentTurns(
  records: readonly SessionRecord[],
  chatMode: boolean,
): readonly SessionRecord[] {
  const limit = chatMode ? MAX_SESSION_STATE_TURNS.chat : MAX_SESSION_STATE_TURNS.work
  const requestIndexes = records.reduce<readonly number[]>(
    (indexes, record, index) => (record.kind === "request" ? [...indexes, index] : indexes),
    [],
  )
  if (requestIndexes.length <= limit) {
    return records
  }

  const cutAt = requestIndexes[requestIndexes.length - limit]
  return cutAt === undefined ? records : records.slice(cutAt)
}
