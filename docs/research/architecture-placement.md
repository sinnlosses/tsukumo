# アーキテクチャ提案: 置き場所の名前を「どこで動くか」と「何が住むか」に揃える（2026-09-20）

**この文書は提案であって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには作らない。
採用したら正典（`docs/design.md` 2章・`docs/architecture.md` 原則2/3・`docs/coding-standards.md`
「層と依存の向き」・`docs/glossary.md`・`README.md` のツリー）へ反映し、この文書は経緯として
`docs/research/` に残す。**2026-09-16 の判断の記録は
`docs/research/architecture-proposal.md`（別ファイル）で、あれは上書きしない。**

**対象コミット**: `main` の `de65cd5`（T-192 まで）。**書き方**:
`~/.claude/skills/architecture-proposal` の手順（性質 → 候補 → 木 → 差分 → 段階）。
**きっかけ**: ユーザーの指示（2026-09-20）「どこで何をしているのか `src/` ディレクトリを見ても
`README.md` のディレクトリ構成を見てもわかりづらい印象を持った。根本的に解決していきたい」。

**結論（3行）**

1. **性質は 2026-09-16 のときから変わっていない。** 常駐プロセス・同一言語の2つの実行環境・
   両側が同じ reducer。**層の切り方（共有契約 + サーバ/クライアント、サーバ側は判断と境界）は
   正しく、変えない。** 合っていないのは**名前**と、**`src/ui/` の中の箱の名前**の2つだけ
2. **推す案は C**: 層の名前を実行環境が読める形（`shared/` `server/{core,adapter}` `browser/`）に
   付け替え、**`browser/features/` という misfit な名前をやめて `screen/` と `region/`
   （どちらも用語集にある語）に割る**。辺は1本も変えない（`core → adapter` 禁止も、
   領域どうしの import 禁止もそのまま `test/architecture.test.ts` が落とす）
3. **最初の段階はファイルを1つも動かさない**: `README.md` のツリーが **2026-09-16 の分割前のまま**
   （`adapter/` が無く、`core/` が「SDK 駆動、HTTP/WebSocket、Orca アダプタ」と書いてある）。
   わかりづらさの一部はここなので、まず実態に直し、置き場の表に「実行場所」の列を足す

---

## 1. アプリの性質（実測）

| 軸               | 実測                                                                                                                                                  | 何が決まるか                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 何を中心に回るか | Agent SDK が起こす子プロセスからイベントが流れ込む**常駐プロセス**。`src/cli.ts`（392行）が配線し、`core/session-manager.ts` が畳んで 100ms で配る    | 中心はイベント流入。要求応答でもバッチでもない                     |
| 外の世界との境界 | `adapter/` 12ファイル。外部 import は `node:*` 23本・SDK 1本・`ws` 1本（`cli.ts` の `node:crypto`/`node:process` を除く）                             | 境界は6系統（SDK・HTTP/WS・fs・子プロセス・ホスト・ビルド）        |
| 状態の持ち方     | `SessionState` をサーバ（`session-manager`）とブラウザ（`stores/session.tsx`）が**同じ reducer で同じ形**に持つ。永続は `~/.tsukumo/` の2ファイルだけ | 「両側が読む純粋な畳み込み」を独立した層に置く理由がここにある     |
| 実行環境の数     | **2つ**（Bun のサーバ / ブラウザ）。同一言語                                                                                                          | 共有契約の層が要る。`protocol` はその位置                          |
| 変わりやすい場所 | 2026-09-16 以降: `protocol/session-state.ts` 12回・`protocol/character.ts` 9回・`cli.ts` 8回・`ui/features/character-view/` 7回                       | 変更は `protocol` と `ui` に集中。`adapter` は 24回で最も静か      |
| 守られている制約 | `test/architecture.test.ts` が **9本の検査**（層の辺2・orca/SDK/子プロセス/`process.env` の1ファイル化4・経路名1・ui の横と縦の辺2）                  | 名前を変えても**この9本を失わせない**ことが最優先                  |
| 利用者と開発体制 | 作者1人。タスクは `difficulty` に合わせてサブエージェントへ委譲（`CLAUDE.md`「タスク運用」）                                                          | **ディレクトリ名が指示書の代わり**になる。名前の読めなさが直接効く |
| テストできる範囲 | `test/` は `src/` の形を写す 59ファイル + root 4。ブラウザに出た絵は目視                                                                              | 名前を変えると `test/` も同じ数だけ動く                            |

### いまの数（2026-09-20 実測。タスク本文の「89ファイル」は T-190〜T-192 の前の値）

