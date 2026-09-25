// 雑談の記憶（**それより前の要約**と**直近の逐語**）を `systemPrompt` に載せるかどうかを決め、
// 載せるときに添える前置きを組み立てる（`docs/design.md` 7章「雑談の記憶の要約はどこに置くか」、
// `docs/chat-mode.md` 4.9「直近の会話は逐語のまま読み戻す」）。`chat-manner.ts` の隣に置く
// （モデルに見せる文面は core 側）。
//
// **ターンの途中で `recall` / `recall_episode` が返す文面もここが組み立てる**
// （`docs/chat-mode.md` 4.9「古い雑談は索引を引いて思い出す」）。載る場所は違う（`systemPrompt` か、
// ツールの戻り値か）が、`recall_episode` が開いた1件の逐語の並べ方（話者の印・日付の見出し）は
// `systemPrompt` の節と同じ1つで、読む側が2通りを覚えずに済む。
//
// **判断は1箇所にまとめる。** 載せる条件は2つの記憶に共通で、載せたら写しの印を「渡し済み」に
// 戻す——2つの口に分けると、先に呼ばれたほうが印を戻して**あとの1つが黙って載らない**
// （`docs/design.md` 7章）。
//
// **中身を読んで判定しない。** 決めるのは「続きから始めないか」「写しの印が未渡しか」という
// 構造だけの条件で、要約の文面も逐語の文面も素通りする（読んで判定する経路を作ると
// `docs/coding-standards.md`「会話内容の扱い」とぶつかる。`docs/design.md` 7.1「覚えたことを
// 人格に書き足す」と同じ理由）。
//
// 口（`ChatSummary` / `ChatArchive`）の型は `src/server/session-driver/core/session-driver.ts`、ファイルに触る
// 実装は `src/server/chat/adapter/chat-summary.ts` と `src/server/chat/adapter/chat-archive.ts`。
// 呼び出すのは配線層（`src/session-start.ts`）で、**雑談のときしかこの関数を呼ばない**
// （仕事のときは呼ばずに空の配列を使う）ので、この関数自体は雑談であることを前提にしてよい。

import {
  type ChatArchive,
  type ChatArchiveRecentEntry,
  type ChatEpisodeCandidate,
  type ChatReadbackLimits,
  type ChatRecallEpisodeResult,
  type ChatRecallListResult,
  type ChatSummary,
  type SessionStart,
} from "../../session-driver/core/session-driver.ts"

/**
 * 要約の前置き。**要約であって会話ではないこと**と**引用しないこと**を短く添える
 * （`docs/chat-mode.md` 4.9「渡し方」）。**印の行はここに含めない**——{@link ChatSummary.read}
 * が返す `summary` はすでに印の行を含まない。
 */
const CHAT_SUMMARY_PREFACE =
  "## 前回までの雑談の要約\n\n" +
  "以下は claude 自身が `/compact` で作った、前回までの雑談の要約。会話そのものではなく、" +
  "そのままの引用でもない。踏まえてよいが、文面を読み上げたり引用したりしない。"

/**
 * 逐語の前置き。**要約と違って会話の文面そのもの**であることと、話者の見分け方を添える。
 * いつごろの話かは**日付が変わるところに `### <日付>` の見出しを挟む**ことで足りる
 * （`docs/chat-mode.md` 4.9。表情も画像の枚数も載せない）。見出しは会話の発言ではない
 * ことをここで断る。
 */
const CHAT_RECENT_PREFACE =
  "## 直近の雑談（そのままの文面）\n\n" +
  "以下は直近の雑談のやり取りそのもの（要約ではない）。`利用者:` が利用者の発言、" +
  "`あなた:` があなた自身の過去のセリフ。`### ` で始まる行は日付の見出しで、会話の発言ではない。" +
  "続きとして踏まえてよいが、読み上げたり引用したりしない。"

/**
 * `recall` が当たったときの前置き（`docs/chat-mode.md` 4.9「古い雑談は索引を引いて思い出す」）。
 * **逐語は渡さない**——`id` / `title` / `gist` の一覧だけで、開くには `recall_episode` が要る
 * ことをここで断る。
 */
const CHAT_RECALL_LIST_PREFACE =
  "索引を引いた候補（点の高い順。逐語ではなく見出しと要旨だけ）。" +
  "思い出したい1件があれば、その `id` を渡して `recall_episode` で開く。"

/** 索引に当たる候補が無かったときの戻り値。 */
const CHAT_RECALL_LIST_NOT_FOUND =
  "索引に当たる候補が無かった。別の言葉で引き直すか、覚えていないことを正直に言う。"

