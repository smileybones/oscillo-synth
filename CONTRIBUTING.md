# Contributing to oscillo-synth

Thanks for taking a look. This is a small hobby project, so keep expectations proportional — but bug reports, fixes, and small feature contributions are genuinely welcome.

## Before you start

For anything more than a small fix (a new effect, a new shape source, a UI change), please open an issue first to discuss the approach. It's a lot less frustrating than writing a PR that doesn't fit the project's direction.

## Development setup

Requires [Node](https://nodejs.org/) 18+ and [pnpm](https://pnpm.io/).

```bash
git clone https://github.com/smileybones/oscillo-synth.git
cd oscillo-synth
pnpm install
pnpm dev            # browser version
pnpm dev:desktop    # desktop (Electron) version
```

See the [README](README.md#project-structure) for how the packages fit together.

## Before opening a pull request

```bash
pnpm typecheck   # every package
pnpm build       # apps/web
pnpm build:desktop
```

There's no automated test suite yet — manually exercise whatever you changed (add the shape/effect/synth control you touched, confirm it renders/plays correctly) and say what you tested in the PR description.

## Code style

- TypeScript, strict mode. No framework in `packages/ui-web` — plain HTML template strings and event delegation; keep new UI consistent with that pattern rather than introducing a different one.
- Comments should explain *why*, not *what* — skip comments that just restate the code.
- Match the existing formatting (Prettier-compatible; no dedicated config file yet, follow what's around your change).
- Keep `packages/engine` free of DOM/Node/Web-API dependencies — it needs to stay usable from the AudioWorklet and any future non-browser host.

## Reporting bugs

Open an issue with what you did, what you expected, and what happened instead. For anything audio/MIDI-related, your OS/browser (or "desktop app") and device help a lot.

## Security issues

Please don't open a public issue for a security concern — see [SECURITY.md](SECURITY.md).