| 層         | `.ts`/`.tsx`（`.d.ts` 除く） | `.d.ts` | `.css` | 合計   | 行数  | 対応する `test/` |
| ---------- | ---------------------------- | ------- | ------ | ------ | ----- | ---------------- |
| `protocol` | 16                           | 0       | 0      | **16** | 2,603 | 13               |
| `core`     | 12                           | 0       | 0      | **12** | 1,664 | 10               |
| `adapter`  | 12                           | 0       | 0      | **12** | 2,316 | 9                |
| `ui`       | 44                           | 3       | 8      | **55** | 4,557 | 27               |
| `cli.ts`   | 1                            | 0       | 0      | **1**  | 392   | 1（root）        |
| **合計**   | **85**                       | **3**   | **8**  | **96** |       | **59 + root 4**  |

`src/ui/` の内訳（55）: `features/` 41・`components/` 3・`lib/` 4・`stores/` 3・`styles/` 1・
`main.tsx` 1・直下の `.d.ts` 2。`features/` の内訳: `main-view/` 15（うち `markdown/` 9）・
`sidebar/` 7・`dispatch/` 6・`character-screen/` 5・`character-view/` 4・`layout/` 4。

### 現状の依存の辺（実測。循環なし）

```bash
python3 ~/.claude/skills/architecture-proposal/scripts/import_edges.py src --markdown
```

| from      | to         | 本数 |
| --------- | ---------- | ---: |
| `ui`      | `protocol` |   38 |
| `adapter` | `protocol` |   18 |
| `core`    | `protocol` |   15 |
| `cli.ts`  | `adapter`  |   11 |
| `cli.ts`  | `core`     |    9 |
| `adapter` | `core`     |    7 |
| `cli.ts`  | `protocol` |    4 |

**`core → adapter` は 0 本、`core ↔ ui` も 0 本。** 辺は設計どおりに保たれている。
**つまり直すべきは構造ではなく、その構造の読めなさである。**

### いま痛んでいる兆候（すべて実測）

1. **`README.md` のツリーが古い。** `src/` の説明が `protocol` / `core` / `ui` の3つしかなく、
   `core` を「SDK 駆動、HTTP/WebSocket、キャラクターパック、環境変数の読み取り、Orca アダプタ」と
   書いている。これは **2026-09-16 に `adapter/` を切る前の姿**で、いまの `core` は
   `node:` も SDK も `ws` も import しない。**「README を見てもわかりづらい」の直接の原因**
2. **層の表が4箇所にある。** `docs/design.md` 2章（正典）・`docs/coding-standards.md`
   「層と依存の向き」・`docs/architecture.md`「新しいコードを置く場所」・`CLAUDE.md` 原則2。
   `coding-standards.md` は「表は二重に書かず design.md を正典とする」と書きながら層の表自体は
   再掲している
3. **地図がコメントに埋まっている。** `src/` の 85ファイル中 **67ファイル**が、他の層のパスを
   コメントに書いている。読むには正しい助けだが、木を見ただけでは分からないことの裏返しでもあり、
   **改名の追随コストの正体**でもある
4. **`protocol` の名前が中身を狭く見せる。** 16ファイルのうち 3件（`main-view.ts` ·
   `portrait-motion.ts` · `turn-speech.ts`）は **`ui` からしか読まれない**（`--reach` 実測）。
   ここに居る理由は「`SessionState` から純粋に導けて、両方の実行環境で動く」ことなのに、
   名前は「通信プロトコル」としか読めない
5. **`features/` が持っているものと名前が合っていない**（ユーザーの指摘のとおり）。中身は
   画面の骨組み（`layout`）・会話画面の4領域（`main-view` `character-view` `sidebar` `dispatch`）・
   ページを丸ごと使う画面（`character-screen`）で、**bullet-proof-react の言う「機能のパッケージ」
   （provider と hooks の束）にあたるものは `features/` ではなく `stores/` に居る**
6. **汎用の置き場が片側にしかない、は半分だけ当たっている。** サーバ側に「外の世界に触らず・
   ドメインを知らない」ファイルは**実測 0 件**。候補に見える `adapter/tsukumo-home.ts`（16行）と
   `adapter/bundled-path.ts`（35行）はどちらも `node:os`/`node:path`/`node:url` に触るので境界である。
   **片側にしか無いのは、片側にしか実体が無いから**で、名前の問題ではない
7. （小）`ui/lib/data-url.ts` の読み手は `character-screen` の2ファイルだけ。`docs/design.md` 2章の
   「1つの機能しか読まないものは機能の中に残す」に照らすと、機能の中でよい

---

