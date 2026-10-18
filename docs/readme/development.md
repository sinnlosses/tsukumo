# プロジェクト構成とドキュメントの一覧

入口は `README.md`（リポジトリの入口。コマンド一覧は `README.md`「開発」）。

責務: リポジトリのディレクトリ構成と、`docs/` の各文書への案内を持つ。
読む時: どのディレクトリに何があるかを知りたいとき、どの文書を読むか迷うとき。
直す時: トップレベルのディレクトリや、`docs/` の文書を足す・消す・改名したとき。

## 節の索引

| 節                   | 中身                                    |
| -------------------- | --------------------------------------- |
| ### プロジェクト構成 | 層の名前とディレクトリの木              |
| ### ドキュメント     | `docs/` の各文書と `CLAUDE.md` への案内 |

### プロジェクト構成

**層の名前は「どの実行環境で動くか」を表します**（サーバとブラウザの両方 = `shared/`、
サーバ = `server/`、ブラウザ = `browser/`）。**サーバ側は機能ごとに分かれ、各機能が
判断（`core/`）と外の世界に触る境界（`adapter/`）の2段を持ちます。**

```
.
├── src/
│   ├── shared/             # サーバとブラウザの両方で動く契約・語彙（zod。node: も document も触らない）
│   ├── server/             # サーバ（Node）
│   │   ├── <機能>/         #   機能ごとの置き場（session・session-driver・view-server・report・chat・
│   │   │   ├── core/       #     character-pack など）。core は純粋な判断、
│   │   │   └── adapter/    #     adapter は外の世界に触る境界（1ファイル = 1つの境界）
│   │   ├── core/           #   どの機能にも属さない共有の判断
│   │   └── adapter/        #   どの機能にも属さない共有の境界
│   ├── browser/            # ブラウザ。React の部品、unified の Markdown 変換、CSS
│   ├── cli.ts              # エントリポイント。引数・環境変数の読み出し・終了コードだけ
│   ├── main.ts             # 起動の段取り（前提チェック → キャラクター → 配信 → セッション）
│   ├── router.ts           # 全機能の手続き（oRPC）を束ねる
│   ├── current-character.ts  # いま出しているパックと選択肢の持ち主
│   ├── view-delivery.ts    # ビューの配信（起動トークン・組み立てたもの・開いているタブ）
│   ├── session-start.ts    # セッションを1つ起こす（機能ごとの組み立てを結ぶ）
│   └── wiring/             # 機能ごとの組み立て
│                           #   ※ src/ 直下と wiring/ は配線層。全層を import してよい唯一の場所
├── test/                   # テスト（src/ と同じディレクトリ構成 ＋ 層の検査の architecture/）
├── story/                  # Storybook の story（src/ と同じディレクトリ構成。設定は .storybook/）
├── characters/             # キャラクターパックと素材（tsukumo-spirit が既定、local/ は .gitignore）
├── plugin/                 # セッションに載せる同梱の Claude Code プラグイン（token-usage-diet）
├── vendor/tsukumo-plugins/ # 取り込んだ tsukumo-plugins（git submodule。タスク運用のスキル・agent・hook。利用者がリンクで入れていれば載せない）
├── scripts/                # 開発の道具（check・ship・stop・撮影・文書の検査・hook の deny-* など）
├── assets/                 # ロゴ
├── docs/                   # 要件定義・設計・アーキテクチャ・規約・用語集（正典）
├── .tw/                    # タスク運用の設定（config.toml）。機能には関係しない
├── bin/tsukumo             # エントリポイント（mise run setup でグローバルに入る）
└── package.json
```

**層はディレクトリで表し、許した依存の辺以外は `test/architecture/` が落とします。**
各ファイルの責務はそのファイルの冒頭のコメントが正典です。機能の一覧と置き場所の基準は
[`docs/architecture.md`](../architecture.md)「サーバの機能と、機能どうしの辺」「ディレクトリ」にあります。

### ドキュメント

- [`docs/requirements.md`](../requirements.md) — 要件定義（やること・**やらないこと**・技術制約・未決事項）
- [`docs/architecture.md`](../architecture.md) — アーキテクチャ詳細（全体図、`shared` / `server`（`core`・`adapter`）/ `browser` の層・共有層・置き場所、設計判断）
- [`docs/architecture/browser.md`](../architecture/browser.md) — ブラウザ側（状態の持ち方・Markdown・重いライブラリ・立ち絵の動き・CSS・`components/ui/` の部品）
- [`docs/architecture/character-pack.md`](../architecture/character-pack.md) — キャラクターパック（形・探索順・画面から書くときの境界・会話の記録の置き場）
- [`docs/architecture/testing.md`](../architecture/testing.md) — テスト（対象ごとの方法・E2E・目視確認の手順）
- [`docs/architecture/build.md`](../architecture/build.md) — ビルドと依存（事前の組み立て・HMR・足す依存の一覧）
- [`docs/architecture/screen-design.md`](../architecture/screen-design.md) — 画面のデザイン（色・書体・レイアウトの計画とトークン、雑談モードの画面、背景、画面のナビの帯）
- [`docs/architecture/display.md`](../architecture/display.md) — 表示（セリフとレポートの出力分離、レポートの記法の規約、立ち絵・吹き出し・メインビュー・入力欄・サイドバーなど各表示物の仕様）
- [`docs/architecture/workflow-contract.md`](../architecture/workflow-contract.md) — ワークフローの契約（`work_plan`・`report` の口、読む Beads の欄、ワークフローがしてよいこと）
- [`docs/architecture/chat-mode.md`](../architecture/chat-mode.md) — 雑談モード（遡れる幅、記憶の圧縮と忘却、残す旗、会話のアーカイブ、人格への書き戻し）
- [`docs/coding-standards.md`](../coding-standards.md) — コーディング規約（**会話内容の扱い**を含む）
- [`docs/glossary.md`](../glossary.md) — 用語集（日本語表記とコード上の識別子の対応）
- [`docs/workflow.md`](../workflow.md) — このリポジトリでの進捗管理の上乗せ
- [`CLAUDE.md`](../../CLAUDE.md) — Claude Code 向けのプロジェクト案内（上記への入口）

**`docs/` の各ファイルは冒頭に「節の索引」を持ち、通読しない前提で書かれています。**
知りたいことから節を1つ特定して、その節だけを読んでください。
