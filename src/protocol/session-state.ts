// セッションの状態と、イベント1件を畳み込む純粋関数。**サーバ（core）とブラウザ（ui）の
// 両方が同じものを回す**ので、protocol に置く（docs/design.md 4.2）。
//
// **`node:` にも `document` にも触らない。** 状態を持つのは呼び出し側
// （core の session-manager と、ブラウザ側の <App>）。
//
// 時刻は畳み込みの中で `Date.now()` を呼ばず、イベントに打たれた `at` を受け取る
// （両側の状態が同じになるように、時刻はイベントの発生側が決める。docs/design.md 4.1）。

import { type CharacterInfo, type CharacterPackChoice } from "./character.ts"
import { type Expression, resolveExpression } from "./expression.ts"
import { type PendingAsk } from "./pending-ask.ts"
import { type Question } from "./question.ts"
import { type CommandDescription, type SessionEvent } from "./session-event.ts"
import { type TaskSummaryItem } from "./task-summary.ts"
import { splitUtterance } from "./utterance.ts"

/**
 * サイドバーの「終わったもの」に残す、直近に使い終えたツールの数。並びは自前でスクロールするが、
 * 常駐プロセスがセッションを通して持ち続けるので無限には増やさない。
 */
const MAX_RECENT_FINISHED_TOOLS = 50

/**
 * メインビューに残す記録の窓（直近何ターンぶんを持ち続けるか）。**過去のやり取りは
 * `buildMainBody` 側のタブ（`MAX_MAIN_VIEW_TURNS`）でさらに絞られる**が、常駐プロセスが
 * セッションを通して動き続ける以上、ここで持つ記録自体も無限に増やさない。
 */
const MAX_SESSION_STATE_TURNS = 20

/**
 * サイドバーの「いま何をしているか」1件分。**引数はここまで持ち込む**（要約は表示側
 * `src/presentation/view.ts` の `summarizeToolInput` の仕事。`docs/coding-standards.md`「会話内容の扱い」の
 * とおり、要約に断片が入りうることは呼び出し側が承知した上で使う）。
 */
export type ToolActivity = {
  readonly toolUseId: string
  readonly name: string
  readonly input: unknown
  /** サブエージェントの中で動いたか（`tool-started` の `parentToolUseId` があるか）。 */
  readonly nested: boolean
  /**
   * ツールが動き始めた時刻（呼び出し側が渡す現在時刻。`applySessionEvent` の `at`）。
   * 表情を「作業中」に切り替えるかどうかの判定（`resolveExpression`）にだけ使う。
   */
  readonly startedAt: number
}

/**
 * メインビューに時系列で流す1件分の記録。**利用者の依頼**（やり取りの境界）・ツールの実行・
 * 発話の詳細の3種類。**描く側（src/presentation/view.ts）が読むだけの形**で、ここが決めた結果を渡す
 * （{@link mainViewEntries}）。
 */
export type MainViewEntry =
  | { readonly kind: "request"; readonly text: string }
  // キャラクターからの質問（AskUserQuestion）。`answers` は選ばれた答えのラベル（未回答なら空）。
  | {
      readonly kind: "question"
      readonly questions: readonly Question[]
      readonly answers: readonly string[]
    }
  | {
      readonly kind: "tool"
      readonly name: string
      readonly input: unknown
      /** まだ結果が届いていない（作業中の）ツールは undefined になる。 */
      readonly result: { readonly content: string; readonly isError: boolean } | undefined
    }
  | { readonly kind: "detail"; readonly markdown: string }

/**
 * セッションの中で起きたことを起きた順に並べたもの。{@link MainViewEntry} とほぼ同じだが、
 * **ツールは `toolUseId` を持つ**（あとから届く結果を突き合わせるため。表示には使わない）。
 *
 * **`speech` はここにしか無い**（{@link MainViewEntry} には対応する種類が無く、
 * {@link mainViewEntries} が落とす）。セリフが出るのは吹き出しだけで、レポートには混ぜない
 * （docs/requirements.md 4.2）。記録に残すのは、過去のターンの吹き出しを引き直せるように
 * するため（`protocol/turn-speech.ts` の `turnSpeeches`）。
 */
