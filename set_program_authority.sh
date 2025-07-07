#!/usr/bin/env bash

set -euo pipefail

# --- Input arguments ---
PROGRAM_ID="$1"
NEW_AUTHORITY_B58="$2"
SURFPOOL_RPC_URL="${3:-http://localhost:8899}"

# --- Dependencies check ---
for cmd in solana jq base64 dd xxd python3 curl; do
  command -v $cmd >/dev/null || { echo "Missing dependency: $cmd"; exit 1; }
done

# --- Step 1: Get ProgramData address ---
PROGRAM_SHOW=$(solana program show "$PROGRAM_ID")
PROGRAMDATA_ADDR=$(echo "$PROGRAM_SHOW" | grep "ProgramData Address:" | awk '{print $3}')
if [[ -z "$PROGRAMDATA_ADDR" ]]; then
  echo "Could not find ProgramData address for $PROGRAM_ID"
  exit 1
fi
echo "ProgramData Address: $PROGRAMDATA_ADDR"

# --- Step 2: Fetch ProgramData account info ---
solana account "$PROGRAMDATA_ADDR" --output json > programdata.json

LAMPORTS=$(jq '.account.lamports' programdata.json)
RENT_EPOCH=$(jq '.account.rentEpoch' programdata.json)
OWNER=$(jq -r '.account.owner' programdata.json)
BASE64DATA=$(jq -r '.account.data[0]' programdata.json)

# --- Step 3: Decode account data to binary ---
echo "$BASE64DATA" | base64 -d > programdata.bin

# --- Step 4: Validate and decode new authority ---
if [[ ${#NEW_AUTHORITY_B58} -lt 32 || ${#NEW_AUTHORITY_B58} -gt 44 ]]; then
  echo "New authority pubkey must be a valid base58 string (32 bytes when decoded)"
  exit 1
fi
python3 -c "import base58,sys; d=base58.b58decode(sys.argv[1]); assert len(d)==32, 'Decoded pubkey is not 32 bytes'; open('new_authority.bin','wb').write(d)" "$NEW_AUTHORITY_B58"

# --- Step 5: Patch authority bytes at offset 13 ---
dd if=new_authority.bin of=programdata.bin bs=1 seek=13 count=32 conv=notrunc 2>/dev/null

# --- Step 6: Convert patched data to hex ---
xxd -p programdata.bin | tr -d '\n' > programdata_modified.hex

# --- Step 7: Build JSON payload ---
cat <<EOF > payload.json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "surfnet_setAccount",
  "params": [
    "$PROGRAMDATA_ADDR",
    {
      "lamports": $LAMPORTS,
      "data": "$(cat programdata_modified.hex)",
      "owner": "$OWNER",
      "executable": false,
      "rent_epoch": $RENT_EPOCH
    }
  ]
}
EOF

# --- Step 8: Send the payload ---
echo "Sending surfnet_setAccount RPC to $SURFPOOL_RPC_URL ..."
curl -X POST "$SURFPOOL_RPC_URL" -H "Content-Type: application/json" -d @payload.json

echo
echo "Done. You may want to verify the authority with:"
echo "solana account $PROGRAMDATA_ADDR --output json | jq -r '.account.data[0]' | base64 -d | dd bs=1 skip=13 count=32 2>/dev/null | python3 -c \"import base58,sys; print(base58.b58encode(sys.stdin.buffer.read()).decode())\"" 
echo "Program authority is now: "
solana account $PROGRAMDATA_ADDR --output json | jq -r '.account.data[0]' | base64 -d | dd bs=1 skip=13 count=32 2>/dev/null | python3 -c "import base58,sys; print(base58.b58encode(sys.stdin.buffer.read()).decode())"