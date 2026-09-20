# 調査: モバイルの orca から tsukumo に届くか（2026-09-20）

**この文書は提案であって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには作らない。
採るかどうかを決めたら、決まったことだけを正典（`docs/requirements.md` 2.2 / 5章、
`docs/architecture.md`、`docs/design.md` 9章）へ反映し、この文書は経緯として `docs/research/` に残す。

**調べた対象**: Orca v1.4.204（`orca --version`）と `main` の `6250947`。
**調べ方**: `orca` の読み取り専用コマンドと、Orca.app の同梱物（`app.asar` / `app.asar.unpacked`）と、
この Mac の Orca の設定ファイル。**実機（スマホ）では試していない**ので、最後の一歩は目視で確かめる
余地が残る。

## 結論（3行）

1. **モバイルの orca は「この Mac の Orca runtime にペアリングした薄い遠隔クライアント」**であって、
   スマホ側で Web ページを描くブラウザではない。ブラウザタブは `browser.screencast` の画像
   （JPEG フレーム）として送られ、タップ・キー入力が `browser.mouse*` / `browser.keypress` で戻る
2. **だからタブの中の `127.0.0.1` は Mac を指す。** ページを描くのは Mac の Orca の Chromium なので、
   `BIND_HOST` を変えなくても tsukumo には届く見込みがある（＝ tsukumo 側の変更は要らない）
3. **推奨は (a) orca のリモートの仕組みに乗る**（コード変更なし）。ただし今のペアリングは
   `automatic`（Orca Relay 経由）なので、要件 2.2 の「会話内容の外部送信」の線を厳しく引くなら
   **ペアリングを `local-only`（同じ Wi‑Fi / Tailscale の直結）に切り替える**のが条件になる

---

## 1. モバイルの orca は何を指すのか

### 1.1 `orca` のコマンドから分かったこと

