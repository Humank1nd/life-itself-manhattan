"""Ask the Island — the model endpoint (Modal).

Transport follows the DreamSuite cloud provider's proven invariants
(Humank1nd/DreamSuite, docs/integration/META_MODEL_API.md, owner decision
2026-10-11): official Meta Model API host only (https://api.meta.ai/v1),
OpenAI-compatible Responses API, credential server-side, store: false,
zero automatic retries, bounded output budget.

The credential lives in a Modal secret named "meta-model-api" holding
META_API_KEY (and optionally META_MODEL). It is created by the founder
from his own terminal — the key never appears in this repo, in the page,
or in chat. Deploy: see endpoint/README.md.
"""

import os
import sys

import modal

for _p in (os.path.dirname(os.path.abspath(__file__)), "/root"):
    if _p not in sys.path:
        sys.path.insert(0, _p)  # local dir at deploy time, /root inside the container
from endpoint_core import INSTRUCTIONS, parse_and_validate  # noqa: E402

app = modal.App("ask-the-island")

_DIR = os.path.dirname(os.path.abspath(__file__))
image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("fastapi[standard]", "openai")
    # Absolute paths: relative sources resolve against the caller's working
    # directory and break when deploying from inside endpoint/ (found live
    # 2026-10-28: "endpoint/endpoint/endpoint_core.py does not exist").
    .add_local_file(os.path.join(_DIR, "neighborhoods.json"), "/root/neighborhoods.json")
    .add_local_file(os.path.join(_DIR, "endpoint_core.py"), "/root/endpoint_core.py")
)

ALLOWED_ORIGIN = "https://humank1nd.github.io"


@app.function(image=image, secrets=[modal.Secret.from_name("meta-model-api")], timeout=180)
@modal.asgi_app()
def ask_api():
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    from openai import AsyncOpenAI

    web = FastAPI()
    web.add_middleware(
        CORSMiddleware,
        allow_origins=[ALLOWED_ORIGIN],
        allow_methods=["POST", "GET"],
        allow_headers=["Content-Type"],
    )
    model = os.environ.get("META_MODEL", "muse-spark-1.3")

    def make_client():
        # Built per request, never at app start: a credential problem must
        # fail ONE request with a clean error, not crash-loop the container
        # (found live 2026-10-28: an empty secret value raised at client
        # construction inside the app factory, so /health hung too and
        # Modal's proxy held every request in silence).
        # AsyncOpenAI + an explicit timeout: the sync client inside an async
        # handler blocks the server's only worker for the whole model call,
        # and the SDK's default timeout is 10 minutes. 60s is generous for
        # this translation; the page gives up at 25s and answers locally.
        key = os.environ.get("META_API_KEY", "").strip()
        if not key:
            return None
        return AsyncOpenAI(
            base_url="https://api.meta.ai/v1",
            api_key=key,
            max_retries=0,
            timeout=60.0,
        )

    @web.get("/health")
    def health():
        # No model call, no credential dependency. Safe to poll; spends nothing.
        return {"ok": True, "model": model}

    @web.post("/ask")
    async def ask(req: Request):
        body = await req.json()
        question = str(body.get("question", "")).strip()[:300]
        if not question:
            return JSONResponse({"error": "empty question"}, status_code=400)
        client = make_client()
        if client is None:
            return JSONResponse({"error": "endpoint not configured"}, status_code=500)
        try:
            resp = await client.responses.create(
                model=model,
                instructions=INSTRUCTIONS,
                input=question,
                store=False,
                # Muse Spark reasons before it answers; the budget must cover
                # the reasoning as well as the tiny JSON reply. 300 starved it
                # (found live 2026-10-28: status "incomplete", no output).
                max_output_tokens=2048,
            )
        except Exception as e:
            # Sanitized to the client on purpose: auth/billing/rate details
            # never leak. Server-side we log only the exception type and HTTP
            # status (never the key, headers, or message body) so a failed
            # freeze test can be told apart: 401 = secret/key, 404 = model id.
            import sys
            print(f"ask: meta call failed: {type(e).__name__} "
                  f"status={getattr(e, 'status_code', None)}", file=sys.stderr)
            return JSONResponse({"error": "model unavailable"}, status_code=502)
        if getattr(resp, "status", None) != "completed" or not getattr(resp, "output_text", None):
            import sys
            print(f"ask: reply incomplete: status={getattr(resp, 'status', None)} "
                  f"details={getattr(resp, 'incomplete_details', None)} "
                  f"has_text={bool(getattr(resp, 'output_text', None))}", file=sys.stderr)
            return JSONResponse({"error": "model reply incomplete"}, status_code=502)
        try:
            query = parse_and_validate(resp.output_text)
        except ValueError:
            return JSONResponse({"error": "model reply failed validation"}, status_code=422)
        # Bare query object: the page's interpreter contract takes the query
        # JSON itself, not a wrapper (contract fixed 2026-10-28).
        return query

    return web