## 2. 候補と選択

**土台は動かさない。** 「共有契約 + クライアント/サーバ分割 + サーバ側を判断と境界に割る」は
性質の表（実行環境2つ・両側が同じ reducer・境界6系統）から直接出る形で、2026-09-16 に一度
候補を並べて選んでいる。**今回の候補は、その土台の「名前」だけを軸に立てる。**

### 候補 A: 現状維持 + 地図を直す（ファイルを1つも動かさない）

`README.md` のツリーを実態（4層）へ直し、`docs/architecture.md`「新しいコードを置く場所」の表に
**「実行場所」の列**を足し、`coding-standards.md` の再掲を `design.md` への参照へ縮める。

- **4層との対応**: そのまま（`protocol` / `core` / `adapter` / `ui`）
- **効くところ**: 兆候1・2・6 が消える。追随コストがほぼ0で、止めても価値が残る
- **失うもの**: **名前から実行環境が読めない問題（兆候4）と `features/` の misfit（兆候5）は残る。**
  「ドキュメントを読めば分かる」で止まるので、ユーザーの「根本的に解決」には届かない
- **追随が要るファイル数**: **2〜3**（`README.md`・`docs/architecture.md`・`docs/coding-standards.md`）
- **確度**: 固い

### 候補 B: ユーザーの素案どおり `src/{backend,frontend,shared}` ＋ 各側に `lib/` `utils/`

- **4層との対応**:

  | いま       | 素案                                         |
  | ---------- | -------------------------------------------- |
  | `protocol` | `shared/`                                    |
  | `core`     | `backend/`（`adapter` と混ざる）             |
  | `adapter`  | `backend/lib/`?（`utils/` との線が引けない） |
  | `ui`       | `frontend/`                                  |
  | `cli.ts`   | `src/cli.ts`（変えない）                     |

- **失うもの（重い）**:
  - **`core` と `adapter` の区別が名前から消える。** `backend/` の中でもう一段割らないと、
    `test/architecture.test.ts` が守っている「`core` は `node:`/SDK/`ws` に触らない」が
    **どのディレクトリに掛かる規則なのか書けなくなる**。割るなら結局2段になり、素案の
    「各側に `lib/` `utils/`」とは別の割り方になる
  - **`utils/` が既存の決定と2箇所で衝突する。** `CLAUDE.md` 原則5（置き場所を名前にしたものを
    作らない）と、`docs/design.md` 2章「採らなかった bullet-proof-react の要素」の `utils/` の行
    （2026-09-16）。両方を今回の提案で覆す必要がある
  - **helm-yadokari の `utils/` は tsukumo ではそのまま輸入できない。** あちらの2軸は
    「技術に依存していてもドメインを知らないものは `utils/`」で、実例は `fs.ts` と `yaml.ts` である。
    tsukumo で `node:fs` に触るものは**定義上すべて `adapter`**（テストが落とす）なので、
    同じファイルが `utils/` と `adapter/` の両方を指すことになる。**2つの基準が1つのファイルで
    食い違う**のは、いまいちばん避けたい状態（兆候2と同じ病）
  - **実体が無い箱が2つできる。** サーバ側の「外に触らずドメインも知らない」ファイルは実測 0 件
    （兆候6）。`backend/utils/` は空になる
- **追随が要るファイル数**: 移動 **154**（`src/` 95 + `test/` 59）、中身の書き換え **76 以上**
  （パスを書いた `src/` のコメント 67 + `scripts/open-views.ts` 1 + `test/` の root 4 + 正典 8）
- **確度**: 推測（`backend/` の中の割り方が決まらないと木が書けない）

### 候補 C: 実行環境を名前にし、`features/` をやめる（**推奨**）

素案から「**実行環境を名前にする**」だけを採り、`lib/`/`utils/` の二分は採らない。
サーバ側の中は `core`（判断）/ `adapter`（境界）をそのまま持ち込む。
`ui` の中は、misfit な `features/` を**用語集にある語**（画面・領域）へ置き換える。

- **4層との対応**:

  | いま       | 新                    | 中身と辺                 |
  | ---------- | --------------------- | ------------------------ |
  | `protocol` | `src/shared/`         | 変えない（16）           |
  | `core`     | `src/server/core/`    | 変えない（12）           |
  | `adapter`  | `src/server/adapter/` | 変えない（12）           |
  | `ui`       | `src/browser/`        | 中の箱だけ組み替え（55） |
  | `cli.ts`   | `src/cli.ts`          | 変えない（1）            |