| 実行したコマンド                 | 出力の要点                                                                                                                                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orca --version`                 | `1.4.204`                                                                                                                                                                                                                                                            |
| `orca host list`                 | `local  this machine  darwin  ->  --host local` の1行だけ。SSH ターゲットも、ペアリング済みの Orca サーバも無い                                                                                                                                                      |
| `orca environment list`          | `No saved environments.`                                                                                                                                                                                                                                             |
| `orca host list --help`          | 「targetable machine は3種類。**paired Orca server は接続で `--environment <name>`**、**SSH target は `--host ssh:<id>`**」                                                                                                                                          |
| `orca --help`（Common Commands） | `orca serve [--port <port>] [--pairing-address <host>] [--mobile-pairing] [--no-pairing] ...`                                                                                                                                                                        |
| `orca serve --help`              | 「`--mobile-pairing` で**モバイル向けのペアリング QR / リンク**を出す（既定の runtime-environment 用のリンクの代わりに）」「`--pairing-address` は**クライアントに知らせるアドレスだけ**を変える。LAN・Tailscale・SSH 転送・リバースプロキシで届く endpoint を使う」 |

**ここで `environment` とモバイルは別物だと分かる。** `environment add` は「**別のマシンの Orca runtime を
CLI から操作する**」ための保存先で、`orca environment list` が空＝この Mac はどの runtime にも繋いでいない。
モバイルはその逆で、**スマホ側が この Mac の runtime に繋いでくる**側にいる。

### 1.2 runtime が自分で名乗っている能力

`orca status --json` の `result.runtime.capabilities` に次が並んでいる（抜粋）:

```
mobile.tasks.v1
browser.screencast.v1
browser.clientHost.v1
browser.clientHost.automation.v1
network.browserTunnel.v1
notifications.remote-push.v1
terminal.multiplex.v1
workspace-ports.v1
```

`target.kind` は `local`、`app.running: true`、`runtime.connectionState: "connected"`。
**この Mac の Orca が runtime 本体で、モバイル向けの口（`mobile.*`）と画面配信（`browser.screencast`）を
持っている。**

### 1.3 スマホがすでに1台ペアリングされている

`~/Library/Application Support/Orca/orca-devices.json`（Orca のデバイス登録簿）に**1件**あり、
秘密でないフィールドだけを見ると:

```
scope: "mobile"
pairingReach: "network"
mobilePairingConnectionMode: "automatic"
（ほかに token / relayBinding / pushRegistration を持つ。中身はここに書かない）
```

**つまりモバイルのクライアントは「あるかどうか」ではなく、この Mac ではもう繋がっている。**
`~/.orca/` には `agent-hooks/` しか無く、ペアリングの状態はこちら（アプリのデータ）側にある。

### 1.4 モバイルは何を呼んでよいか（runtime 側の allowlist）

`app.asar` の中に、**`scope === "mobile"` の端末だけに適用される RPC の allowlist** がある。
外れたメソッドは `forbidden: Method '<name>' is not available to mobile clients` で弾かれる。
数えると **289 メソッド**。この調査に効く分の在否:

| メソッド                                                                                     | モバイルに許されているか |
| -------------------------------------------------------------------------------------------- | ------------------------ |
| `browser.screencast` / `browser.screencast.unsubscribe`                                      | **許可**                 |
| `browser.goto` / `browser.tabCreate` / `browser.reload` / `browser.back` / `browser.forward` | **許可**                 |
| `browser.mouseClick` / `mouseDown` / `mouseUp` / `mouseMove` / `mouseWheel`                  | **許可**                 |
| `browser.keypress` / `browser.keyboardInsertText` / `browser.viewport`                       | **許可**                 |
| `session.tabs.list` / `activate` / `move` / `subscribe` ほか                                 | **許可**                 |
| `terminal.multiplex` / `terminal.send` / `terminal.read`                                     | **許可**                 |
| `browser.clientHost.attach`（ページを自分で描く側になる口）                                  | **不許可**               |
| `network.browserTunnel`（ページの通信を別ホストへ流す口）                                    | **不許可**               |
| `workspacePorts.scan`（待ち受けポートの一覧）                                                | **不許可**               |

同梱物の側にも裏が取れる: `app.asar` には `MobilePage-*.js`（モバイル用のページ）があり、
`app.asar.unpacked/out/shared/` には `mobile-relay-phone-protocol.js` /
`mobile-pairing-connection-mode.js` / `mobile-e2ee-v2-contract.js` / `mobile-push-contract.js` などが
実ファイルで置いてある。画面配信の実装側にも `cancelMobilePage(...)`、
subscription に `drivesAsMobile` という印がある。

---

## 2. タブの中の `127.0.0.1` はどのマシンを指すか

**答え: runtime のあるマシン、つまりこの Mac。**

理由は、**モバイルはページを描かないから**である。モバイルに許された browser 系のメソッドは
「**描かれた結果を受け取る**（`browser.screencast`）」と「**入力を送る**（`mouse*` / `keypress` /
`keyboardInsertText` / `viewport`）」の2種類しかなく、ページを描く側になる口
（`browser.clientHost.attach`）は**弾かれる**。ページを描くのは Mac の Orca の Chromium なので、
そのページが出す HTTP も WebSocket も Mac の中で完結する。**`http://127.0.0.1:<port>/?t=<token>` は
tsukumo のサーバにそのまま着く。**

紛らわしいのが「client-hosted page」という別の仕組みで、これは**デスクトップの Orca が
リモートの runtime に繋いでいるとき**に、ページをデスクトップ側で描く配置である
（`placement.kind === "client"`。同梱物のメッセージ: _"Client-hosted browser pages require an
authenticated paired runtime."_）。この配置は**画面配信と両立しない**
（_"Client-hosted browser pages do not support server screencast."_）。モバイルはこの配置になれないので、
**モバイルが見るページは必ず runtime 側で描かれたもの**になる。
`orca skills get orca-cli --reference browser` の注記もこの2つの配置を区別している
（「client-hosted なページは**ペアリング先のデスクトップのブラウザエンジン**で描かれるので、
そのデスクトップが落ちていると `browser_host_unavailable` になる。server-hosted なページは
デスクトップ無しで動く」）。

**この Mac で `orca tab create` が作るタブは server-hosted**（`orca tab create --help` に placement の
フラグが無く、client 配置は「ペアリング済みの runtime への認証」が要る＝リモート接続時の話）。
`showView`（`src/server/adapter/orca-host.ts`）が開くタブもこれに当たる。

### 2.1 それでも実機でしか分からないこと

- **モバイルの UI が browser のタブを選べるか。** 仕組みとしては揃っている
  （`session.tabs.list` → `listMobileSessionTabs`、タブの行に `tabType: "browser"` がある、
  デバイスごとの選択を覚える `mobileClientTabSelectionsByDeviceId` がある）が、
  実際に一覧に出て選べるかは画面を見ないと分からない
