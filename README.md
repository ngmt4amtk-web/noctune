# NOCTUNE

聴くだけで耳を鍛える短時間トレ Web アプリ。  
既存の [みみクエスト](https://github.com/ngmt4amtk-web/violin-ear-quest) は残し、別アプリとしてフォーク。

- 3モード: おとあて / ミクロ耳 / ハモリ判定
- ハモリは「ひびき」＋「最初のズレ幅」（40/25/10/5¢）
- タイトル・アイコンは設定から任意変更（起動必須ゲートなし）
- 正解／外れは短いUIスナップSFX（音程メロディなし）
- 依存ゼロ（フォントCDNのみ任意）・マイク不要・GitHub Pages想定

## 起動

```bash
cd ~/Projects/noctune
python3 -m http.server 8650
# → http://localhost:8650/
```

## テスト

```bash
node --test test/*.test.mjs
```

## 仕様

`docs/SPEC.md`