- **効くところ**: 兆候1〜6 のすべて。`shared` は `docs/design.md` 2章が自分で書いている
  「モノレポでいう `packages/shared` の位置」と文字どおり一致し、`server/` `browser/` は
  同章の表の「実行場所」列（サーバ（Bun）/ ブラウザ）と一致する
- **失うもの**:
  - **相対 import が1段深くなる**（`server/adapter/x.ts` から `../../shared/y.ts`）。
    実測で影響するのは `adapter` 18本 + `core` 15本 + `adapter→core` 7本 = **40本**
  - **層の判定が「先頭ディレクトリ1つ」で済まなくなる**（`test/architecture.test.ts` の
    `layerOf` が2段対応になる。7行程度）
  - **2026-09-16 の「`src/ui/` の置き場所は bullet-proof-react の名前をそのまま使う」という
    決定を、`features/` の1語だけ部分的に覆す**（`components/` `lib/` `stores/` `styles/` は残す）
- **追随が要るファイル数**: 移動 **154**（`src/` 95 + `test/` 59）、中身の書き換え **76 以上**
  （B と同じ。段に割れば1段あたりは 40〜70）
- **確度**: 固い（段4の `screen/`/`region/` の線引きだけ「試す価値あり」）

### 候補 D: 平らなまま2つだけ改名する（`protocol` → `shared`、`ui` → `browser`）

サーバ側（`core` / `adapter`）は触らない。

- **4層との対応**: `shared` / `core` / `adapter` / `browser` の4つが**すべて `src/` 直下に並ぶ**
- **失うもの**: **「`core` と `adapter` がサーバ側だ」が名前から読めないまま**（ユーザーの指摘の
  3つ目が残る）。ただし `adapter` は用語集にある語で、`core` は「それ以外のサーバ側」として
  消去法で読めるので、残り方は軽い
- **追随が要るファイル数**: 移動 **111**（`src/` 71 + `test/` 40）、中身の書き換えは C と同程度
- **確度**: 固い
- **位置づけ**: **候補 C の段2そのもの。** ここで止めても一貫した形になるので、C の中間地点として
  意味がある（C を採って段3で気が変わったら、D のまま止められる）

### 選んだもの: **A を第1段階にして C**（D は途中で降りられる中間地点）

理由:

1. **A の中身（`README.md` の古いツリー）は、わかりづらさの実測できる原因の1つ**で、
   ファイルを動かさずに消せる。先にこれを消さないと、改名の効果が測れない
2. **B は「`core`/`adapter` の区別」と「`utils/` の基準」の2つを同時に壊す。** 前者は
   `test/architecture.test.ts` の9本の検査のうち5本が寄りかかっている実効ルールで、
   後者は 2026-09-16 に理由つきで採らないと決めた名前である。**素案のうち残す価値があるのは
   「実行環境を名前にする」1点**で、それは C がそのまま採っている
3. **C の「失うもの」は相対 import の1段と `layerOf` の7行**で、どちらも一度払えば終わる。
   対して得るのは、**サブエージェントに委譲する運用でディレクトリ名が指示書として機能すること**
   （性質の表の最後の行）
4. `features/` は**この1語だけが misfit** なので、bullet-proof-react の採用を丸ごと覆さずに直せる

---

## 3. 目標のディレクトリ構造

