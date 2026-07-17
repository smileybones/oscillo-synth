# Security Policy

## Supported Versions

oscillo-synth doesn't have formal releases yet — only the latest code on `main` is supported.

## Reporting a Vulnerability

Please **don't** open a public issue for a security concern.

Instead, use GitHub's private reporting:

1. Go to the [Security tab](https://github.com/smileybones/oscillo-synth/security) of this repository.
2. Click "Report a vulnerability" to open a private advisory.

Or email [41030804+smileybones@users.noreply.github.com](mailto:41030804+smileybones@users.noreply.github.com).

You should get a response within a few days. This is a small hobby project maintained in spare time, so please be patient.

## Scope

oscillo-synth is a client-side-only application (browser and Electron builds) — there's no server or backend, and it doesn't collect or transmit user data. The most relevant concerns are things like:

- A malicious SVG/font/3D model/video/Lua script file causing unexpected behavior beyond the current tab/window (e.g. escaping the Lua sandbox, or a parser vulnerability in a bundled dependency)
- Anything in the Electron desktop app that could grant a webpage more access than intended (e.g. a way around the app's permission allowlist or context isolation)

Reasonable prototype-pollution or DoS-via-malformed-input reports are welcome, but please note this is a hobby project — a perfect security posture isn't the bar, just genuine, exploitable issues.
