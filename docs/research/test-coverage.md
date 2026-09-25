# テストカバレッジの棚卸し: 消せるテストと、埋める穴（2026-09-20）

**この文書は提案であって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには作らない。
判断の基準は `docs/coding-standards.md`「テスト」節（「カバレッジに閾値を設けない」「消すかどうか」
「足すかどうか」）が正典で、**ここはその表を実物に当てた結果だけ**を置く。基準そのものは作り直して
いない。実施（消す・足す）は別の作業で、この文書は決めるところまで。

**結論（3行）**

1. **消す候補はテスト1件だけ**（`resolveOutfit` の重複したモデルID）。ほかに「その行だけ消す」
   assertion が3件。洗った 725 件のうち、丸ごと消せるものはこれ以上出なかった
2. **埋める穴は6件**（エラー方針の分岐4・要件が明示したフォールバック2）。いずれも境界を偽装せずに
   到達できる
3. **埋めないと決めた穴が約55行ぶん**ある。内訳は外の世界の境界・描画・到達不能な防御的コード・
   「同じ方針を別の入口で既に守っている」分岐で、下の「埋めないと決めた穴」に理由を1行ずつ書いた

## 取り直したカバレッジ（2026-09-20 実測）

`bun test --isolate --coverage`。**725 pass / 0 fail / 1464 expect / 72ファイル**、
**全体 94.11% funcs / 94.48% lines**。

行が9割を切るのは次の12ファイル（タスク本文の表は 701 pass 時点・旧パスのものなので、こちらが新しい）:

| ファイル                                                    | % Funcs | % Lines |
| ----------------------------------------------------------- | ------: | ------: |
| `src/browser/lib/socket.ts`                                 |    0.00 |    6.56 |
| `src/server/adapter/sdk-driver.ts`                          |    6.25 |   12.02 |
| `src/browser/stores/session.tsx`                            |   84.21 |   57.27 |
| `src/browser/features/main-view/markdown/chart-block.tsx`   |   80.00 |   62.16 |
| `src/server/adapter/tsukumo-home.ts`                        |    0.00 |   75.00 |
| `src/browser/features/main-view/markdown/mermaid-block.tsx` |  100.00 |   78.95 |
| `src/browser/features/main-view/turn.tsx`                   |   77.78 |   78.38 |
| `src/server/adapter/fake-driver.ts`                         |   78.95 |   79.00 |
| `src/browser/lib/refresh.ts`                                |  100.00 |   81.82 |
| `src/shared/repository-file.ts`                             |  100.00 |   83.33 |
| `src/browser/components/domain/layout/split.ts`             |  100.00 |   86.49 |
| `src/browser/lib/data-url.ts`                               |   75.00 |   88.89 |

**報告に1行も出ないファイル**（テストから一度も読み込まれていない）は6つ:
`src/cli.ts`（`test/cli.test.ts` が**子プロセスで**起こすので計上されない）・`src/browser/main.tsx`・
`src/browser/components/domain/sidebar/sidebar.tsx`・`src/server/adapter/orca-host.ts`・
`src/server/adapter/ui-rebuild.ts`・`src/server/core/host.ts`（型だけで実行される行が無い）。

## 消す候補をどう見つけたか

「同じ入力分岐を別のテストが既に通している」を機械で当たりだけ付けるために、**テストファイルを1つずつ
抜いた 72 回のカバレッジ**（leave-one-out）を取り、全体の未到達行と見比べた。抜いても未到達行が
1行も増えないファイルは15個ある:

`test/architecture.test.ts`・`test/cli.test.ts`・`test/browser/components/ui/select.test.tsx`・
`test/browser/features/character-view/balloon-track.test.tsx`・
`test/browser/components/domain/layout/layout-resizer.test.tsx`・
`test/browser/features/main-view/markdown/notation.test.tsx`・
`test/browser/features/main-view/report.test.tsx`・`test/browser/stores/main-view-turn.test.ts`・
`test/server/adapter/vendor-asset.test.ts`・`test/server/core/report-notation.test.ts`・
`test/shared/character.test.ts`・`test/shared/portrait-image.test.ts`・
`test/shared/portrait-motion.test.ts`・`test/shared/turn-speech.test.ts`・`test/shared/utterance.test.ts`