```
src/
  cli.ts                      配線（composition root）。環境変数の受け取り・前提チェック・終了処理
                              ✗ 判断そのものを書かない（`server/core/` へ）

  shared/                     **両方の実行環境で動く**もの（＝いまの protocol/）
                              語彙・SessionEvent・SessionState・applySessionEvent・zod スキーマ
                              ✗ `node:` も `document` も触らない（物理的な制約。片方で動かなくなる）
                              ✗ 片側しか読まないものでも、純粋な導出ならここでよい（main-view.ts）

  server/                     **Bun のプロセスで動く**もの
    core/                     純粋な判断（12）。session-manager / session-launch / sdk-message …
                              ✗ `node:` / `@anthropic-ai/*` / `ws` を import しない
                              ✗ `server/adapter/` を import しない（結ぶのは cli.ts だけ）
    adapter/                  外の世界に触る境界（12）。**1ファイル = 1つの境界**
                              ✗ インターフェースを切らない（実装が2つあるものだけ契約を core に置く）
    （lib/ は作らない）        実体が 0 件のため。足す基準は下の2軸の表

  browser/                    **ブラウザで動く**もの（＝いまの ui/）
    main.tsx                  入口。bun build の入口でもある。副作用はここだけ
    screen/                   **画面**（用語集「画面」＝ページを丸ごと使う表示の単位）と、
                              会話の画面の骨組み。conversation（layout）/ character / character-create
                              ✗ 画面どうしは import しない
    region/                   **領域**（用語集「ビュー」＝会話の画面の中の区画。コードの
                              `data-region` と同じ語）。main-view / character-view / sidebar / dispatch
                              ✗ 領域どうしは import しない（いまの UI_REGIONS の検査そのまま）
    components/               領域の語彙を持たない React の部品（値と呼び先を全部受け取る）
    stores/                   画面全体で共有する状態の Context と hook（session / turn-selection / screen）
    lib/                      React の部品ではない道具（socket / refresh / data-url / tool-summary）
    styles/                   **グローバルな CSS だけ**（theme.css）。領域の見た目は領域の中の
                              `<名前>.module.css`
    *.d.ts                    ui 全体に効く ambient 宣言（箱に属さない）

test/                         `src/<相対パス>` → `test/<相対パス>.test.ts`（規約は変えない）
```

**`features/` という名前は木から消える。** 中身は `screen/`（9ファイル）と `region/`（32ファイル）に
割れ、bullet-proof-react の言う「機能のパッケージ（provider と hooks）」にあたるものは、いまも
これからも `stores/` にある。

### 許す依存の辺（層）

| from             | import してよい先                           | 変更     |
| ---------------- | ------------------------------------------- | -------- |
| `shared`         | `shared`（`zod` は可）                      | 名前だけ |
| `server/core`    | `shared` / `server/core`                    | 名前だけ |
| `server/adapter` | `shared` / `server/core` / `server/adapter` | 名前だけ |
| `browser`        | `shared`（React などの npm は可）           | 名前だけ |
| `cli.ts`         | すべて                                      | 変更なし |

**辺は1本も増減しない。** `server/core → server/adapter` の禁止も、`server/core ↔ browser` の
相互不可も、`shared` が `node:`/`document` に触らない検査もそのまま。
`test/architecture.test.ts` の `Layer` と `layerOf` が2段を読めるようになるだけ。

### 許す依存の辺（`browser/` の箱）

| from          | import してよい先                                     | 変更                            |
| ------------- | ----------------------------------------------------- | ------------------------------- |
| `main.tsx`    | すべて                                                | 変更なし                        |
| `screen/`     | `region` / `components` / `stores` / `lib` / `shared` | **新**（`features` を割った側） |
| `region/`     | `components` / `stores` / `lib` / `shared`            | いまの `features/` の辺と同じ   |
| `components/` | `lib` / `shared`                                      | 変更なし                        |
| `stores/`     | `lib` / `shared`                                      | 変更なし                        |
| `lib/`        | `shared`                                              | 変更なし                        |
| `styles/`     | —                                                     | 変更なし                        |

- **`screen → region` の辺は木の上では許すが、段4では使わない。** 4領域の組み立ては
  `main.tsx` の `<Root>` に残す（移動だけの段にするため）。下ろすかどうかは「未決事項」へ
- **`region → region` の禁止**が、いまの「機能どうしは import しない」の後継。引き上げ先も
  同じ（部品なら `components/`、道具なら `lib/`、状態なら `stores/`）

### `server/lib/` を作る基準（「汎用の置き場が片側にしかない」への答え）

helm-yadokari の2軸（`docs/architecture.md`「`lib/`・`domain/`・`utils/`の2軸」）を tsukumo の
基準へ翻訳すると、こうなる。**違いは「外の世界に触るか」が最優先で勝つこと。**

|                                        | 外の世界に触る                       | 触らない                                    |
| -------------------------------------- | ------------------------------------ | ------------------------------------------- |
| **ドメイン（用語集の語）を知っている** | `server/adapter/`（1ファイル=1境界） | `server/core/`（概念名のファイル）          |
| **知らない**                           | `server/adapter/`                    | `server/lib/`（**実体が出るまで作らない**） |

- helm-yadokari が `utils/fs.ts` `utils/yaml.ts` を置く枠（技術依存・ドメイン非依存）は、
  tsukumo では**右上ではなく左下**に落ちる。あちらは実行環境1つのバッチで「外に触るか」を層に
  していないが、tsukumo では**それが `core`/`adapter` の唯一の基準で、テストが落とす**。
  2つの基準がぶつかったら**外に触るほうを採る**
- したがって **tsukumo に `utils/` は作らない**（原則5はそのまま）。`lib/` は
  「ドメインを知らない・外にも触らない道具」という**概念の名前**として扱う
- `server/lib/` を切る引き金は「その条件のファイルが**2つ**できたとき」。いまは 0 件

---

## 4. 現状との差分

| いまのパス                                                                    | 新しいパス                            |    件数 |
| ----------------------------------------------------------------------------- | ------------------------------------- | ------: |
| `src/protocol/*`                                                              | `src/shared/*`                        |      16 |
| `src/core/*`                                                                  | `src/server/core/*`                   |      12 |
| `src/adapter/*`                                                               | `src/server/adapter/*`                |      12 |
| `src/ui/main.tsx` · `*.d.ts` · `components/` · `lib/` · `stores/` · `styles/` | `src/browser/` の同名                 |      14 |
| `src/ui/features/layout/*`                                                    | `src/browser/screen/conversation/*`   |       4 |
| `src/ui/features/character-screen/*`                                          | `src/browser/screen/character/*`      |       5 |
| `src/ui/features/main-view/*`（`markdown/` 9 を含む）                         | `src/browser/region/main-view/*`      |      15 |
| `src/ui/features/character-view/*`                                            | `src/browser/region/character-view/*` |       4 |
| `src/ui/features/sidebar/*`                                                   | `src/browser/region/sidebar/*`        |       7 |
| `src/ui/features/dispatch/*`                                                  | `src/browser/region/dispatch/*`       |       6 |
| `test/<同じ形>`                                                               | `test/<同じ形>`                       |      59 |
| **合計**                                                                      |                                       | **154** |

**動かさないもの**: `src/cli.ts`・`package.json` の `start`/`dev`（どちらも `src/cli.ts` を指す）・
`bin/tsukumo`・`tsconfig.json` の `include`（`src/**/*` なので効かない）・`characters/`・`vendor/`・
`test/fixture/`・`test/dom-environment.ts` と `test/css-module-loader.ts`（中のパス文字列だけ直す）。
**ファイルの中身（関数・型・振る舞い）は1行も動かさない。**

**中身の書き換えが要るもの**:

| 対象                                                                         | 件数 | 何をするか                                                                     |
| ---------------------------------------------------------------------------- | ---: | ------------------------------------------------------------------------------ |
| `src/` のコメントに他層のパスを書いた分                                      |   67 | パスの置換のみ                                                                 |
| `scripts/open-views.ts`                                                      |    1 | `../src/adapter/…` の2本                                                       |
| `test/architecture.test.ts`                                                  |    1 | `Layer` / `layerOf` を2段対応に、`UI_REGIONS` を `region/`・`screen/` の2組に  |
| `test/cli.test.ts` · `test/dom-environment.ts` · `test/css-module-loader.ts` |    3 | パス文字列                                                                     |
| 正典 `docs/design.md` 2章                                                    |    1 | 層の表・ディレクトリの木・`src/ui/` の箱の表                                   |
| 正典 `docs/architecture.md`                                                  |    1 | 「各ファイルの責務」表・「新しいコードを置く場所」・原則2/3/5                  |
| `docs/coding-standards.md`                                                   |    1 | 「層と依存の向き」（再掲をやめて `design.md` へ寄せる）                        |
| `docs/glossary.md`                                                           |    1 | 「アダプタ」「プロトコル」の英語識別子、`画面`/`ビュー` にディレクトリ名を併記 |
| `README.md`                                                                  |    1 | ツリー（**段1で先に実態へ直す**）                                              |
| `CLAUDE.md`                                                                  |    1 | 原則2・3・5（下の6章）                                                         |
| `docs/requirements.md` · `docs/workflow.md`                                  |    2 | 本文中のパス 17箇所                                                            |

---

## 5. 移行の段階

各段は**単独で `bun run check` が通る**。段をまたいで壊れた状態を持たない。

### 段1: 地図を実態へ直す（ファイルを1つも動かさない）— 確度: 固い

- `README.md`「プロジェクト構成」のツリーに `adapter/` を足し、`core/` の説明を
  「サーバ側の純粋な判断」に直す（いまは 2026-09-16 の分割前のまま）
- `docs/architecture.md`「新しいコードを置く場所」の表に **「実行場所」の列**を足す
  （`protocol` = サーバとブラウザ / `core` `adapter` = サーバ / `ui` = ブラウザ）
- `docs/coding-standards.md`「層と依存の向き」の層の表を `docs/design.md` 2章への参照に縮める
  （兆候2。`ui` の箱の表はすでにそうしている）
- **証拠**: `bun run check` が通り、`README.md` のツリーに `src/adapter/` の行がある
- **ここで止めてもよい。** 止めた場合でも兆候1・2・6 は消えている

### 段2: `protocol` → `shared`、`ui` → `browser`（平らなまま）— 確度: 固い

- `git mv src/protocol src/shared` / `git mv src/ui src/browser` と `test/` の同名
- `test/architecture.test.ts` の `Layer` の文字列を差し替え（構造は変えない）
- パスを書いたコメントと正典の追随
- **移動 111**（`src/` 71 + `test/` 40）
- **証拠**: `bun run check` が通り、`grep -rn "src/protocol\|src/ui/" src test docs README.md CLAUDE.md` が 0件
- **ここで止めると候補 D の形になる**（一貫していて、破綻しない）

### 段3: `core` / `adapter` → `server/` の下へ — 確度: 試す価値あり

- `git mv src/core src/server/core` / `git mv src/adapter src/server/adapter` と `test/` の同名
- `test/architecture.test.ts` の `layerOf` を2段対応にする（`server/core` / `server/adapter`）。
  **検査の中のファイル名の条件も追随**（`"adapter/orca-host.ts"` → `"server/adapter/orca-host.ts"` など4箇所）
- **移動 43**（`src/` 24 + `test/` 19）
- **証拠**: `bun run check` が通り、`core → adapter` の違反を1本わざと入れるとテストが落ちる
  （落ちることを確かめてから戻す）

### 段4: `browser/features/` を `screen/` と `region/` に割る — 確度: 試す価値あり

- `screen/conversation/` ← `layout/`（4）、`screen/character/` ← `character-screen/`（5）
- `region/` ← `main-view/`（15）・`character-view/`（4）・`sidebar/`（7）・`dispatch/`（6）
- `test/architecture.test.ts` の `UI_BOXES` に `screen` と `region` を入れ、`UI_REGIONS` の検査を
  `region/` の中の横の辺 + `screen/` の中の横の辺の2本にする
- **組み立ては `main.tsx` に残す**（移動だけの段にする。`screen → region` の import は書かない）
- **移動 63**（`src/` 41 + `test/` 22）
- **証拠**: `bun run check` が通る。**加えて `bun run start` で目視**（4領域が出る・
  キャラクター画面へ入って戻れる・仕切りを動かせる）。CSS Modules の名前は
  `<領域>.module.css` のままなので見た目は変わらないはず

### 段5: `browser/lib/data-url.ts` を読み手の中へ（任意）— 確度: 推測

- 読み手が `screen/character/` の2ファイルだけなので、`screen/character/` の中へ移す（兆候7）
- **移動 2**（`src/` 1 + `test/` 0。テストは無い）
- **証拠**: `bun run check`。効果が小さいので、段4までの結果を見てから決めてよい

---

## 6. `CLAUDE.md` の原則のうち、書き換えが要るもの

**この提案の段階では `CLAUDE.md` を直さない。** 採用されたとき、どの段でどう直すかだけ書く。

| 原則      | いまの文言                                                                                                                                                    | 直し方                                                                                                                                                                                                                   | いつ     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| **原則2** | 「契約（`protocol`）／サーバ（`core` と `adapter`）／クライアント（`ui`）に分け…」                                                                            | 「契約（`shared`）／サーバ（`server/core` と `server/adapter`）／クライアント（`browser`）」。**`packages/shared` に近い形、という同じ文の中の説明と名前が一致する**ようになるので、その一文はそのまま残る               | 段2・段3 |
| **原則3** | 「**`src/adapter/` の1ファイルに閉じ込める**」                                                                                                                | 「**`src/server/adapter/` の1ファイルに閉じ込める**」（パスのみ）                                                                                                                                                        | 段3      |
| **原則4** | キャラクターの中身をコードに書かない                                                                                                                          | **変更なし**                                                                                                                                                                                                             | —        |
| **原則5** | 「**ディレクトリも単数形。ただし `src/ui/` の置き場所（`features/` `components/` `lib/` `stores/` `styles/`）だけ** bullet-proof-react の名前をそのまま使う」 | 「ただし **`src/browser/` の置き場所（`components/` `lib/` `stores/` `styles/`）だけ**」。**`features/` が例外の一覧から落ちる**（木から消えるため）。新しく入る `screen/` と `region/` は**単数形なので例外にならない** | 段4      |

- **原則5 の例外を全部やめて単数形に揃える（`component/` `store/` `style/`）案は採らない。**
  「広く知られた名前のほうが読み手の助けになる」という 2026-09-20 時点で生きている選択
  （2026-09-16、`docs/coding-standards.md`「層と依存の向き」末尾）を、今回の指摘は覆していない。
  指摘されたのは `features/` の1語だけである
- 「導入済みスキル」「タスク運用」「Git運用」など他の節にパスは出てこない（実測: `CLAUDE.md` の
  層への言及は 10行で、原則2/3/5 のほかは「現在の状態」1行・「よく使うコマンド」2行・
  `null` の規約1行にパス名や層の名前が出るだけ）

---

## 7. 採らなかった案

| 案                                                              | 捨てた理由                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/{backend,frontend,shared}`（素案そのまま）                 | 候補 B。`core`/`adapter` の区別が名前から消え、`test/architecture.test.ts` の5本の検査が掛かる先を書けなくなる                                                                                                                                  |
| 各側に `lib/` `utils/` を切る                                   | サーバ側の実体が 0 件（空箱になる）。`utils/` は原則5と 2026-09-16 の決定の2つに反し、helm-yadokari の `utils/fs.ts` に当たるものは tsukumo では `adapter`                                                                                      |
| `backend` / `frontend` という語を採る                           | 用語集と `docs/design.md` 2章の表が使っているのは「サーバ（Bun）」「ブラウザ」。**用語集の語に識別子を合わせる**既存の規約（`CLAUDE.md`「用語」）に従う。ただし好みの問題なので「未決事項」へ                                                   |
| `browser/` の中に `app/` を作って組み立てを下ろす               | 2026-09-16 に理由つきで採らないと決めている（`docs/design.md` 2章「採らなかった bullet-proof-react の要素」）。入口は `bun build` の入口でもあるので直下に置く。**今回の指摘はこの判断を覆していない**                                          |
| `stores/` を `features/` に改名して bullet-proof-react に寄せる | 逆方向に読みづらくなる。`stores/` は「画面全体で共有する状態」と中身を言い当てているのに対し、`features/` は何でも入る名前。**混乱の元だった語を残すことになる**                                                                                |
| `server/domain/` `server/controller/` `server/infra/` に割る    | ユーザーの指摘3つ目への直球の答えだが、tsukumo のサーバ側は**入口が `cli.ts` 1つ**で controller にあたる層が無く、ドメインの語彙は**両側が読むので `shared/` にある**。3分割すると `domain/` が空になる（この衝突は論点として挙がっていたもの） |
| `src/` をモノレポ（`packages/*`）に割る                         | ビルドは `bun build` 1本、`package.json` も1つ。ワークスペースの配線が増えるだけで、境界は同じ場所に引ける                                                                                                                                      |
| 一度に全部動かす                                                | 154ファイルが1コミットになり、失敗したときに戻す単位が無い。段1〜4はそれぞれ単独で緑になる                                                                                                                                                      |

