+# Elastos ELA Merge Mining Reference
+
+This document summarizes the key parameters needed when integrating ELA with a merge mining proxy or stratum server.
+
+## AuxPow Parameters
+
+The ELA codebase defines the AuxPow chain ID and the merged mining header used in the Bitcoin coinbase of the parent block.
+
+```go
+var (
+    AuxPowChainID         = 1224
+    pchMergedMiningHeader = []byte{0xfa, 0xbe, 'm', 'm'}
+)
+```
+
+Reference: `auxpow/auxpow.go` lines 17–20.
+
+The merged mining header (`0xfa 0xbe 6d 6d`) must be placed in the parent coinbase script before the auxiliary block hash, merkle size and merkle nonce. The helper that constructs this coinbase for local mining is shown in `auxpow/btcfaker.go`.
+
+```go
+magic = [4]byte{0xfa, 0xbe, 'm', 'm'}
+auxBlockHash = msgBlockHash
+binary.Write(scriptSigBuf, binary.LittleEndian, magic)
+binary.Write(scriptSigBuf, binary.LittleEndian, auxBlockHash)
+```
+
+Reference: `auxpow/btcfaker.go` lines 16–30.
+
+## JSON‑RPC Interfaces
+
+ELA exposes two RPC methods that a merge mining proxy needs to interact with:
+
+* **`createauxblock`** – generates an auxiliary block template.
+* **`submitauxblock`** – submits the solved `auxpow` for a given block hash.
+
+Example `createauxblock` response:
+
+```json
+{
+  "result": {
+    "chainid": 1224,
+    "height": 152789,
+    "coinbasevalue": 175799086,
+    "bits": "1d36c855",
+    "hash": "e28a262b38316fddefb0b5c753f7cc0022afe94e95f881576ad6b8f33f4e49fe",
+    "previousblockhash": "f297d03791f4cf2c6ef093b02a77465ea876b040b7772e56b8e140f3bff73871"
+  }
+}
+```
+
+Reference: `docs/jsonrpc_apis.md` lines 955–961.
+
+The solved block must then be sent back using `submitauxblock` with the `blockhash` and corresponding `auxpow`.
+
+## Integration Task for Node Merged Pool
+
+To merge mine BTC and ELA using the Node Merged Pool project:
+
+1. Update the pool configuration to include a new auxiliary chain with:
+   - **Chain ID:** `1224`
+   - **Merged mining header:** `fa be 6d 6d`
+   - RPC endpoints for `createauxblock` and `submitauxblock`.
+2. In the stratum proxy, parse the ELA fields returned by `createauxblock` and construct the parent coinbase script according to the layout in `btcfaker.go`.
+3. When a Bitcoin block candidate is found, embed the generated auxpow data and submit it to ELA via `submitauxblock`.
+4. Monitor the RPC response to ensure the block is accepted.
+
+This setup will allow the Node Merged Pool to correctly merge mine ELA alongside Bitcoin.