**ただしこれは消す理由にならない。** 規約の表がそう決めている（「そのテストを外しても到達行・分岐が
減らない」は**それだけでは消す理由にしない**）。実際この15個は、どれも**同じ振る舞いを上位が別の入力で
通しているだけ**で、純粋な関数の契約そのものを固定しているのはこちらだけだった
（例: `utterance.test.ts` は行頭マーカーの切り出しを直接、`session-state.test.ts` は畳み込みの結果として
見ている）。`cli.test.ts` は子プロセスで起こすので、そもそも計上されない側の事情。

なので**この指標は「どこを読むか」を絞るのにだけ使い**、消す/残すは読んで判断した。

## 消す候補

### テスト1件

| ファイル                         | テスト名                         | 代わりに守っているテスト                                                                                                    |
| -------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `test/shared/expression.test.ts` | `fable の完全なモデルIDでも拾う` | 同ファイルの `完全なモデルIDに含まれていても拾う`（`claude-opus-4-1-20250805`）と `fable は opus と同じ戦闘配置`（`fable`） |

理由: `resolveOutfit` は `OUTFIT_BY_MODEL_SUBSTRING` を1回 `find` するだけで、短い別名も完全なモデルIDも
**同じ1本の分岐**を通る（`src/shared/expression.ts`）。`claude-fable-5-1` は「完全なモデルIDでも拾う」と
「`fable` は heavy」の積でしかなく、その2つはそれぞれ別のテストが固定している。後者の2件には
**部分一致にしている理由のコメントも付いている**ので、説明の置き場所としても残るのはそちら。

### 行1つだけ消す候補（テストは残す）

いずれも「型が既に保証している性質を実行時に確認している」に当たる assertion で、**同じテストの中の
残りの行が本体**。テストごと消す理由は無い。

| ファイル:行                                                    | 消す行                                                                      | 代わりに守っているもの                                                                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test/server/core/session-launch.test.ts:107`                  | `expect(driver).toBeDefined()`                                              | `createSessionLaunch` の戻り値は `Promise<SessionDriver>` で `undefined` を取らない（型）。同テストの `harness.calls` の並びが本体                           |
| `test/browser/components/domain/sidebar/activity.test.tsx:100` | `expect(container.querySelector("details.activity-failure")).toBeDefined()` | `querySelector` は無いとき `null` を返し、`null` は `toBeDefined()` を**通る**ので常に真。直後の2行（`pre.activity-failure-input` / `-output` の中身）が本体 |
| `test/server/adapter/sdk-driver.test.ts:70`                    | `expect(MODEL_ALIASES).toContain(DEFAULT_MODEL)`                            | 直前の `toEqual(["opus", "sonnet", "haiku", "fable"])` と、同ファイルの `既定のモデル（opus）と既定の effort（medium）を渡す` が既に固定                     |

### 候補から外したもの

「代わりに守っているテスト」を添えられなかったので外した。

- `test/shared/character.test.ts` の `素材の版が違えば、同じパック・同じファイル名でも URL が変わる` —
  `characterAssetCacheKey` の混ぜ方と `toCharacterInfo` の `pack` の配線は別のテストが固定しているが、
  **`toCharacterInfo` が `revision` を `characterAssetCacheKey` に渡していること**を守るのはこれだけ。
  消すと引数を落としても誰も落ちない
- `test/browser/components/domain/sidebar/session-info.test.tsx` の `model が opus のみを含むとき、fable を誤って
選択しない` / `model が sonnet / haiku のとき、fable を誤って選択しない` — 同じ分岐を通るが、
  **`fable` の誤選択の回帰テスト**なので規約の表では「残す」側
- `test/browser/features/main-view/markdown/markdown.test.tsx` の CJK の強調の一群（6件）— 同じ
  プラグインの同じ分岐だが、これも回帰テスト（記法のまま出た事故）
- 上の leave-one-out で挙がった15ファイル — 到達行が減らないだけで、積極的な理由が無い

## 埋める穴

規約の「足すかどうか」の2類型に当たるものだけ。**いずれも境界を偽装せずに到達できる**
（駆動はテスト用のスタブを差せる／`ViewServer.httpServer` が外に出ている／純粋な関数）。

### 類型1: エラー方針の分岐

| ファイル:行                                  | 未到達の分岐                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/server/core/session-manager.ts:331-332` | 駆動が例外を投げたとき `driverFailed` を返し、常駐プロセスを落とさない（`docs/requirements.md` 5章「SDK のセッションが終わったり落ちたりしてもプロセスは生き、画面はその事実を出す」）。`FRAME_ERROR_REASON.driverFailed` はどのテストからも一度も出てこない |
| `src/server/core/session-manager.ts:236`     | `switch-character` で起こし直しに失敗したときも同じ理由を返す（前の駆動を閉じたまま止まらない）                                                                                                                                                              |
| `src/server/core/session-manager.ts:258`     | キャラクターへの書き込みが**例外を投げた**ときも定型文の理由を返す（`undefined` を返す経路は `書き込みが受け付けられなかったら定型文の理由を返し、状態は動かさない` が既に通っている）                                                                       |
| `src/server/adapter/server.ts:134,136`       | listen 後にビューサーバが `error` を投げたとき、stderr に1行書いて**続ける**。未処理のままだと常駐プロセスが落ちる側に倒れる                                                                                                                                 |

