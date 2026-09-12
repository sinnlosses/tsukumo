# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `docs/workflow.md`）

- （T-069 の結論から。2026-09-12）Idiomorph 0.8.0 を `vendor/` に同梱し、`subscriptionScript` の
  `el.innerHTML = event.data` を morph に置き換える。取得元は jsdelivr（cdnjs には無い）、
  ライセンス 0BSD、min+gzip 3.7KB。`vendor/README.md` の表も足す。**T-070 はこれで直るので、
  T-070 の本文を「Idiomorph で直す」に差し替えるか、この作業に統合する**
- （T-069 の結論から。2026-09-12）ブラウザ側 JS 812行を `src/view.ts` のテンプレート文字列から
  独立した `.ts` ファイルへ出し、`bun build` でバンドルして配る。`tsc` と `oxlint` が届く状態に
  する。**`bun run start` と `bin/tsukumo`（`bun link` 済み）が壊れない形**を先に決める
  （ビルド成果物が無くても起動できるようにするか、起動時にビルドするか）
- （T-069 の結論から。2026-09-12）CSS の `STYLE` 定数（約700行）を複数の `.css` に割り、
  上のビルド工程に相乗りしてまとめる。割り方は領域の単位（レイアウト／メインビュー／キャラビュー／
  サイドバー／入力欄／レポートの見た目）を目安にする
- 個別ビューのページ（`/main` `/character` `/sidebar`）と `/` のリンク一覧を消し、**レイアウト
  ページを `/` で開く**ようにする（2026-09-12 ユーザーの指示「不要なものは消して `/` だけで
  開くようにするのが自然」）。当初案（3つを別々のタブで開いてペインに並べる）の名残で、実際の
  目視は合成データの静的 HTML を吐く方法でやっているため役目を終えている。**T-069 の後続作業
  （ブラウザ側 JS の切り出し・CSS の分割）より先にやると、移す対象が減る。**
  - 消える: `buildViewPage` / `/` のリンク一覧 / `viewPath` / `view-server.ts` のページ分岐 /
    起動ログの「個別ビュー・デバッグ用」3行
  - 残る: `VIEW_NAMES` / `viewEventPath` と `/events/*` の SSE 経路 / `subscriptionScript`
  - **注意**: `buildViewPage` は `test/view.test.ts` の9箇所で購読スクリプトやレポート描画の
    テストの土台に使われている。**`buildLayoutPage` ベースへの書き換えであって、テストの削除に
    しない**（件数が減らないことを完了条件にする）
  - `docs/architecture.md`「ビューは1枚のページにまとめる」にある「`/main` `/character`
    `/sidebar` はデバッグしやすさのため残す」という決定を覆すので、その節も直す
