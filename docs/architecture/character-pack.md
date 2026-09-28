# キャラクターパック

最終更新: 2026-09-28。ステータス: **正典**。

## 節の索引

| 節                    | 中身                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| ## キャラクターパック | パックの形・探索順・`systemPrompt` の append の並び、画面から書くときの安全の境界、一覧と素材の URL、雑談の記憶の置き場（仕様は `docs/chat-mode.md`） |

## キャラクターパック

```
characters/<name>/
  character.json     name / portraits（表情 → ファイル名）/ outfitAccents / expressions（名前 → 日本語ラベル）/ diaryFont（日記の書体のファイル名）
  persona.md         人格。tsukumo が systemPrompt.append で足す（口調・セリフと詳細の書き分け。セリフの間合いとレポートの記法は core 側）
  *.svg / *.png      素材
  *.woff2 / *.woff / *.ttf / *.otf   日記の書体（任意。`diaryFont` が指す）
```

- **キャラクターの中身は定義が持つ**（原則4）。`speak` の enum と説明は `expressions` から作る。
  `diaryFont` はパックに同梱した書体ファイルだけを指せ、素材と同じ経路（「パックの一覧と素材の URL」）で配る
- **二重適用を避ける**: `applyFlagSettings({ outputStyle: "default" })`（セッション限り）で
  グローバルの出力スタイルを中立に戻してから `persona.md` を足す（実測と採らない案は
  `docs/requirements.md` 4.4）
- **切り替えは別のパックでセッションを起こし直す**（`speak` の enum も人格も、起こし直せば確実に
  入れ替わる。`startSdkDriver` が `mcpServers` を毎回組み直すので `setMcpServers` は要らない）
- **キャラクターごと・モードごとに別のセッションを持つ**（印の形と探し方は `docs/requirements.md`
  4.8「鍵」）。印の組み立ても読み取りも `session-driver/core/session-restore.ts` の `sessionTag` /
  `readSessionMark` 1箇所で、`session-start.ts` はそれを探す側と付ける側の両方に渡す

**探索先は3箇所で、同名は後ろが勝つ**（`listCharacterPacks`）:

| 順  | 置き場                            | 中身                                            |
| --- | --------------------------------- | ----------------------------------------------- |
| 1   | 同梱の `characters/*`             | `tsukumo` / `tsukumo-spirit`（自作の既定）      |
| 2   | `~/.tsukumo/characters/*`         | **画面から作ったパック**（全プロジェクト共通）  |
| 3   | 起動先の `<cwd>/characters/local` | そのプロジェクトで用意した素材（1つ固定のまま） |

**`systemPrompt` の append を組むのは `system-prompt/core/system-prompt.ts` の `takeSystemPromptAppend` 1つだけ**
（寄せた理由は `docs/architecture.md`「新しいコードを置く場所」）。**`persona.md` の全文を fs から
読むのは adapter（`character-pack.ts`）で、組み立てには文字列で渡す**ので、`core` はパックの型も fs
も知らない。並びはモードで入れ替わる:

| 場面                             | append に入る節の並び                           |
| -------------------------------- | ----------------------------------------------- |
| 仕事                             | 人格 → セリフの間合い → レポートの記法          |
| 雑談（記憶が載るとき）           | 人格 → 雑談の作法 → 前回までの要約 → 直近の雑談 |
| 雑談（続きから・写しが渡し済み） | 人格 → 雑談の作法                               |

- **人格が無いパックは先頭が落ちるだけ**（tsukumo 側の規約だけで起動する）
- **雑談の記憶の節は、中身が無ければそれぞれ落ちる**（載せる条件は `docs/chat-mode.md` 4.9
  「載せる条件は2つあり、どちらかに当たれば載せる」）
- **仕事と雑談は入れ替え**（並べない。理由は `chat/core/chat-manner.ts` の冒頭）

### 画面から作るときの置き場と受け取り方

**書き込み先は `~/.tsukumo/characters/<name>/` の1箇所だけ。** 同梱の `characters/*` と起動先の
`characters/local` はどの経路でも書かず、消さない（リポジトリの作業ツリーが汚れず、権利のある素材が
公開リポジトリに入る経路が生まれない。`cwd` に依存させない理由は `docs/requirements.md` 4.4）。