### 類型2: `docs/requirements.md` が明示している振る舞い

| ファイル:行                                              | 未到達の分岐                                                                                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/repository-file.ts:22`                       | 届いた値が配列でないときは空を返す（4.2「表示できないものがあっても残りを表示して動作を続ける」）。**この 1ファイルには対応するテストファイルが無い** |
| `src/browser/components/domain/layout/split.ts:41,52-54` | 保存された比率が**まだ無い**（初回起動）・読めない・可動域の外のときは `DEFAULT_SPLIT` に落ちる（同 4.2）                                             |

## 埋めないと決めた穴

次にカバレッジを見た人が同じ調査を繰り返さずに済むように、理由を1行ずつ残す。

### 外の世界の境界（1ファイル = 1つの境界。原則3）

| ファイル                               | 未到達                | 埋めない理由                                                                                                                                        |
| -------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server/adapter/sdk-driver.ts`     | 78-126 ほか（12.02%） | Agent SDK の境界。到達させるには**本物の claude を子プロセスで起こす**ことになる。純粋な部分（`buildQuerySeedOptions`）は既に切り出して守っている   |
| `src/browser/lib/socket.ts`            | 32-95（6.56%）        | WebSocket の境界。再接続の間合いまで含めて `WebSocket` そのものを偽装しないと通らず、偽装したら確かめているのは偽物のほう                           |
| `src/server/adapter/orca-host.ts`      | 全体（報告に出ない）  | ホストの境界。**ファイル冒頭に既に「境界のテストを除き自動テストの対象にしない」と書いてある**。`orca` が動いていないと挙動そのものを確かめられない |
| `src/server/adapter/session-socket.ts` | 137, 154, 158         | `ws` の境界。分割して届いたフレームの連結と送信失敗は、`ws` の内部を触らないと起こせない                                                            |
| `src/browser/lib/data-url.ts:14`       | `reader.onerror`      | `FileReader` の失敗は境界を偽装しないと起こせない。読めなかった1枚を諦める方針自体はファイル冒頭に書いてある                                        |
| `src/server/adapter/ui-rebuild.ts`     | 全体（報告に出ない）  | `fs.watch` の境界。開発中だけ動く（`TSUKUMO_WATCH_UI`）                                                                                             |
| `src/browser/main.tsx`                 | 全体（報告に出ない）  | ブラウザ側の入口（`createRoot`）。DOM に挿す1回だけの配線                                                                                           |

### ホームやパスを組み立てるだけの関数

`src/server/adapter/tsukumo-home.ts:14`・`src/server/adapter/character-pack.ts:95,103`・
`src/server/adapter/remembered-character.ts:64`。**テストは常に置き場所を注入している**ので、
残った既定の1行を通しても `join(homedir(), ...)` という実装をなぞるだけになる（規約の「実装の内部構造を
なぞるだけ」を、書く前に踏まない）。

### 描画（目視で確かめる）