- **入力欄が使えるか。** 文字は `browser.keyboardInsertText` で入るはずだが、日本語入力・送信キー・
  `@` 補完の当たり判定はやってみないと分からない
- **画面の縦横**（これは別タスクの領分なのでここでは扱わない）
- **URL を打ち直す必要があるか。** tsukumo が起動時に Mac 側でタブを開いてくれるので、
  モバイルからは**そのタブを選ぶだけ**で済むはず。手で URL を打つ道
  （`browser.goto` はモバイルに許されている）もあるが、その場合は起動トークンを手で運ぶことになる

---

## 3. 到達の道の比較

|                       | (a) orca のリモートの仕組みに乗る                                                                                                                                                       | (b) `BIND_HOST` を選べるようにして LAN に出す                                                                                                                                             | (c) SSH のポート転送など tsukumo の外で解く                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **前提**              | モバイルが runtime の画面配信を見る薄いクライアントであること（2章）。Mac の Orca が起きていること                                                                                      | スマホ側のブラウザが直接 tsukumo を引けること。スマホと Mac が同じネットワークにいること                                                                                                  | スマホから Mac へ SSH できること。スマホ側にポート転送のできるクライアントがあること                                                                     |
| **要る設定**          | **tsukumo 側はゼロ。** Orca のペアリング（済み）と、モバイルでそのタブを選ぶ操作だけ                                                                                                    | `BIND_HOST` を環境変数で選べるようにする実装（新規）＋ Mac のファイアウォール＋ URL とトークンをスマホへ運ぶ手段                                                                          | Mac の sshd を開ける＋鍵の用意＋スマホ側のアプリ。tsukumo 側はゼロ                                                                                       |
| **リスク**            | Relay 経由だと画面の画素が Orca の relay を通る（E2EE だが Mac の外へ出る）。モバイル側の見え方が未確認。Orca の実装に乗るので仕様変更に追従が要る                                      | **守りがトークン1つのままでは足りなくなる**（下の4章）。平文 HTTP なので LAN 上で覗ける。`0.0.0.0` を撒く実装は事故の温床                                                                 | 設定が重い。スマホ側の SSH クライアントに依存する。tsukumo の外なので壊れたときの切り分けが増える                                                        |
| **要件 2.2 との整合** | **「箱を Orca 以外に用意すること」に当たらない**（箱は Orca のまま）。**「会話内容の外部送信」は `local-only` なら当たらない**が、`automatic`（Relay）だと暗号文とはいえ Mac の外を通る | 箱は「スマホのブラウザ」になるので**「箱を Orca 以外に用意すること」に当たる**。配信先が `127.0.0.1` でなくなるので、5章「会話は tsukumo のプロセスの外へ出さない」の記述も書き換えが要る | 箱はスマホのブラウザなので (b) と同じく**「箱を Orca 以外に用意すること」に当たる**。ただし経路は暗号化された1対1で、tsukumo は `127.0.0.1` に配ったまま |

補足: (a) のうち Relay を使わない `local-only` は、同じ Wi‑Fi か Tailscale でスマホと Mac が
直接繋がる形になる（Orca 自身の案内も _"Use LAN (Tailscale or same Wi‑Fi) or retry Relay"_）。
いまのこの Mac の設定は `automatic` なので、そのままだと Relay 側に倒れる。

---

## 4. 守りをトークン1つのままでよいか

`src/server/adapter/server.ts` 冒頭の割り切りは「**バインド先は `127.0.0.1` だけ**」＋
「起動トークンが `/repository-file` と `/ws` を守る」で、**同じマシンの別プロセスしか届かない**ことが
前提になっている。

- **(a) を採るなら前提は変わらない。** tsukumo は `127.0.0.1` に listen したままで、外から来るのは
  Orca の画面配信だけ。守りは Orca のペアリング（デバイストークン＋E2EE）に乗る。**トークン1つのままでよい**
- **(b) を採ると前提が崩れる。** ページ本体・同梱物・キャラクター素材は**いまトークンを求めていない**
  （会話を含まないので、という割り切り）。LAN に出すとこの3つは誰でも引ける。会話そのものは `/ws` が
  守るが、URL に `?t=` が載る形なので、QR や共有の過程で漏れれば会話に届く。**平文 HTTP なので
  LAN 上で盗み見られる。** (b) を採るなら、トークン1つの割り切りを引き直すところからになる
