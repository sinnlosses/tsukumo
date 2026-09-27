# 単体テスト `character-create` の送信の検査がときどき空の dispatch で落ちる揺れを直す（振り返り: T-804）

- 札: 揺れ
- 根拠: T-804（文書とタスクファイルだけを変えた）の受け入れの `pnpm run check` で、`test/browser/components/page/character/components/character-create/character-create.test.tsx` の「そろった状態で押すと、…を載せた characterPack.create を dispatch する」が `expected [] to deeply equal [ { …(6) } ]` で落ちた。単独で3回流すと3回とも通り、打ち直した `pnpm run check` も通った。`await pickPortrait()` のあと立ち絵の読み込み（データ URL への変換）が負荷の下で終わる前に送信ボタンを押している疑いがある（確かめていない）
- 出し先: 新しいタスク（押す前に立ち絵が選ばれた状態を画面で待つ形にするなど、読み込みの完了を待ってから押すように直す。全件を並べて負荷を掛けた `pnpm run check` を続けて10回流し、1度も落ちないことを確かめる）