export type SessionRecord =
  | { readonly kind: "request"; readonly text: string }
  | { readonly kind: "detail"; readonly markdown: string }
  | { readonly kind: "speech"; readonly text: string; readonly expression: Expression }
  | {
      readonly kind: "tool"
      readonly toolUseId: string
      readonly name: string
      readonly input: unknown
      readonly nested: boolean
      readonly startedAt: number
      readonly result: { readonly content: string; readonly isError: boolean } | undefined
    }

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
   * ターンの境目だけで区切る）。**セリフが1つも来なかったターンでも消さない**
   * （docs/requirements.md 4.2。`request` の時点では前のターンの並びの**最後の1件だけ**を残し、
   * 次の `speech` が来た時点でそのターンのものだけに置き換わる。{@link applySessionEvent} の
   * `request` / `speech` を参照）。まだ一度も `speak` が呼ばれていなければ空配列。
   */
  readonly speeches: readonly string[]
  /** 直近のセリフに添えられた表情。ツールの実行中は「作業中」が優先される。 */
  readonly speechExpression: Expression
  /**
   * 今のターンで `speak` が呼ばれたか（マーカー行の補助で拾ったセリフを、置き換えるか
   * 並べるかの判定に使う。{@link settleUtterance}）。`request` で false に戻る。
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
   * （`terminal_slash_commands`）は除いてある**（{@link commandCandidates}。
   * docs/requirements.md 4.2「入力欄」）。**`init`（`session-info`）は最初の依頼を送るまで
   * 届かない**（2026-09-12 実測。SDK の `system`/`init` はターンのたびに届く仕組みで、
   * セッション開始直後には来ない）ので、それまでは空配列のまま。その間の名前の出どころは
   * {@link commandSuggestions} が `commandDescriptions` 側に振る。
   */
  readonly slashCommands: readonly string[]
  /**
   * SDK から届いたコマンドの説明（名前と説明の組）。**端末専用のものも混ざったままの生の一覧**。
   * `supportedCommands()`（駆動側が起動直後に呼ぶ）はセッション開始後すぐに届く（2026-09-12
   * 実測。`init` を待たない）ので、`slashCommands` が空の間は {@link commandSuggestions} が
   * ここを名前の出どころとして使う（端末専用の除外はまだ効かせられない。`init` が届き
   * `slashCommands` が埋まった時点で、除外込みの一覧に戻る）。説明がまだ届いていなければ
   * 空配列。
   */
  readonly commandDescriptions: readonly CommandDescription[]
  /** セッションが終わった理由。動いている間は undefined。 */
  readonly endedReason: string | undefined
  /**
   * 前のセッションの続きから始まったか（`session-restored`）。**画面に出すためだけ**に持つ
   * （意図せず前の文脈が付いてくるのに気づけるように。docs/requirements.md 4.8）。
   * 新規に起きたセッションでは false のまま。
   */
  readonly restored: boolean
  /**
   * ターンが進行中か。`request` で始まり、`turn-finished` / `session-ended` で終わる
   * （入力欄が送信と中断を切り替える判断材料。docs/requirements.md 4.7）。
   */
  readonly turnInProgress: boolean
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
   * 今のターンが始まった時刻（`request` の `at`）。表す意味は「依頼を送ってから、そのターンが
   * 終わるまでの時間」の起点で、次の `request` まではそのまま持ち続ける（入力欄の経過時間表示
   * `src/ui/dispatch/turn-status.tsx` が使う。docs/design.md 4.2）。まだ一度も依頼が無ければ
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
   * **立ち絵の「失敗でびくっ」の判定にだけ使う**（`protocol/portrait-motion.ts` の
   * `resolvePortraitMotion`）。次のターンが始まっても戻さない（時間の窓が過ぎれば
   * `resolvePortraitMotion` 側で自然に「今は失敗直後ではない」に戻るため、`turnFinishedAt`
   * と違って `request` での巻き戻しは要らない）。まだ一度も失敗していなければ undefined。
   */
  readonly lastToolFailureAt: number | undefined
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
  restored: false,
  turnInProgress: false,
  tasks: undefined,
  character: undefined,
  characterPacks: [],
  turnStartedAt: undefined,
  turnFinishedAt: undefined,
  lastToolFailureAt: undefined,
}