- **(c) は転送の先が `127.0.0.1` のままなので、守りは SSH の鍵に委ねられる。** tsukumo 側の前提は変わらない

---

## 5. 会話内容の扱いとの線引き

`docs/coding-standards.md`「会話内容の扱い」は**このリポジトリで最優先の規約**で、
「外部に送らない」「別の場所に複製しない」「ビューは `127.0.0.1` にだけ配る」と書いてある。
道ごとに線を引くと:

- **(a) `local-only`**: tsukumo は `127.0.0.1` にしか配らない。画素が同じ LAN のスマホへ E2EE で渡る。
  **tsukumo が経路を足していないので、規約の文面には触れない**
- **(a) `automatic`（Relay）**: 画素は暗号化されて Orca の relay を通る（`orca-mobile-e2ee` v2。
  X25519 の鍵交換＋ transcript に紐づけた枠で、relay は暗号文しか見ない）。それでも**バイト列は
  Mac の外に出る**ので、2.2 の「会話内容の外部送信・クラウドへの保存」を厳しく読むなら引っかかる。
  **ここは判断が要る**
- **(b)**: tsukumo 自身が `127.0.0.1` 以外へ配るので、**規約の文面をそのまま書き換えることになる**
- **(c)**: tsukumo は `127.0.0.1` に配ったまま。転送はホストの外側の話

**なお、(a) は tsukumo が作る新しい経路ではない。** Orca は既にターミナルの中身
（＝ claude との会話そのもの）を同じペアリングでスマホへ流している（モバイルの allowlist に
`terminal.multiplex` / `terminal.read` がある）。この線は**tsukumo がどう作るかではなく、
利用者が Orca をどう設定するか**の側にある。

なお通知については、押し出される情報は `needs-input` / `finished` の2状態と発生源
（`agent-task-complete` / `terminal-bell` / `plugin`）だけで、**会話の文面は乗らない**
（同梱の `mobile-push-contract.js` の注記: _"The only two states a phone can be told about"_）。

---

## 6. 推奨

**(a) orca のリモートの仕組みに乗る。** ただし採るなら、ペアリングを `local-only` に切り替えたうえで
実機で1回確かめる。

理由:

1. **tsukumo のコードを1行も変えずに済む可能性が高い。** 2章のとおりタブの `127.0.0.1` は Mac を指すので、
   `BIND_HOST` も `showView` も触らない。要件 2.2 の「箱を Orca 以外に用意すること」にも当たらない
   （箱は Orca のまま）
2. **守りの割り切りを引き直さずに済む**（4章）。(b) は「同じマシンの中だから」という前提を壊すので、
   トークン1つの設計から考え直すことになり、**そこまでの価値がこの目的には無い**
   （目的は「キャラクターと一緒に楽しく仕事をする」であって、リモート開発環境ではない）
3. **(c) は tsukumo の外で完結するので安全側だが、設定が重く、箱がスマホのブラウザになる。**
   立ち絵・吹き出し・入力欄が Orca のタブの中にあるという前提（`docs/requirements.md` 4.7）から外れる
4. **`local-only` を条件にするのは、2.2 の一行が「会話内容の外部送信」を名指ししているため。**
   E2EE で relay が中身を見られないとしても、「外に出さない」と書いてある規約の側を曲げるより、
   **Orca の設定を絞るほうが安い**

## 7. 採るなら次に確かめること（別タスクの種）

コードは要らないが、**実機での目視が1回要る**。並べておく:

1. Orca の設定でモバイルのペアリングを `local-only` に切り替える（今は `automatic`）
2. Mac で `tsukumo` を起こし、Mac 側にタブが開いた状態にする
3. スマホの Orca でそのワークスペースを開き、**ブラウザのタブの一覧に tsukumo のタブが出るか**を見る
4. 出たら、**立ち絵と吹き出しが描かれるか**（画面配信の画質で読めるか）を見る
5. 入力欄に日本語を入れて送れるか（`browser.keyboardInsertText` 経由）を見る
6. ここまで通ったら、残るのは**モバイル幅のレイアウト**だけになる（別タスクの領分）

**ここまでは対話的な操作なので、この調査ではやらない。**