**画像は data URL を JSON に載せ、いまの WebSocket のコマンドで受け取る。**
`src/shared/contract/character-pack.ts` に手続きを足すだけで、`src/server/view-server/adapter/server.ts` に新しい
書き込み経路を作らない。起動トークンと `Origin` の照合・zod の検証・定型文の `REFUSED` がそのまま効く
（multipart の POST と生バイトの POST を採らない理由は `docs/history/decision.md`「design.md 7.
キャラクターパック（2026-09-27 に仕様を持ち主へ返したときに落とした経緯と採らない案）」）。

| 何                        | 上限                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------- |
| 画像1枚（デコード後）     | 2 MiB                                                                               |
| 1つのパックが持てる画像   | 表情の数 + 4 枚（ミニ立ち絵・背景・顔・訪問の peek）                                |
| WebSocket の `maxPayload` | 16 MiB（依頼に添える画像の上限で決まる。`docs/requirements.md` 4.10「上限」と同じ） |

- **受け取った文字列をパスにしない。** パックの名前は shared のスキーマ（`isCharacterPackName`。
  `[A-Za-z0-9._-]` だけ・`.` で始まらない）で検証し、ファイル名は受け取らず種類と形式から組む
  （`<表情>.<svg|png|gif>`・`background.<png|jpg|webp>`・`face.<svg|png|gif>`）。同じ表情の差し替えは
  同じ名前の上書きになる
- **書き込む先のパックはコマンドが名前（`pack`）で指し、サーバは一覧と突き合わせて引くだけ**
  （素材を配るのと同じ `findCharacterPack` の規則。使用中のパックで置き換えた一覧）。名前から
  ディレクトリを組み立てない。無いパック・起動先の `characters/local` と同じ名前のパック
  （`isEditableCharacterPack` が false）は書かず、理由を分けない定型文の `REFUSED` を返す
- **初めて変えるときに、書き込む先のパックをホームへ丸ごと写す**（`copyPackOnce`。定義・
  `persona.md`・素材。人格ごと写さないと次の起動で人格が消える）。ホームに同じ名前があれば写さない
- **参照が外れた素材は消す**（消すのはホームのそのパックの中の、どの定義からも参照されていない
  画像だけ）
- **反映はセッションを起こし直さず、`character-changed` を流し直すだけ**（一覧は「パックの一覧と素材の URL」の契機で
  読み直される）

**新しく作るときの細部**: **ディレクトリ名になるのは `id` だけ**で、表示名（`name`）は
`character.json` の値にすぎない。既にある id は画面とサーバの両方で弾く（探索の順で後ろが勝つので、
作れてしまうと既存のパックが黙って隠れる）。書く順は**素材 → `character.json`** で、途中で失敗した
書きかけのディレクトリは消す（定義を持たないので一覧にも出ない）。表示名が空なら `name` を書かず、
読む側が id へ折り返す既存の仕組みに乗る（`definitionWithName`）。

**消すときの細部**: **消せるのはホームの版だけ。** 届いた名前はパスに使わず一覧から引き、**引けた
パックの場所が `<ホームの置き場>/<名前>` そのものであるときだけ消す**（同名は後ろが勝つので、起動先の
`local`・一覧の外・同梱だけのパックはここで外れる。シンボリックリンクなら消えるのはリンクだけ）。
消したあとに何が起きるかの判定は `characterPackRemoval` 1つが持ち、画面に配る値と消す側が断る判断の
両方がそこを通る。パックの外にある雑談の記録（「雑談の記憶の置き場」）を一緒に消すのは配線層（`src/current-character.ts`）で、
記録が消せなくてもパックを消したことは取り消さない。

### パックの一覧と素材の URL

**1件の形は `CharacterPackEntry`**（`src/shared/character-pack/character.ts`。姿は `CharacterInfo` をそのまま入れ子で
持つ）。**変えられるか（`editable`）・消すと何が起きるか（`removal`）はサーバが決めて持たせ**、画面は
理由を推し量らない。

