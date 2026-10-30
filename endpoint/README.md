# Ask the Island — model endpoint

A small Modal web endpoint. The page POSTs `{ "question": "..." }` to
`/ask`; the endpoint asks the Meta model (Muse Spark, via the Meta Model
API) to translate the question into the structured query JSON from
`docs/ask-the-island.md`, validates the reply in `endpoint_core.py`, and
returns the query JSON object itself. The browser executes the query over the
real records. If the endpoint is down, slow, or answers nonsense, the page
falls back to its local interpreter — the island never goes mute.

## One-time setup (founder's hands)

1. **Check the credits first.** On the Meta Model API billing page for the
   account that claimed the hackathon credits, confirm the $150 credit is
   showing before any live call. Calls made before credits land charge the
   card on file.
2. **Create the secret** (the key is typed at your own prompt; it never
   goes in this repo or in chat):
   ```
   modal secret create meta-model-api META_API_KEY=<your key>
   ```
   Add `META_MODEL=<exact model id from the platform console>` to the same
   command if the console names the model differently from the default
   `muse-spark-1.3`.
3. **Deploy:**
   ```
   cd endpoint && modal deploy modal_app.py
   ```
   Modal prints the endpoint URL (`https://<workspace>--ask-the-island-ask-api.modal.run`).
4. **Point the page at it:** set `window.ASK_ENDPOINT` in `index.html` to
   that URL + `/ask`, commit, and deploy Firebase hosting
   (`life-itself-manhattan.web.app` and `.firebaseapp.com`). Those two
   origins, plus `https://humank1nd.github.io`, are the CORS allowlist in
   `modal_app.py`. A new host needs a new allowlist entry and a redeploy.
5. **Smoke test without spending:** `GET /health` returns
   `{ "ok": true, "model": ... }` and makes no model call. The first real
   question asked on the live page is the first credit spent.
