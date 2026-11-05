# 画面の見て回り方

ステータス: **案内**（正典は `docs/architecture/testing/visual-check.md` と `docs/architecture/adr/0041-design-system-tokens-and-gallery.md`）。入口は `docs/guide.md`。

責務: 画面にどんな部品と状態があるかを人が見に行く3つの入口（見本帳・状態のカタログ・疑似セッション）の打ち方を持つ。
読む時: 画面の部品や状態を見て回りたいとき、見たい場面を起こす方法を知りたいとき。
直す時: 見本帳の節・カタログの概念・疑似セッションの起こし方が変わったとき。

撮り方の規則（出力先・待ち方・ビューポート）はここに書き写さない。`docs/architecture/testing/visual-check.md` を読む。撮った画像はリポジトリに置かない。

## 見本帳 `#design`

デザイントークンと部品を1ページに並べたページ。帯には出ないので、`pnpm run start` で起こしたページの URL の末尾に `#design` を打って開く（理由は ADR 0041）。入口は `src/browser/components/app/design/design.tsx`。

| 節               | 並ぶもの                                                                       | 置き場（`src/browser/components/app/design/`） |
| ---------------- | ------------------------------------------------------------------------------ | ---------------------------------------------- |
| デザイントークン | 色・字の大きさ・余白・角丸・影・動きの値と見本                                 | `token-gallery.tsx`                            |
| `ui/` の部品     | Surface・Badge・Divider・Button・Heading・Text などの組み合わせ（種類 × 状態） | `ui-gallery.tsx`                               |
| カタログの部品   | レポートなどのカタログの部品を架空の入力で描いた例                             | `catalog-gallery.tsx`                          |
| 画面の部品       | 画面の presentational 部品を架空の props で描いた例（部品のパスが見出し）      | `screen-part-gallery.tsx`                      |

## 状態のカタログ

疑似セッションの場面を名指して撮り、画像と索引 HTML を書く。組み立て（`pnpm run build`）から済むので、先に打つ必要はない。

```bash
pnpm run catalog                                  # 全件を撮る
pnpm run catalog --only <名前>                    # 1件だけ撮る
pnpm run catalog --only <名前> --out <ディレクトリ>  # 出力先を変える
pnpm run catalog --help                           # --only に使える名前の一覧（撮らない）
```

`--` を挟まない。挟むと `--` ごと引数の解釈に渡り、使い方の表示で止まる。

既定の出力先は `/tmp/tsukumo-catalog/`。ブラウザで `/tmp/tsukumo-catalog/index.html` を開くと、撮った画像が一覧で見える。画像はリポジトリに置かない（会話が写るため）。

撮れる概念は、撮る順（`scripts/capture/lib/catalog-entry.ts` の `CATALOG`）に次のとおり。件の名前は `--help` で引く。

| 概念         | 撮れる状態                                               | 定義（`scripts/capture/lib/`） |
| ------------ | -------------------------------------------------------- | ------------------------------ |
| 質問         | 答え待ち（質問・許可）                                   | `catalog-question.ts`          |
| レポート     | 基本の表示（検証結果・diff・合図の行）とターンの並び     | `catalog-report.ts`            |
| 記法         | レポートの記法（見本・図と表の題・図・画像・前後）       | `catalog-notation.ts`          |
| 画面         | タスク一覧・入力の補完・キャラクター画面                 | `catalog-screen.ts`            |
| ワークプラン | 帯の「いまの作業」・ワークプラン・委譲中のプログレスバー | `catalog-work-plan.ts`         |
| ホーム       | 件専用のホーム（日記・消せるキャラクターパック）         | `catalog-home.ts`              |

## 疑似セッションで任意の場面を起こす

本物の `claude` を起こさず、疑似セッションの場面を流して画面を出せる。環境変数は `docs/readme/configuration.md` の表（`TSUKUMO_DRIVER`・`TSUKUMO_FAKE_SCENE`）を読む。

```bash
TSUKUMO_DRIVER=fake TSUKUMO_FAKE_SCENE=<場面> pnpm run start   # 起こした直後に場面を流す
node scripts/capture/capture-view.ts --list-scenes             # 場面の一覧
node scripts/capture/capture-view.ts --scene <場面>            # 1枚だけ撮る
```

場面の置き場は `fixture/fake-session/`。