---

## 8. 未決事項

| #   | 問い                                                              | 提案の仮定                                                                                               | 外れたときに変わる場所                                    |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | `server` / `browser` か、`backend` / `frontend` か                | **用語集に寄せて `server` / `browser`**                                                                  | 段2・段3の `git mv` の名前だけ                            |
| 2   | 会話画面の組み立てを `screen/conversation/` に下ろすか            | **下ろさない**（`main.tsx` の `<Root>` のまま。段4を移動だけにする）                                     | 段4の後に別タスク。`screen → region` の辺を使うことになる |
| 3   | `markdown/`（9ファイル）は `region/main-view/` の中のままでよいか | **そのまま**（`main-view` しか読まない。2026-09-16 の判断を維持）                                        | 2つ目の読み手が出たら `components/` へ                    |
| 4   | 段3（`server/` への入れ子）まで行くか、段2（候補 D）で止めるか    | **段3まで行く**（指摘の3つ目に答えるため）                                                               | 段3を飛ばしても木は一貫する                               |
| 5   | `shared/` の入場基準を変えるか                                    | **変えない**（「両側の契約 + `SessionState` から純粋に導けるもの」。2026-09-15 にユーザーが決めた）      | `main-view.ts` などの置き場                               |
| 6   | 用語集に `screen` / `region` を英語識別子として足すか             | **足す**（「画面」の項に `browser/screen/`、「ビュー」の項に `browser/region/` と `data-region` を併記） | `docs/glossary.md` の2項目                                |

### 用語集へ足す文面案（採用時）

- **画面**（英語識別子: `screen`）… 既存の項に1行足す:
  「コード上は `src/browser/screen/<画面名>/`（会話の画面の骨組みは `screen/conversation/`）」
- **ビュー**（英語識別子: `region`）… 既存の項に1行足す:
  「コード上は `src/browser/region/<領域名>/`。DOM では `data-region` 属性で名乗る」

---

**次の一手**: この提案を問い詰めるなら `grilling`。採用するなら**段1（ファイルを動かさない）**から。
段1は `README.md` と `docs/` だけで閉じるので、他のセッションと並行しても衝突しにくい。
