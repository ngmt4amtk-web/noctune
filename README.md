# NOCTUNE

聴いて当てるだけの耳トレ Web アプリ。  
既存の [みみクエスト](https://github.com/ngmt4amtk-web/violin-ear-quest) は残した別アプリ。

https://ngmt4amtk-web.github.io/noctune/

## モード

1. 音当て
2. 和音当て（和声的 / フリー）
3. 音程比較
4. ハモリ判定

ベスト記録のみ。レベルアップなし。

## 起動

```bash
cd ~/Projects/noctune
python3 -m http.server 8650
# http://localhost:8650/
```

## テスト

```bash
node --test test/*.test.mjs
```

## 操作感の約束

- 再生中でも答えられる（早押し）
- 答えた瞬間・次の再生の直前に `stopAll`
- 聴くボタンに発音同期リップル
- 正解／ハズレは短い快感SFX
- 音当ては正解を押すまで次へ進まない（採点は最初のタップ）
- 問題数の既定は 5 問（設定で 10/20 に変更可）
