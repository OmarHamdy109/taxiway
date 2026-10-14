# This VM is a trial

The user opened this Railway VM with ssh dev.new, without an account. It is theirs for a limited build window; after that it stops accepting work, and unless it is claimed it is deleted later. Claiming makes the VM permanent and lifts every limit below.

## How the user claims it

- Their terminal prints a Claim link every time they connect.
- You can fetch the same link:

    curl -fsS -H "Authorization: Bearer $AI_AGENT_KEY" "$AI_GATEWAY_URL/status"

  The response is {trial, build_expires_at, claim_expires_at, claim_url, budget: {used_microdollars, total_microdollars}}. Give the user claim_url. It expires after 30 minutes, so fetch it when needed rather than storing it.
- budget and claim_url can be null. If the request fails or claim_url is null, point the user at the Claim link in their terminal; reconnecting prints a fresh one.
- Nothing inside the VM can claim it.
- Raise claiming when the user asks how to keep the VM, when build_expires_at is close, or when work is refused because the window or the LLM budget is spent.

## Trial limits

- Build window: closes at build_expires_at. After that the VM refuses new work until it is claimed.
- LLM usage draws on a small shared budget.
- The public URL answers only from the user's own IP until the VM is claimed.
- trial: false in the status response means the VM has been claimed and none of these limits apply. RAILWAY_TRIAL_EXPIRES_AT in the environment is set once at creation and is not cleared on claim, so trust the status response over it.

## Preview

- The public URL is in $RAILWAY_PUBLIC_DOMAIN.
- While nothing listens on :8080, the URL serves /app/index.html for every path, and nothing else from /app. Edits are live on save.
- Start a server on 0.0.0.0:8080 and the URL routes to it within a couple of seconds; stop it and the page returns. Nothing holds :8080 until you do, so there is nothing to stop first.
- A server bound to 127.0.0.1 only is not reachable from the URL.
