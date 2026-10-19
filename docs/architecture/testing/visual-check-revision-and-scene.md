# テスト: 手で確かめること（変更前との比べと場面ごとの確かめ）

ステータス: **正典**。入口は `docs/architecture/testing.md`（テストの全体）。

責務: 手で確かめることの後半。変更前と撮り比べる手順と帯の名乗り、変更前を手元に作らない理由、配信側の切り分け、目視のために起こす tsukumo の手順、場面ごとの確かめ（続きのターン・並列の段・止めたワークプラン・書き終わりの知らせ・カタログの専用の件）、目視用の合成 PNG。
読む時: 変更前と撮り比べる・本物の tsukumo で目視する・特定の場面の描き方を確かめるとき。
直す時: 撮り比べの道具・目視の手順・場面ごとの確かめ方を変えたとき。

## 節の索引

| 節                  | 中身                                                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ## 手で確かめること | 後半: 変更前と撮り比べる・帯の名乗り・変更前を手元に作らない・`curl` で切り分け・目視で起こす tsukumo の手順・場面ごとの確かめ・合成 PNG（前半は `docs/architecture/testing/visual-check.md`、中ほどは `docs/architecture/testing/visual-check-interaction.md`） |

## 手で確かめること

**変更前と撮り比べるときは `node scripts/runtime/serve-revision.ts <コミット>`。** 名指ししたコミットを
`/tmp/tsukumo-revision/<sha>/` へ取り出し、そこで組み立てて、空けたポート（既定 7338）と一時ホームで
tsukumo を1つ起こし、URL を出す（`--scene` で疑似セッションの場面も流せる）。その URL を
`capture-view.ts` / `capture-catalog.ts` に渡して撮り、いま居る作業ツリーで起こしたほうと並べる。

**帯の名乗りは、作業ツリー名は呼んだ側と揃い、部屋の名前は揃わない。** 取り出し先の末尾を呼んだ
作業ツリーの名前にしてあるので作業ツリー名は同じ。部屋の名前はポートで決まる（`roomName`）うえ、
呼んだ側と同じポートでは起こせないので同名にはならない。名乗りの幅は**色名の字数が同じなら揃う**
（色名は全角）ので、呼んだ側の部屋と同じ字数の色のポートを `--port` で選ぶ。既定の 7338 は1字の
色。字数は `roomName` の語彙で数える。語彙の外のポートは番号を名乗り、半角なので幅が合わない。
**撮り終えたら `node scripts/runtime/stop.ts --port 7338`（`--port` で変えたらそのポート）で必ず止める** — 起こしたものは自分では
止まらない（`stop.ts` が中の tsukumo を止めると、外側の `serve-revision.ts` も続いて終わるので、
打つのは1回でよい）。**利用者の tsukumo が 7327〜7330 あたりで動いていることがあるので、
そこは止めない・触らない。**

**変更前を手元に作らない。** `git stash` で退避する方法は採らない——**stash の stack は他の作業ツリーと
共有**なので、別のセッションの退避を取り違えうる。`git checkout` や手での書き戻しで一時的に変更前へ
巻き戻す方法も採らない——戻し忘れると書きかけの変更を失うし、`dist/browser/` が変更前のまま残る
（受け入れ側で `pnpm run build` を打ち直すことになる）。`serve-revision.ts` は取り出しに
**一時 index**（`GIT_INDEX_FILE`）を使うので、**作業ツリーも index も `dist/browser/` も読むだけ**で
済む。`node_modules` はいま居る作業ツリーのものを symlink で借りるので `pnpm install` も要らない
（**`package.json` をまたいで比べるときだけ**この前提が崩れる。そのときは取り出し先で手で打つ）。
**`.git` も同じく symlink で借りる**ので、取り出し先で起こした tsukumo でも成果の画面が `main`
の履歴を表示する（`.git` を書き換える呼び出しはここを通らない——読むだけの `git` しか打たない。
`scripts/runtime/serve-revision.ts` の `lendGitDirectory`）。
手順の前後で `git status --short` が変わっていないことを確かめてから `evidence` を書く。

