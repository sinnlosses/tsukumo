# アーキテクチャ詳細: 動きの流れ

ステータス: **正典**。入口は `docs/architecture.md`（全体構造の入口と、子のファイルの一覧）。

責務: 起動・接続・依頼・答え待ち・再接続の順序を持つ。
読む時: 起動や接続の段取り、依頼や答え待ちがどの順で流れるかを確かめたいとき。
直す時: 起動・起こし直し・接続・依頼・答え待ち・再接続の順序を変えたとき。

## 節の索引

| 節           | 中身                                                                     |
| ------------ | ------------------------------------------------------------------------ |
| ### 起動     | 起動の段取り0〜6と、起こし直しが同じ一続きを通ること、タスク一覧の見張り |
| ### 接続     | `hello` フレームと `events` フレーム                                     |
| ### 依頼     | `session.prompt` から `request` イベントまで                             |
| ### 答え待ち | `canUseTool` からお伺いの札と回答まで                                    |
| ### 再接続   | 指数バックオフで繋ぎ直し、`hello` の snapshot で置き換える               |

## 動きの流れ

### 起動

0. `cli.ts` が打った場所（cwd）のチェックアウトと自分の根を比べる。別のチェックアウトの中なら、
   そこの `bin/tsukumo` を同じ引数で子として起こし、終了コードとシグナルを伝えて終わる
   （`bin/tsukumo` が無ければ食い違いを出して止まる。外か同じ根なら下へ進む）
1. `cli.ts` が `config.ts` で環境変数を読み、`main.ts` の `run(config, launch)` を呼ぶ（`launch` は引数の `--dev`）
2. `main.ts` が**即時終了する前提**を3つ確かめる — ポート番号として読めるか（`port-resolution.ts`）、
   組み立て済みの成果物（`dist/browser/`。`docs/architecture/build.md`）を読めるか（ソースの指紋が組み立て時と違えば、止めずに1行
   知らせる）、fake driver なら疑似セッションを読めるか
3. `current-character.ts` が初期パック（指定されたもの・覚えていたもの・既定）を決める。
   **以降このパックの持ち回りはここに閉じる**
4. `view-delivery.ts` が**起動トークン**を1つ作り、`server.ts` を `127.0.0.1` で listen させる
   （`--dev` のときは Vite の開発サーバもここで差し込む。`docs/architecture/build.md`「作り直しを押す仕組み」）
5. `session-start.ts` が `session-manager.ts` にセッションを1つ作る。駆動は `TSUKUMO_DRIVER` が
   `fake` なら fake driver、それ以外は SDK。起動は常に新規のセッション（「セッションの復元と複数化」）
   （どちらも起こす組み立ての `src/wiring/session-launch.ts`）。起こしたセッションは
   `view-delivery.ts` の `connect` で `/ws` に繋ぐ
6. ホストのポートで `http://127.0.0.1:<port>/?t=<token>` を開く（失敗しても続行）

**起こし直し**（`session.switchCharacter` / `session.setChatMode` / `session.switchSession`）も、駆動を
起こす一続き（`session/core/session-launch.ts` の `createSessionLaunch`）は起動時とまったく同じものを
通る。違うのは `session-manager.ts` が `generation` を1つ進めて古い駆動のイベントを捨ててから同じ
一続きをもう一度呼ぶ、という外側だけ（「セッションの復元と複数化」）。一続きの中の順序（パックと記憶の状態 → 画面で選ばれた ID か新規か
→ 切り替え先の一覧 → 駆動 → 選ばれた ID なら履歴の再生 → 一覧の読み直し）は `createSessionLaunch` が正典。
切り替え先の一覧はメモリに持った一覧（`session-driver/core/session-catalog.ts`）から出し、
transcript の一覧を読み直すのは駆動を返したあとなので、起こし直しの `hello` はそれを待たない。
タスク一覧の見張り（`watchTaskSummary`）は一続きの外で `session-manager.ts` が1つだけ持ち、
起こし直しでは作り直さない。タスク一覧は作業ディレクトリのもので駆動1代の持ち物ではないので、
起こし直しの `hello` にもそれまでの一覧を載せる（画面を初期化しても一覧は空に戻らない）。
見回りは画面が購読しているあいだだけ回り（起動時の1回は購読なしでも読む）、Beads 方式では課題の変化の印が
前回と同じなら `bd list` を打たない（印は `bd vc status` の `commit`。印が取れないときは毎回打ち、同じでも60秒ごとに1回は読み直す）。
画面の ↻ は読み取りの手続き `repository.refreshTasks` を呼ぶ。見張りの `refresh` が見回りの周期を待たず1回読み
（実行中なら今の読みに乗る）、読み終えてから応答する。一覧は今までどおり `tasks-changed` で届き、応答が返るまでが画面の「読んでいる間」になる。

### 接続

1. ページが組み立て済みのスクリプトを読み、`<App>` が `/ws?t=<token>` へ接続して、購読の手続き
   `frame.subscribe` を呼ぶ
2. サーバは upgrade の前に Origin とトークンを確かめ、購読の最初に **`hello` フレーム**
   （`PROTOCOL_VERSION`・`SessionState` の snapshot・キャラクターの見せ方）を1つ流す
3. 以降、セッションで起きたイベントを **50〜100ms ごとにまとめた `events` フレーム**で押す。
   ブラウザは同じ `applySessionEvent` で畳む。**サーバとブラウザの `SessionState` は構造的に同じ**

### 依頼

1. Composer が手続き `session.prompt({ text, images })` を `/ws` の上で呼ぶ
2. サーバは契約の zod で検証し、断る条件（`meta`）を見てから `session` の行 → 駆動の `prompt(text)`。
   駆動が `request` イベントを起こし、それが `events` で戻ってくる（**ブラウザはローカルで
   echo しない**。ターンの開始はサーバのイベントで知る）
3. 断片（`partial-utterance`）は1バッチ内で連結して1件にする（転送量の抑制。畳み込みの結果は同じ）
4. 受け付けられないとき（検証に落ちた・断る条件に当たった・駆動が失敗を返した）は手続きの応答が
   エラーになる（断ったときは契約の `REFUSED` と定型文の理由）。**依頼の文面を含めない**

### 答え待ち

1. `canUseTool` → `pending-answer.ts` の列 → `pending-changed` イベント → 状態の `pending`
   （畳むときに届いた時刻 `askedAt` を打つ）
2. お伺いの札（`Inquiry`）が `pending[0]` を `useInquiryAnswer` で描く。答えたら `session.answer({ id, answer })`
3. 列が解決 → `pending-changed` → 札が消える。解決済みの id への回答は `REFUSED`

### 再接続

WebSocket が切れたらブラウザは指数バックオフで繋ぎ直し、購読し直して、**新しい `hello` の snapshot で状態を
置き換える**（差分の取りこぼしを気にしない。`lastEventId` での再開は使わない）。購読が終わった・投げた
ときも接続を閉じて同じ道で繋ぎ直す。プロセスが落ちている間は「接続が切れている」印を
Layout に出す。復帰したときにセッションを続きから起こし直す話は「セッションの復元と複数化」。
