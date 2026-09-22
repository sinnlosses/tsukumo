# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

### T-328 で決めた形の横展開（2026-09-22 洗い出し。同日ユーザーの指摘で2件に絞った）

T-328 とその指摘対応で、機能の中を **container / presenter / `hooks/` / `components/` /
`domain/`** に分ける形が決まった（正典は `docs/design.md` 2章「機能の中を分ける」）。同じ形が
当てはまる場所を実物で洗い出し、ユーザーの判断で残ったのが次の2件。

**1. 部品ファイルに同居しているフックを `hooks/` へ出す（2機能）**

- `src/browser/features/character-view/character-view.tsx:60,95` — `useNowForPortraitMotion` /
  `usePortraitMotion` が部品と同じファイルにある
- `src/browser/features/main-view/report-reveal.ts:86` — `useReportReveal` は専用ファイルだが
  `hooks/` の外にある（361行で、フック以外も入っている）

`task-board` で `hooks/use-task-board.ts` を出したのと同じ形。**どちらも T-336〜T-339 の対象外の
機能**（T-336 は chat-view、T-337 は dispatch、T-338 は character-screen、T-339 は layout と
token-usage）。

**2. `src/browser/lib/clock.ts` を `src/browser/utils/` へ移す**

`lib/` は**ライブラリのラッパー**を置く箱で、`utils/` は**ライブラリに依存しない汎用の道具**
（2026-09-22 ユーザーの線）。`clock.ts` は `Temporal`（言語の組み込み）を1行呼ぶだけなので
`utils/` 側。

移すときに要ること:

- **`browser/utils/` は箱として存在しない。** `test/architecture.test.ts` の `BROWSER_BOXES` に
  `utils` が無く、`browserBoxOf` は未知のディレクトリで `throw` するので、**作ると即座に落ちる**。
  `ALLOWED_BROWSER_BOX_IMPORTS` の辺（誰が `utils` を引いてよいか。`utils` 自身は何も引かない）も
  同時に決める
- **`docs/design.md` 2章の表現がユーザーの線とずれている。** いまの表は `lib/` を
  「**名指しできる技術**を知っている道具（React・DOM・WebSocket・`node:fs`）」と書いていて、
  この読み方だと `Temporal` を使う `clock.ts` は `lib/` に落ちる（実際そこに置かれた）。
  「`lib/` はライブラリのラッパー / `utils/` はライブラリに依存しない汎用」に言い換えるかを決める
- `clock.ts` は T-344 / T-345（`Date` → Temporal）で作られたばかりのファイル。**読み手が
  どれだけ居るか**を先に見る

### `~/.tsukumo/` を並行セッションで取り合う（2026-09-22 ユーザーの指摘）

T-333 に着手しようとしたところ、別セッションが同時刻に T-322 を `doing` にした。どちらも
tsukumo を起こす目視確認を含むので `CLAUDE.md`「## タスク運用」の「並行させない」に当たり、
着手を止めた。ユーザーの問い: **「state.json を取り合う構造をなんとかするのが先かな?」**

**T-349〜T-353（worktree）では解けない。** `src/server/adapter/tsukumo-home.ts` は
`homedir()` だけでホームを組み立て、**cwd に依存させないことが意図した設計**（同ファイルの
コメント、`docs/design.md` 7.1）。worktree を切っても `~/.tsukumo/` は1つのまま。

取り合うものは5つあり、**`CLAUDE.md` が名指ししている `state.json` はいちばん軽い**:

| 置き場 | 書き方 | 鍵 | 並行したとき |
| --- | --- | --- | --- |
| `chat-summary/<pack>.md` | `writeFileSync`（全上書き。`chat-summary.ts:100`） | パック名だけ | **後に書いたほうが相手の要約を丸ごと消す。会話の中身** |
| `chat-archive/<pack>/<date>.jsonl` | `appendFileSync`（`chat-archive.ts:189`） | パック名 + 日 | 2つの会話が1本に混ざる（消えはしない）。**会話の中身** |
| `state.json` | `writeFileSync`（23B。`remembered-character.ts`） | 無し | 次の起動の初期キャラが後勝ち。実害は小さい |
| `token-usage/<date>.jsonl` | `appendFileSync`（`token-usage-log.ts:113`） | 日だけ | 混ざるが合算が目的なので実害なし |
| `characters/<name>/` | 画面からの編集（`character-edit.ts`） | パック名 | 同じパックを同時に編集したときだけ |

実物の `~/.tsukumo/chat-summary/` には `tsukumo.md` が1つ。**既定のパック名が共通なので、
並行セッションは必ず同じファイルを指す。**

**決めるべきこと**

- **ホームの何を、何の単位で分けるか。** 全部をセッション単位にすると「全プロジェクト共通で
  キャラクターを覚える」（`docs/design.md` 13.6）が壊れる。項目ごとに
  「利用者に1つ／プロジェクトに1つ／セッションに1つ」を割り当てる話になる
- `chat-summary` / `chat-archive` の鍵にパック名以外（セッションID・プロジェクト）を足すか、
  それとも**ホームごと分ける**か
- 分けたものを**いつ捨てるか**（セッション単位の置き場はゴミが残る）
- `TSUKUMO_VIEW_PORT` と同じく環境変数でホームを差し替えられるようにするだけで足りるか
  （いまは差し替え口が無い。`tsukumo-home.ts` は `homedir()` 直読み）

**目視確認を並行させられないという運用の縛りは、ここが解けると外れる**ので、目視を含む
タスク（T-322 / T-333 / T-329〜T-332 など）より先に置く価値がある。

### 対応不要と決めたもの（2026-09-22）

- **`dispatch/` の純関数を `domain/` へ出す件**: `shouldShowCommandSuggestions` /
  `matchingCommands` / `filePathQuery` / `matchingFilePaths` と `useRepositoryFilePaths` は
  **全部 `composer.tsx` が読んでいる**ので、composer のフックに同居させればよい。**T-337 の中で
  扱う**（別タスクにしない）。「純関数だから `domain/`」ではなく、**まずフックに入らないかを
  見る**——この基準は `docs/design.md` 2章に反映済み
- **1秒刻みの `now` を `browser/hooks/` へ上げる件**: 上げない。共通なのは時刻を読む
  `clock.ts` のほうで、タイマーの立て方（可変遅延と固定1秒）は機能ごとに違ってよい
- **機能の中の置き場を `architecture.test.ts` で守る / 「部品は `function` で書く」を機械で守る /
  props の分解の例外を規約に書く**: いずれも一旦不要