**配信側が疑わしいときは、ブラウザを開く前に `curl` で切り分ける。** 起動時にビューの URL が
表示されるので、`curl <URL>` で HTML が返るかを見る。WebSocket 側はブラウザの開発者ツールの
Network タブで `/ws` の upgrade が101を返し、`hello` フレーム（購読 `frame.subscribe` の封筒の中の `d.json`）が届くかを見る。ここまで出ていれば
配信はシロで、原因はページの側かホストの側にある。

**目視のために起こす tsukumo は `TSUKUMO_VIEW_PORT` を 39000 番台に固定し**、ふだん使いの既定
（7327 から始まる帯）と重ねない。`node scripts/runtime/stop.ts --port` は自分で起こしたポートにだけ打つ。
**起こしたままの tsukumo は `pnpm run build` を打ち直しても古い組み立てを配り続ける。** 直しながら
目視するなら `--dev` で起こす（`pnpm run dev`。HMR で差し替わる）か、組み立てのたびに上げ直す。

1. **`pnpm run build` を打ってから** Orca のターミナルで `pnpm run start` を1つ起動する
   （Claude Code の TUI は開かない）。成果物か取り込んだプラグイン（`vendor/tsukumo-plugins`）が無いと起動は前提不足で止まり、`src/browser/` が
   組み立てたときから変わっていると「古い画面が出る」1行が出る
2. **tsukumo 自身がレイアウトページのタブを開く**ので、それが**Orca 内のブラウザタブ**に
   出ること（外部ブラウザに出ないこと）を見る。タブだけ閉じてしまったときは
   `node scripts/capture/open-views.ts <URL>` で開き直せる
3. **画面の入力欄から依頼を打つ**。送信できること、実行中に中断できること
4. **再読み込みなしに**吹き出しにセリフが出て、メインビューにレポートが流れること
5. ツールを使う依頼で、**帯の「いまの作業」の札に進行が出て、押すと依頼の手順の一覧が開く**こと
6. 許可の要る操作を頼み、**メインビューの帯の下にお伺いの札が出て、タブのタイトルが変わり、
   カードを選んで「これで答える」を押すか、入力欄の帯の「お伺いへ」から 1 と Enter で答えると作業が続く**こと
7. ウィンドウの幅を変えて、**折り返しがブラウザ側で追従する**こと
8. `orca` が使えない状況を作っても、プロセスが落ちずに配信を続けること
9. レポートに出た git 管理下のパス（inline code・フェンスのファイル名・相対リンク）を押すと、
   **Orca のエディタでそのファイルが開く**こと（`docs/architecture/display.md` 4.2「各表示物」）

`evidence` には「どの環境で何を見たか」を1行で書く。

**claude が自分で始めた続きのターン（`turn-resumed`）の合間を測るときは、疑似セッションの場面
`resumed-report`（`TSUKUMO_FAKE_SCENE=resumed-report`）を使う。** 中間の `report` のあと、
`turn-resumed` → `speech` → ターンの終わりを2回はさみ、最後に完了の一言と最終 `report` が続く。
`turn-resumed` が届いてから次の `speech` / `report` が届くまでのあいだも、メインビューは前の
`report` を出したままで、吹き出しは空にならず前のセリフを保っている
ことを確かめる（`docs/architecture/screen-design.md` 13.9「バックグラウンドタスク」）。

**並列の段（`docs/architecture/display.md`「ワークプラン」）の描き方を確かめるときは、疑似セッションの場面
`work-strip-parallel`・`work-strip-parallel-ask`・`work-plan-parallel` を使う。** 前の2つは帯で並列の段の中の段の丸が
1つの囲みに並び今の段の丸がどれも弧を回すこと（お伺いでは囲みの中の丸がどれも「?」）、`work-plan-parallel` は
並列の段の中の段を後ろの番号から済ませて閉じ、帯が全部 ✓ になることと、最終レポートの段ごとの時間に
「並列 2–3」の壁時計の行と字下げした中の段の行が出ることを見る（`docs/architecture/screen-design.md`
「進み具合の帯」「レポートの頭（合図の行）」）。

