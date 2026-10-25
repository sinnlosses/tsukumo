# `server.ts` を Hono に置き換える試算（2026-09-15）

**この文書は調査メモであって正典ではない。** 決定はしていない。`docs/` の他ファイルにある「節の索引」は
ここには作らない。

**問いの出どころ**: ユーザーの言葉「ライブラリやフレームワーク（hono.js など）は検討した？ 便利な
ライブラリがあるのに自作して消耗してない？」。`docs/research/architecture-rethink.md` は Next.js / Remix /
HTMX 一族を検討して退けたが、**Hono のような薄いルータは名前が出ていない**。

**対象コミット**: `main` の `5a89117`。`src/core/server.ts` は 431 行、`test/core/server.test.ts` は 19 件。

## 結論（3行）

1. **置き換えると `server.ts` は 431 行 → 約 280 行**。減るのは `writeHead` / `end` / 404 の定型と、
   listen とポート解決の手書き。**いま痛んでいる場所ではない**（`docs/research/architecture-proposal.md`
   の「痛んでいる兆候」に `server.ts` は経路名の再掲しか無い）
2. **本当の利得は行数ではなく、以前「パーサーが無いから」と退けた経路（multipart の POST）が
   使えるようになることと、トークン・`Origin` の照合が全経路で1つのミドルウェアになること**
3. **今は入れない。** 入れ時は「経路が5つを超える」「ファイルを HTTP で受けると決める」
   「Node（Electron）へ寄せると決める」のどれかが来たとき。入れるなら
   `docs/research/architecture-proposal.md` の段2（`adapter/` を切る）の後で、`adapter/server.ts` と
   `cli.ts` の配線だけを差し替える

## 前提の事実（一次情報）

| 項目                | 事実                                                                                                                                                                                            | 出典                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `hono`              | 4.13.8。**依存パッケージ無し**。unpacked 1.3 MB。`node >= 16.9`                                                                                                                                 | npm registry                          |
| `@hono/node-server` | 2.1.1。実行時の依存無し（peer に `hono ^4`。WebSocket を使うなら `ws` を自分で入れる）。`node >= 20`                                                                                            | npm registry / README                 |
| Node での WebSocket | `@hono/node-server` の `upgradeWebSocket` を使い、自分で作った `new WebSocketServer({ noServer: true, maxPayload })` を `serve({ websocket: { server } })` に渡す。**`@hono/node-ws` は非推奨** | hono.dev「WebSocket Helper」、README  |
| Bun での動かし方    | 本道は `hono/bun`（`Bun.serve` を使う。**この規約では使えない**）。`@hono/node-server` は `node:http` を包むので、Bun の Node 互換の上で同じコードが動く（README「同じコードが Bun でも動く」） | hono.dev「Node.js」、README           |
| multipart           | `c.req.parseBody()` で `File` として受ける。上限は `hono/body-limit`（`maxSize` / `onError`）。Bun では `maxRequestBodySize` の併用が要る                                                       | hono.dev「HonoRequest」「Body Limit」 |
| 注意                | `upgradeWebSocket` とヘッダを書き換えるミドルウェア（CORS 等）を同じ経路に重ねると immutable headers のエラーになりうる                                                                         | hono.dev「WebSocket Helper」          |

## いまの `server.ts` の内訳

| 部分                 |      行 | 中身                                                                                        | Hono にすると                                                                                                                                 |
| -------------------- | ------: | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 冒頭コメント・import |      37 | 安全のための決まり（バインド先・トークン・`Origin`・定型文の理由）の説明                    | ほぼそのまま（import が `hono` / `@hono/node-server` に変わる）                                                                               |
| 起動トークン・型     |      45 | `createStartupToken`、`SessionSocketOptions` / `SessionSocket`                              | そのまま（契約は変えない）                                                                                                                    |
| upgrade の受け口     |      60 | `attachSessionSocket` の `on("upgrade")`、403 の手書き、`handleUpgrade`、`isAllowedUpgrade` | **`app.get("/ws", guard, upgradeWebSocket(...))` で約 30 行**。403 は `c.body(null, 403)`                                                     |
| メッセージの受信     |      45 | `receive` / `decodeJson` / `messageText`（`ws` の3つの形を文字列に）                        | `receive` / `decodeJson` はそのまま。`messageText` は `MessageEvent.data` の形が減るので短くなる                                              |
| 静的配信の振り分け   |      55 | `respond` の `if` 5本と 404                                                                 | **`app.get` 4本で約 20 行**。404 は Hono の既定                                                                                               |
| 各アセットの返し方   |      60 | `writeHtml` / `writeVendorAsset` / `writeCharacterAsset` / `readOptionalFile`               | `c.html` / `c.body(content, 200, headers)` で **約 30 行**。allowlist の判断（`VENDOR_ASSET_CONTENT_TYPES`・`serveCharacterAsset`）はそのまま |
| ページ本体           |      22 | `buildLayoutPage`                                                                           | そのまま                                                                                                                                      |
| listen とポート解決  |      55 | `startViewServer` の Promise、`error` の扱い、`boundPort`                                   | **`serve({ fetch, hostname, port }, (info) => ...)` で約 25 行**。`info.port` があるので `boundPort` は消える                                 |
| コメント・空行       |      52 |                                                                                             | 減る分に比例して減る                                                                                                                          |
| **合計**             | **431** |                                                                                             | **約 280**                                                                                                                                    |