| ファイル                                                    | 未到達               | 理由                                                                                                                           |
| ----------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/browser/features/main-view/markdown/chart-block.tsx`   | 28-41                | Chart.js を読み込んで `<canvas>` に描く本体。振り分け（`.chart-block > canvas` に来ること）は `markdown.test.tsx` が守っている |
| `src/browser/features/main-view/markdown/mermaid-block.tsx` | 51-58                | `mermaid.initialize` のテーマ設定。図が出ているかは目視                                                                        |
| `src/browser/features/main-view/markdown/mermaid-block.tsx` | 108-111              | 失敗の理由の文字列の取り出し。**エラーメッセージの文面だけが変わる分岐**                                                       |
| `src/browser/lib/refresh.ts:17-18`                          | `page` の側          | `window.location.reload()`。**テストファイルの冒頭に既に理由が書いてある**（借りている DOM では確かめられない）                |
| `src/browser/components/domain/sidebar/sidebar.tsx`         | 全体（報告に出ない） | 3つの区画を並べるだけの組み立て。中身は `activity` / `task-list` / `session-info` の各テストが守っている                       |

### 到達不能な防御的コード

`src/server/adapter/character-edit.ts:166,245`（**コード側に「ここで undefined になるのは配線の誤りの
ときだけ」と書いてある**。検証は `src/shared/command.ts` の境界で済んでいる）・
同 `114-115`（必須の立ち絵が書けなかったときの後始末。同じ「定義の無いディレクトリを残さない」は
`立ち絵を書けなかったら、定義の無いディレクトリを残さない` が別の経路で通している）・
`src/server/adapter/vendor-asset.ts:63-64`（同梱物が読めない。`bun install` 済みが起動時の前提）・
`src/server/adapter/server.ts:320`（`listen` 後のアドレスが想定の形でない）・
`src/browser/features/character-screen/appearance-color.ts:43` と
`src/browser/components/domain/layout/split.ts:37`（`localStorage` が**投げる**。プライベートウィンドウ限定で、
「値が無い・読めない」側は上の「埋める穴」に入れてある）。

### 同じ方針を別の入口で既に守っている分岐

- `src/browser/features/dispatch/composer.tsx:239-243` — フォームの送信でも進行中は送らない。同じ
  ガードを鍵盤の側（`turnInProgress の間に Command+Enter を押しても送らない`）が通している
- `src/browser/components/domain/layout/layout.tsx:120,123` — 3本ある仕切りのうち、テストで掴んでいない1本の
  コールバック。同じ経路を別の仕切りで通している
- `src/browser/features/main-view/turn.tsx:73` — `Step` の中の質問の記録。**`main-view.test.tsx` に
  「`QuestionRecord` を直接見る」と理由が書いてある**
- `src/server/adapter/task-summary.ts:77-78`・`src/server/adapter/character-edit.ts:81` — 読み書きの
  catch。同じ結果（`undefined` を返して諦める）を「ファイルが無い」「形が違う」側が既に通している

### どちらの類型にも当たらないもの

- `src/browser/stores/session.tsx:158-198`（`SessionProvider`）— `connectSessionSocket` に直に
  繋がっているので、埋めると**自分たちのモジュールをモックする**ことになる
  （`docs/coding-standards.md`「モックするのはシステム境界だけ」）。畳み込み自体は
  `createSessionStore` を直に使う `test/browser/stores/session.test.tsx` が守っている
- 同 `143-145`（接続状態の伝播）・`206-208`（Provider の外で呼んだときの例外）
- `src/browser/features/main-view/turn.tsx:117`（2000文字を超えた依頼の切り詰め）・`135-151`
  （複数行の依頼を `<details>` にする）— どちらも `docs/requirements.md` には無く、`docs/design.md` と
  コードのコメントにある取り決め。**足すなら先に要件側へ書く**のが順序
- `src/server/adapter/fake-driver.ts:155-199`（`interrupt` / `setModel` / `setPermissionMode`）— 目視確認と
  Playwright のための代役で、守るべき契約は本物の駆動（`src/server/core/session-driver.ts`）の側
- `src/server/core/sdk-message.ts:172,199,219,257,265`・`src/shared/main-view.ts:378`・
  `src/shared/portrait-image.ts:40` ほかの「読めない値は空文字・`undefined`」— 同じ関数の別の入口で
  同じ結果を既に固定している

## 付記（この作業の範囲外）

テスト名に**タスク番号が残っている**ものが `test/shared/main-view.test.ts` の回帰テストと
`test/browser/features/main-view/main-view.test.tsx` の対応する回帰テストにある。
`CLAUDE.md`「コーディング規約」の「コード・ドキュメントにタスク番号を書かない」に反するが、
ここではテストに手を入れないので直していない。