**ワークプランを止めて閉じたときと、段の所要が測れないときの描き方を確かめるときは、疑似セッションの場面
`work-plan-stopped`・`work-plan-phase-unknown` を使う。** `work-plan-stopped` は段2の途中で
`task.outcome` が `stopped`・`workPlanClosing: "stopped"` の `report` で閉じ、帯のチップが「止めた」になること、`work-plan-phase-unknown` は
段2を一度も今にしないまま閉じ、最終レポートの段ごとの時間で段2が「不明」になることを見る
（`docs/architecture/display.md`「ワークプラン」）。

**書き終わりの知らせ（`docs/architecture/screen-design.md` 13.10「書き終わりの知らせ」）を確かめるときは
疑似セッションの場面 `diary-written`（`TSUKUMO_FAKE_SCENE=diary-written`）を使う。** `diary-requested`
→ `diary-drafting` → `diary-stage`（`write` → `pick`）→ `diary-written` と流れ、成果の画面
（`#achievement?date=2026-09-20`）でも会話の画面でも画面の下中央に札が出ることと、「日記帳で開く」で
その日の見開きが開くこと、× で消えて再読み込みするまで戻らないことを見る。日記の中身（本文・
しおり）も見るときは、`~/.tsukumo/diary/<リポジトリ>/2026-09-20.json`（`TSUKUMO_HOME` を
分けていればその下。置き場の形は `src/server/diary/adapter/diary.ts`）に架空の日記を1件置いてから
起こす——fake driver は `diary` ツールの中身を持たないので、置かなければ手続き `achievement.day` の
その日は「日記が無い」のまま。**この置く手間ごと `capture-catalog.ts` の `diary-book` 件がやる**
（次の段落）ので、見開きを撮るだけなら手で置かなくてよい。`diary-book` 件は「日記帳で開く」を
押したあと、見開きの本文が現れるまで待ってから撮る（`achievement.day` が返るまで見開きは
「…」のまま。本文が現れなければ撮らずに落ちる）。

**帯の「いまの作業」の実行中・失敗・バックグラウンドタスク、表情やキャラクターを消す確認のモーダル、
日記帳の見開きは、`capture-catalog.ts` に専用の件があるのでそれぞれ手で操作を当てなくてよい**
（`--only <名前>` で1件だけ撮れる）。`current-work-running` / `current-work-failed` は、
名指しで直接起こしても状態が出るよう**自分の `request` を持つ場面**
（`test/fixture/fake-session.json` の同名の場面）を使う——`request` の無い場面は
`src/shared/session/turn-step.ts` の `currentTurnSteps` が「依頼が一度も無い」に畳んで、途中の
`tool-started` があっても帯の一覧に出ない。`current-work-background` は既存の `background-task`
場面をそのまま使う。`portrait-clear-confirm` / `character-delete-confirm` /
`diary-book` は**件専用の隔離ホーム**（`--out` の下の `home/`）を使う——`HomeSetup`
（`scripts/capture/capture-catalog.ts`）が、消せるキャラクターパック（同梱の `chou` を別名でコピー）や
架空の日記を、撮る前にそこへ書く。**既定のホーム（利用者の `~/.tsukumo/`）には触らない。**

**fake driver の質問の場面を Playwright で自動操作すると、`turnInProgress` が解けないまま残る
ことがある**（再現条件は分かっておらず、手で触ったときには起きていない。操作側の問題の
可能性もある）。そのときは疑似セッションの `opening` に質問を足して、開いた時点で出す形で
確かめる。もう一度踏んだら条件を書き足す。

**目視用の合成 PNG（縦に長い図・明るい帯・目盛りなど）は、作業ツリーの外で組む。** スクリプトは Write ツールで `/tmp/<名前>/` の絶対パスに置き、PNG は stdout へ出して、作業ツリーの外の絶対パスへのリダイレクトで受ける。

```bash
# 通った形（書き先が絶対パスで、作業ツリーの外）
node /tmp/<名前>/make-png.mjs > /tmp/<名前>/band.png
```

止まった形は、書き先を変数で決める形（`OUT=/tmp/<名前>/band.png; node /tmp/<名前>/make-png.mjs > "$OUT"`）。`deny-sed-in-place` の hook が、展開しないと書き先が分からないものを作業ツリーへの書き込みとみなして `Bash` の段で止める。書き先を絶対パスで書けば通る。`cd <作業ツリー> && node …` の前置きは、書き先が絶対パスなら止まらない。
