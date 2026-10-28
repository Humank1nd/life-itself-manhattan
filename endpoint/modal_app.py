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


@app.function(image=image, secrets=[modal.Secret.from_name("meta-model-api")])
@modal.asgi_app()
def ask_api():
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    from openai import OpenAI

    web = FastAPI()
    web.add_middleware(
        CORSMiddleware,
        allow_origins=[ALLOWED_ORIGIN],
        allow_methods=["POST", "GET"],
        allow_headers=["Content-Type"],
    )
    client = OpenAI(
        base_url="https://api.meta.ai/v1",
        api_key=os.environ["META_API_KEY"],
        max_retries=0,
    )
    model = os.environ.get("META_MODEL", "muse-spark-1.3")

    @web.get("/health")
    def health():
        # No model call. Safe to poll; spends nothing.
        return {"ok": True, "model": model}

    @web.post("/ask")
    async def ask(req: Request):
        body = await req.json()
        question = str(body.get("question", "")).strip()[:300]
        if not question:
            return JSONResponse({"error": "empty question"}, status_code=400)
        try:
            resp = client.responses.create(
                model=model,
                instructions=INSTRUCTIONS,
                input=question,
                store=False,
                max_output_tokens=300,
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
            return JSONResponse({"error": "model reply incomplete"}, status_code=502)
        try:
            query = parse_and_validate(resp.output_text)
        except ValueError:
            return JSONResponse({"error": "model reply failed validation"}, status_code=422)
        return {"query": query}

    return web