/**
 * イベント1件を畳み込んで次の姿を返す。知らない状況でも必ず姿を返す（落ちない）。
 *
 * `at` はイベントが起きた時刻（`StampedEvent.at`）。`tool-started` の `startedAt` を記録する
 * ためだけに使う。`Date.now()` をここで呼ばないのは、この関数を純粋関数のまま保ち、
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
    case "command-descriptions":
      return { ...state, commandDescriptions: event.descriptions }
    case "request":
      return {
        ...state,
        records: trimToRecentTurns([...state.records, { kind: "request", text: event.text }]),
        // 前のターンの並びは最後の1件だけ残す（消すとキャラクターが消えたように見えるが、
        // 丸ごと持ち越すと次のターンの冒頭に前のターンの並びが残ってしまう）。
        speeches: state.speeches.slice(-1),
        partialUtterance: "",
        turnInProgress: true,
        speechCalledInTurn: false,
        turnStartedAt: at,
        turnFinishedAt: undefined,
      }
    case "partial-utterance":
      return { ...state, partialUtterance: state.partialUtterance + event.text }
    case "utterance":
      return settleUtterance({ ...state, partialUtterance: event.text })
    case "speech":
      return {
        ...state,
        // 記録は積みっぱなし（`speeches` と違ってターンの境目で捨てない）。過去のターンの
        // 吹き出しと表情をここから引き直す（`protocol/turn-speech.ts`）。
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
            startedAt: at,
            result: undefined,
          },
        ],
        runningTools: [
          {
            toolUseId: event.toolUseId,
            name: event.name,
            input: event.input,
            nested,
            startedAt: at,
          },
          ...state.runningTools,
        ],
      }
    }
    case "tool-finished":
      return finishTool(state, event.toolUseId, event.content, event.isError, at)
    case "pending-changed":
      return { ...state, pending: event.pending }
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
    case "session-restored":
      return { ...state, restored: true }
    case "tasks-changed":
      return { ...state, tasks: event.tasks }
    case "character-changed":
      return {
        ...state,
        character: {
          pack: event.pack,
          name: event.name,
          accent: event.accent,
          expressions: event.expressions,
          portraits: event.portraits,
          outfitAccents: event.outfitAccents,
          speechMarker: event.speechMarker,
        },
        characterPacks: event.packs,
      }
  }
}

/**
 * メインビューに渡す記録。**書きかけの本文を末尾に足す**ので、`ui/main-view/` の部品はそのまま
 * リアルタイムの表示になる（完成した本文が来た時点で確定した記録の側へ移る）。
 *
 * **`tool` の記録も渡す**（`docs/design.md` 6.1「`<Turn>` = `<RequestHeading>` +
 * `[<Report> | <ToolRun> | <QuestionRecord>]*`」）。サイドバーの「いま何をしているか」は
 * 別に `runningTools` / `finishedTools` を直接読むので、ここで両方に配っても重複にはならない。
 * **どのツールを実際にメインビューへ出すかは `protocol/main-view.ts` の `toolVisibility`
 * が絞る**（ファイルを変えた操作・サブエージェントの起動・失敗したツールの3種類だけ。
 * `docs/requirements.md` 4.2）。
 */
export function mainViewEntries(state: SessionState): readonly MainViewEntry[] {
  const settled = state.records.flatMap(toMainViewEntries)
  return state.partialUtterance === ""
    ? settled
    : [...settled, { kind: "detail", markdown: state.partialUtterance }]
}

/**
 * `SessionRecord` 1件をメインビューに出す形へ変える（出さないものは空で返す）。
 *
 * **`speech` は落とす**（セリフは吹き出しだけに出し、レポートに混ぜない。
 * docs/requirements.md 4.2）。落としても `request` の数と順番は変わらないので、
 * `protocol/main-view.ts` の `groupIntoTurns` が振るターンの通し番号はずれない。
 *
 * **`tool` は `toolUseId` / `nested` / `startedAt`（突き合わせや表情の判定にしか使わない内部の
 * 付随情報）を落とす**（メインビューの部品が見てよいのは名前・入力・結果だけ。境界で形を絞る。
 * docs/coding-standards.md「型を迂回するキャストを使わない」と同じ考えで、余分なフィールドを
 * 暗黙に持ち越さない）。
 */
function toMainViewEntries(record: SessionRecord): readonly MainViewEntry[] {
  if (record.kind === "speech") {
    return []
  }
  if (record.kind !== "tool") {
    return [record]
  }
  return [{ kind: "tool", name: record.name, input: record.input, result: record.result }]
}

/**
 * いま出す表情。決め方の正典は `resolveExpression`（src/protocol/expression.ts）。ここは
 * `SessionState` の該当する値（実行中のツール・直近の `speak` の表情）を渡すだけ。
 * `now` は経過時間の判定に要る現在時刻（呼び出し側が渡す。`Date.now()` はここでは呼ばない）。
 */
export function currentExpression(state: SessionState, now: number): Expression {
  return resolveExpression(state.runningTools, state.speechExpression, now)
}

/**
 * 入力欄の `/` 補完に出す候補（名前と、あれば説明）。
 *
 * `slashCommands`（`init` 由来）が届いていればそれが並びの出どころで、`commandDescriptions` は
 * 同じ名前のものを引き当てるためだけに使う（説明が届いていない・説明を持たないコマンドは
 * `description` が undefined になり、名前だけで出る）。
 *
 * **`slashCommands` がまだ空（`init` が届く前）は `commandDescriptions` をそのまま名前の出どころに
 * する。** `supportedCommands()` は `init` を待たずに届くため、これで最初の依頼を送る前でも
 * 候補が出せる（2026-09-12 実測。docs/requirements.md 4.2）。ただしこの間は端末専用
 * （`doctor` など）の除外がまだ効かない。**`init` が届き `slashCommands` が埋まった時点で、
 * 除外込みの一覧に戻る**ので、常駐セッションが長引くほど気にならない一時的な差分と割り切る。
 */