/** そのターンで一覧の上限まで引いたときの戻り値（`docs/chat-mode.md` 4.9 の `recallListsPerTurn`）。 */
const CHAT_RECALL_LIST_EXHAUSTED =
  "このターンではもう一覧を引けない（引けるのは1ターンに2回）。次のターンで引き直す。"

/**
 * `recall_episode` が当たったときの前置き。**`systemPrompt` の3つと違って、これはツールの
 * 戻り値としてターンの途中で入る**ので、**いまの話の続きではないこと**をここで断る。日付の
 * 見出しと話者の印は他の節と同じ。
 */
const CHAT_RECALL_EPISODE_PREFACE =
  "候補の1件を開いた、その範囲の雑談そのもの（要約ではない）。" +
  "**いま話していることの続きではなく、そのエピソードのやり取りをそのまま抜いたもの**で、" +
  "前後には残っていない会話がある。`利用者:` が利用者の発言、`あなた:` があなた自身の過去のセリフ。" +
  "`### ` で始まる行は日付の見出しで、会話の発言ではない。" +
  "思い出した内容として踏まえてよいが、読み上げたり引用したりしない。"

/** `recall_episode` が `overflowed: true` を返したときに、逐語のあとへ足す一言。 */
const CHAT_RECALL_EPISODE_OVERFLOW_NOTE = "（続きがあるが、ここまで）"

/** 知らない `id`（一覧に無い・アーカイブの行が残っていない）のときの戻り値。 */
const CHAT_RECALL_EPISODE_NOT_FOUND =
  "その `id` のエピソードは無かった。`recall` で一覧をもう一度引き直すか、覚えていないことを正直に言う。"

/** そのターンで開ける上限まで開いたときの戻り値（`docs/chat-mode.md` 4.9 の `recallEpisodesPerTurn`）。 */
const CHAT_RECALL_EPISODE_EXHAUSTED =
  "このターンではもうエピソードを開けない（開けるのは1ターンに2件）。次のターンで開き直す。"

/** 逐語の1行の頭に置く話者の印。 */
const SPEAKER_LABEL = {
  user: "利用者",
  character: "あなた",
} as const satisfies Record<ChatArchiveRecentEntry["speaker"], string>

/** {@link takeChatMemoryPromptParts} に渡す口と条件。 */
export type ChatMemorySources = {
  /** 新規に起こすか、続きから始めるか（`SessionLaunchSeed.start`）。 */
  readonly start: SessionStart
  /**
   * 雑談の要約の写しの口。**呼ぶ側が雑談のときだけこの関数を呼ぶ**ので、ここには常に値がある
   * （仕事のときの「載せない」判断は呼ぶ側の1回の分岐に寄せてある）。
   */
  readonly chatSummary: ChatSummary
  /** 雑談の会話のアーカイブの口（読むのはここから起こすパックのぶんだけ）。 */
  readonly chatArchive: ChatArchive
  /** これから起こすキャラクターパックの名前。 */
  readonly packName: string
  /**
   * 逐語で読み戻す量（バイト。`CHAT_MEMORY_BUDGET.recentBytes`）。
   */
  readonly readbackLimits: ChatReadbackLimits
}

/**
 * `systemPrompt` に足す、雑談の記憶ぶんの文面（載せないときは空。**古い→新しいの順**で、
 * 要約・直近の逐語の2つ）。
 *
 * **載せる条件は2つで、どちらかに当たれば載せる**（`docs/design.md` 7章。**要約と逐語に共通**）:
 *
 * 1. **新規に起こす**（`start.kind` が `"new"`）
 * 2. 続きから始めるが、**写しの印が「未渡し」**
 *
 * どちらでもなければ載せない——続きから始めた文脈には同じ会話も同じ要約も既にある。
 * **印が無い・読めないときは「未渡し」として扱う**（倒れる方向を「同じものが2度載る」側にし、
 * 黙って記憶が消えるほうへ倒さない）。**載せたら印を「渡し済み」に戻す**（起こし直しのたびに
 * 重ねないため）。
 *
 * **写しがまだ無くても逐語は載る。** 条件を決めるのは `start` と印だけで、要約があるかどうか
 * ではない（`docs/chat-mode.md` 4.9）。
 *
 * **名前が `take` で始まるのは、返すだけでなく写しの印を書き換えるから**（2度目の呼び出しは
 * 同じ文面を返さない）。取得に見える名前にすると、呼ぶ側が副作用に気づけない。
 */
