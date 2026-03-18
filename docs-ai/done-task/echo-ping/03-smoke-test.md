# 03 — スモークテストスクリプトの変更

## 変更方針

`scripts/daemon-smoke-test.sh` を改修し、TCP ポートフォワーディングの代わりに
PING/PONG メッセージ交換で P2P 通信の疎通を確認する。

## 変更箇所

### Step 3: `listen` → `connect-offer`

```bash
# 変更前
RESULT=$(scripts/daemon-post.sh --id alice listen port=18080 2>/dev/null) || true

# 変更後
RESULT=$(scripts/daemon-post.sh --id alice connect-offer 2>/dev/null) || true
```

引数 `port` が不要になる。

### Step 6: `forward` → `connect-accept`

```bash
# 変更前
RESULT=$(scripts/daemon-post.sh --id bob forward host=localhost port=8080 2>/dev/null) || true

# 変更後
RESULT=$(scripts/daemon-post.sh --id bob connect-accept 2>/dev/null) || true
```

引数 `host` `port` が不要になる。

### Step 10 の後に追加: PING/PONG 疎通確認

接続確立 (connected) を確認後に PING を送り、PONG を確認する。

```bash
###############################################
step "11. ping (alice -> bob)"
if [[ "$ALICE_STATE" == "connected" ]]; then
  RESULT=$(scripts/daemon-post.sh --id alice ping message=hello 2>/dev/null) || true
  if echo "$RESULT" | grep -q '"ok":true'; then
    ok "ping sent"
  else
    fail "ping failed: $RESULT"
  fi
else
  fail "skipped (not connected)"
fi

###############################################
step "12. Check pong-received event (alice)"
sleep 1
STATUS=$(scripts/daemon-status.sh --id alice 2>/dev/null)
PONG=$(echo "$STATUS" | node -e "
const d=require('fs').readFileSync('/dev/stdin','utf8');
const j=JSON.parse(d);
const e=j.events.find(e=>e.type==='pong-received');
if(e && e.data==='hello') console.log(e.data);
else process.exit(1);
" 2>/dev/null) || true

if [[ "$PONG" == "hello" ]]; then
  ok "pong-received with correct message"
else
  fail "pong-received not found or wrong message"
fi
```

### Step 番号繰り上げ

既存 Step 11 (close) → Step 13、Step 12 (stop) → Step 14 に繰り上げる。

## テストフロー全体像

```
 Step  コマンド                          検証内容
 ───── ──────────────────────────────── ──────────────────────
  1    daemon-start alice               daemon 起動
  2    daemon-status alice              state=idle
  3    connect-offer (alice)            コマンド受理
  4    status → offer-ready             SDP 生成確認
  5    daemon-start bob                 daemon 起動
  6    connect-accept (bob)             コマンド受理
  7    set-remote-offer (bob)           コマンド受理
  8    status → answer-ready (bob)      SDP 生成確認
  9    set-remote-answer (alice)        コマンド受理
 10    status 両方                      state=connected
 11    ping message=hello (alice)       PING 送信
 12    status → pong-received (alice)   PONG 受信 (疎通成功)
 13    close (alice)                    クリーンアップ
 14    daemon-stop                      プロセス停止
```