export function commandSuggestions(state: SessionState): readonly CommandDescription[] {
  if (state.slashCommands.length === 0) {
    return state.commandDescriptions
  }

  const descriptions = new Map(
    state.commandDescriptions.map((command) => [command.name, command.description]),
  )
  return state.slashCommands.map((name) => ({ name, description: descriptions.get(name) }))
}

/**
 * 入力欄の `/` 補完に出せるコマンド名。`slashCommands` から端末専用
 * （`terminalSlashCommands`。`doctor` / `color` / `reload-plugins` など）を除く
 * （docs/requirements.md 4.2「入力欄」）。
 */
export function commandCandidates(
  slashCommands: readonly string[],
  terminalSlashCommands: readonly string[],
): readonly string[] {
  const terminalOnly = new Set(terminalSlashCommands)
  return slashCommands.filter((command) => !terminalOnly.has(command))
}

/**
 * 書きかけの本文を確定した記録に移す。空のときは何もしない（空の本文を積まない）。
 *
 * **行頭マーカーの補助をここで効かせる**（docs/requirements.md 4.2「行頭のマーカーは補助に
 * 格下げ」）。拾えたセリフは吹き出しへ、本文からはマーカー行を除く。`speak` が呼ばれたターンでも
 * 同じ（規約が守られずに本文へ紛れたセリフの受け皿。以前は本文をそのまま出していたが、締めの
 * 一言がメインビューに残った。2026-09-12）。
 */
function settleUtterance(state: SessionState): SessionState {
  if (state.partialUtterance.trim() === "") {
    return { ...state, partialUtterance: "" }
  }

  const settled = withMarkerFallback(state)
  const markdown = settled.partialUtterance

  return {
    ...settled,
    records:
      markdown.trim() === "" ? settled.records : [...settled.records, { kind: "detail", markdown }],
    partialUtterance: "",
  }
}

/**
 * 行頭マーカーの補助を1回効かせる。拾えたセリフは、そのターンに `speak` があればその後ろに
 * 並べ、無ければ**そのターン最初のセリフとして**置き換える（前のターンの並びと混ざらない。
 * `speech` イベントの扱いと同じ規約）。
 * `partialUtterance` にはマーカー行を除いた本文を残す（呼び出し側が確定した記録へ積む）。
 */
function withMarkerFallback(state: SessionState): SessionState {
  // マーカーはキャラクターパックの定義から来る。**定義に無いパックでは補助そのものが効かない**
  // （コードに既定のマーカーを持たない。docs/design.md 7章）。
  const speechMarker = state.character?.speechMarker
  if (speechMarker === undefined || speechMarker === "") {
    return state
  }

  const parts = splitUtterance(state.partialUtterance, speechMarker)
  if (parts.speech === undefined) {
    return { ...state, partialUtterance: parts.detail }
  }

  // speak を呼んだターンでも、本文に紛れたマーカー行は吹き出しへ回す（規約が守られなかった
  // ときの受け皿。speak のあとに並べて、同じターンのまとまりとして出す）。
  const speeches = state.speechCalledInTurn ? [...state.speeches, parts.speech] : [parts.speech]

  return {
    ...state,
    // **記録にも積む**（`speech` イベントと同じ扱い）。積まないと、この経路で拾ったセリフだけが
    // 過去のターンで消える（今のターンは `speeches` から出るので気づきにくい。
    // `protocol/turn-speech.ts`）。マーカー行に表情は添えられないので、いまの表情を残す。
    records: [
      ...state.records,
      { kind: "speech", text: parts.speech, expression: state.speechExpression },
    ],
    speeches,
    speechCalledInTurn: true,
    partialUtterance: parts.detail,
  }
}

/**
 * ツール1件の結果を記録に合わせる。**対応する `tool_use` が見つからないときは何もしない**
 * （対応が取れない結果を作らない）。`isError` が true のときは `lastToolFailureAt` に `at` を
 * 打つ（立ち絵の「失敗でびくっ」の判定材料。`docs/design.md` 6.5）。
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
    startedAt: record.startedAt,
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
 * 直近 {@link MAX_SESSION_STATE_TURNS} ターンぶんだけを残す。**ターンの境目は `request`**
 * なので、古い `request` から数えて窓の外に出たものをまとめて落とす。
 */
function trimToRecentTurns(records: readonly SessionRecord[]): readonly SessionRecord[] {
  const requestIndexes = records.reduce<readonly number[]>(
    (indexes, record, index) => (record.kind === "request" ? [...indexes, index] : indexes),
    [],
  )
  if (requestIndexes.length <= MAX_SESSION_STATE_TURNS) {
    return records
  }

  const cutAt = requestIndexes[requestIndexes.length - MAX_SESSION_STATE_TURNS]
  return cutAt === undefined ? records : records.slice(cutAt)
}