export function takeChatMemoryPromptParts(sources: ChatMemorySources): readonly string[] {
  const { chatSummary } = sources
  const record = chatSummary.read()
  const delivered = record?.delivered ?? false
  if (sources.start.kind === "resume" && delivered) {
    return []
  }

  const summary = record === undefined || record.summary === "" ? undefined : record.summary
  const entries = sources.chatArchive.readRecent(sources.packName, sources.readbackLimits)
  const recent = verbatimPart(CHAT_RECENT_PREFACE, entries)
  const parts = [
    ...(summary === undefined ? [] : [`${CHAT_SUMMARY_PREFACE}\n\n${summary}`]),
    ...(recent === undefined ? [] : [recent]),
  ]
  if (parts.length === 0) {
    return []
  }

  chatSummary.markDelivered()
  return parts
}

/**
 * `recall` の結果をモデルへ返す文面に変える（`src/server/session-driver/adapter/sdk-tool.ts` の
 * `recall` ツールの戻り値）。**当たったときだけ候補の一覧が入る**——当たらなかったときと、
 * そのターンで上限まで引いたときは短い一言だけで、会話の文面は1バイトも入らない
 * （`id` / `title` / `gist` は目次で、逐語ではない）。
 *
 * **ここと {@link chatRecallEpisodeText} が「戻り値は `"ok"` だけ」の例外**
 * （`docs/chat-mode.md` 4.9）。返しているのは tsukumo の状態ではなく**その会話自身の過去**
 * なので、`docs/architecture.md`「戻り値は `"ok"` だけにする」が塞いでいる逆流路
 * （tsukumo → モデル）は開かない。
 */
export function chatRecallListText(result: ChatRecallListResult): string {
  if (result.kind === "exhausted") {
    return CHAT_RECALL_LIST_EXHAUSTED
  }
  if (result.kind === "not-found") {
    return CHAT_RECALL_LIST_NOT_FOUND
  }
  return candidateListPart(result.candidates)
}

/**
 * `recall_episode` の結果をモデルへ返す文面に変える（`sdk-tool.ts` の `recall_episode`
 * ツールの戻り値）。**当たったときだけ逐語が入る**——知らない `id`・そのターンで上限まで
 * 開いたときは短い一言だけ。`overflowed` のときは、逐語のあとに続きがあることだけを添える
 * （逐語そのものは増やさない。`docs/chat-mode.md` 4.9「溢れたら続きがあることだけを一言添える」）。
 */
export function chatRecallEpisodeText(result: ChatRecallEpisodeResult): string {
  if (result.kind === "exhausted") {
    return CHAT_RECALL_EPISODE_EXHAUSTED
  }
  if (result.kind === "not-found") {
    return CHAT_RECALL_EPISODE_NOT_FOUND
  }
  const verbatim = verbatimPart(CHAT_RECALL_EPISODE_PREFACE, result.entries)
  if (verbatim === undefined) {
    return CHAT_RECALL_EPISODE_NOT_FOUND
  }
  return result.overflowed ? `${verbatim}\n\n${CHAT_RECALL_EPISODE_OVERFLOW_NOTE}` : verbatim
}

/** 候補の一覧ぶんの文面（点の高い順のまま、`id` ・見出し・要旨を1行ずつ並べる）。 */
function candidateListPart(candidates: readonly ChatEpisodeCandidate[]): string {
  const lines = candidates.map(
    (candidate) => `- ${candidate.id}: ${candidate.title}（${candidate.gist}）`,
  )
  return `${CHAT_RECALL_LIST_PREFACE}\n\n${lines.join("\n")}`
}

/**
 * 逐語ぶんの1節（1件も無いときは undefined）。**日付が変わるところに `### <日付>` の
 * 見出しを挟む**（同じ日が続く間は見出しを重ねない。1日ぶんしか無ければ見出しは1つだけ）。
 * **並べ替えない** — `entries` は `readRecent` が返した順のまま並べるだけで、中身を読んで
 * 落としたり並べ替えたりしない。
 *
 * **直近の窓と `recall_episode` の開いた1件で同じ組み立てを使う**（違うのは前置きだけ。
 * 並べ方が節によって変わると、読む側が話者の印と見出しを2通り覚えることになる）。
 */
function verbatimPart(
  preface: string,
  entries: readonly ChatArchiveRecentEntry[],
): string | undefined {
  if (entries.length === 0) {
    return undefined
  }

  const lines: string[] = []
  let lastDate: string | undefined
  for (const entry of entries) {
    if (entry.date !== lastDate) {
      lines.push(`### ${entry.date}`)
      lastDate = entry.date
    }
    lines.push(`${SPEAKER_LABEL[entry.speaker]}: ${entry.text}`)
  }
  return `${preface}\n\n${lines.join("\n")}`
}