**一覧を配り直す契機は `character-changed` を組むたび**（`src/current-character.ts` の `event`）。
パックの集まりを変える口はどれも「書いたら `event()` を返す」だけで一覧が配り直される（口ごとに
読み直しを呼ぶ形にしない。1つ呼び忘れると古い一覧が黙って配られる）。素材を配るときに突き合わせる
一覧も、最後に `event()` で読んだものを使う。

**素材の URL は `/character/<pack>/<file>?v=<版>` の1つの形に揃える**（使用中のパックも同じ）:

- パック名とファイル名は**それぞれ `encodeURIComponent` した1区間**。組み立て（`characterAssetPath`）と
  読み分け（`readCharacterAssetPath`）は `src/shared/character-pack/character-asset.ts` の1箇所で、区切りの `/` が
  ちょうど1つでない経路・デコードできない経路は 404
- **取り直しの印（`?v=`）は素材の版（更新時刻）だけ**（ファイル名が同じまま中身だけ変わるため）。
  配る側は `?` 以降を見ない
- **配ってよいのは、一覧にあるパックの、そのパックの定義に載っているファイル名だけ**
  （`readCharacterAsset` → `readCharacterPackFile`。allowlist はパックごと）
- **一覧の中の、使用中と同じ名前の1件は使用中のパックに置き換える**（無ければ末尾に足す）。画面に
  出すもの・配るものが「いま出しているもの」とずれない
- 素材はトークン無しで配る（`docs/design.md` 9章「会話内容と安全」）

### 雑談の記憶の置き場

**雑談の記憶は `~/.tsukumo/` の下の、キャラクターパックの外に置く。** 仕様（何を・いつ・どんな形で
書き、どう読み戻すか・上限）は `docs/chat-mode.md` 4.9 が正典で、ここは置き場と持ち場だけを持つ。

| 何                             | 置き場                                                                                                   | ファイルに触る adapter                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| あらすじ（と渡し済みの印）     | `~/.tsukumo/chat-summary/<pack>.md`                                                                      | `chat/adapter/chat-summary.ts`            |
| 雑談の会話のアーカイブ         | `~/.tsukumo/chat-archive/<pack>/<YYYY-MM-DD>.jsonl`                                                      | `chat/adapter/chat-archive.ts`            |
| エピソード索引・思い出した記録 | `~/.tsukumo/chat-archive/<pack>/episode.jsonl` / `recalled.jsonl`                                        | `chat/adapter/chat-archive.ts`（同じ1つ） |
| 覚えたこと                     | `~/.tsukumo/characters/<pack>/persona.md` の末尾の節（「画面から作るときの置き場と受け取り方」の置き場） | `chat/adapter/persona-memory.ts`          |

- **パックのディレクトリの中に置かない**（覚えたことを除く）。会話に由来する文章を混ぜると**パックを
  渡すことが会話を渡すことになる**。覚えたことはキャラクターの属性1行で、「画面から作るときの置き場と受け取り方」の道に乗る
- **`cwd` に依存させない**。**鍵はパックの名前1つだけ**で、`isCharacterPackName` を通してからパスを
  組む。日付のファイルとエピソード索引は**名前で見分ける**（窓の側は `YYYY-MM-DD.jsonl` にだけ
  当たる正規表現でファイルを選ぶ）
- **口（型）は `session-driver/core/session-driver.ts`、ファイルに触るのは上の adapter、結ぶのは配線層
  （`src/session-start.ts`）。** 置き場を差し替えられる `root` 引数も同じ手で持つ（テストがホームを
  汚さない）
- **アーカイブへ書くのは `session/core/session-manager.ts` の `receive`**（イベントが1件ずつ通る
  場所）。復元の再生は駆動と別の口（`onRestoredEvent`）で流し、`session-manager` は駆動から新しく
  届いたぶんだけを書く。読み戻しはセッションを起こすとき1回だけで、配線層が呼ぶ
- **判断は `chat/core/` の純関数**（載せる判断・定着の指示文と検査・採点。アダプタは読んで渡すだけ）で、
  **定着の契機（ターンの終わり・同時に1本）は `session-manager` が持つ**。走っているかどうかの1ビットは
  駆動の代ではなく `session-manager` 自身が持つ（起こし直しで代だけを作り直しても、同じ行を2本で畳まない）。
  容量の表と採点の係数は複数の機能が読むので `src/shared/chat/chat-memory-budget.ts`