**減るのは約 150 行（35%）。** ただしその 150 行は「動かないコード」ではなく、19 件のテストで守られた
定型で、いま手を入れる予定も無い。

## 契約と配線がどう変わるか

いまは `startViewServer`（listen）と `attachSessionSocket`（upgrade の受け口）が**別の関数**で、
`cli.ts` が順に呼んで配線している。`@hono/node-server` は `WebSocketServer` を `serve()` に渡す形なので、
**この2つは1つの関数に畳まれる**。

| 影響                                                    | 中身                                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli.ts`                                            | `startViewServer` と `attachSessionSocket` の2回の呼び出しが1回になる（配線は減る）                                              |
| `test/core/server.test.ts` の `attachSessionSocket` 7件 | サーバの立て方が変わるので前処理を書き換える。**確かめている内容（403・`hello`・`dispatch`・定型文の `error`）は変えない**       |
| 同 `startViewServer` 12件                               | HTTP の黒箱テストなので、そのまま通る見込み。Hono なら `app.request("/")` で **listen せずに**テストできるようになる（速くなる） |
| `docs/design.md` 5章「server.ts」・9章                  | 「`node:http` + `ws`」の記述を直す                                                                                               |
| `docs/coding-standards.md`「Bun固有APIに寄せない」      | Bun 上で `@hono/node-server` を使う理由（`hono/bun` は `Bun.serve` を使うので採らない）を1行足す                                 |

## メリット

1. **経路が宣言になる。** `app.get` 4本を上から読めば全経路が分かる。いまは `respond` の `if` を追う
2. **トークンと `Origin` の照合が1つのミドルウェアになる。** 以前の却下理由「生バイト POST は
   トークンと `Origin` の照合をもう一組書く」が消える。**経路を足すたびに守りを書き直さなくてよくなる**
3. **multipart が使える。** 以前の却下理由「`node:http` にパーサーが無い」が消える。画像を data URL で
   WebSocket に載せる決定（1枚 2MiB・パック 8枚・`maxPayload` 4MiB）は、`bodyLimit` つきの POST に
   替えられる。**ただし替えるかは別の判断**（WebSocket 1本で閉じる設計の一貫性は今のほうが高い）
4. **Web 標準の `Request` / `Response` でテストできる。** `app.request()` で listen なしに静的配信の 12 件が回る
5. **Node / Bun / Electron で同じコード。** 箱の方針で Electron の Node へ寄せるとき、`node:http` 直書きより
   移しやすい。参考資料も多い（`architecture-rethink.md` の「メジャーで参考資料が多いと助かる」に沿う）
6. 404・`content-type`・`charset` の定型が消え、`server.ts` が「何を配るか」だけになる

## デメリット

1. **依存が2つ増える**（`hono` 1.3 MB、`@hono/node-server`）。外部依存の追加はユーザーの承認事項
2. **WebSocket の経路が `@hono/node-server` の版に依存する。** 2.x で `@hono/node-ws` を取り込んだばかりで、
   API が動いた直後。`ws` 直書きのいまは `ws` 8.x だけを見ていればよい
3. **Bun 上で「Node 用アダプタ」を使う形は Hono の本道ではない。** Hono の Bun 向け資料（`hono/bun`・
   `Bun.serve`）はそのまま使えず、`@hono/node-server` の資料を Bun の Node 互換の上で読むことになる。
   いまの `node:http` 直書きと同じ立場なので新しい種類のリスクではないが、資料の利得は目減りする
4. **契約の分離が1つ減る。** listen と upgrade を別々に組み立てられなくなる（テスト7件の前処理を書き換え）
5. **削れるのは定型の 150 行で、痛んでいる場所ではない。** 兆候の一覧（`architecture-proposal.md`）に
   `server.ts` は経路名の再掲しか出てこない。置き換えの動機は「今の痛み」ではなく「次に足す経路」になる
6. `upgradeWebSocket` とヘッダを触るミドルウェアを重ねられない制限がある（今の経路には無関係だが、
   足すときに知っておく）

## 入れずに済ませる中間案

Hono を入れなくても、メリット1（宣言性）だけなら **`respond` の `if` 5本を経路の表（配列）にする**
だけで得られる。20 行程度の書き換えで、依存は増えない。メリット2・3（照合の共通化・multipart）は
これでは得られない。

## 入れ時の判断基準

次のどれかが来たら、改めて決める。

| 条件                                               | いまの状態                                               |
| -------------------------------------------------- | -------------------------------------------------------- |
| 経路が5つを超える                                  | 4つ（`/`・`/assets/`・`/vendor/`・`/character/`）+ `/ws` |
| ファイルを HTTP で受けると決める                   | WebSocket の data URL に決定済み（実装済み）             |
| Node（Electron）へ寄せると決める                   | 未決                                                     |
| トークン・`Origin` の照合が要る経路が2つ以上になる | `/ws` の1つ                                              |

入れるなら順番は **段2（`adapter/` を切る）→ `adapter/server.ts` を Hono で書き直す → `cli.ts` の配線を
1回にする**。段2 の前に入れると、`core` の中で境界と判断が混ざったまま依存だけ増える。
