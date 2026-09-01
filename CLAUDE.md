# How to write here

Every sentence is a **claim**, an **order**, or a **measurement**. Anything else
is narration — cut it before writing it. This holds in chat, in code comments, in
commit messages, in the changelog, and in every markdown file here.

- **claim** — can be contested, and the reader acts differently if it does not
  hold.
- **order** — something to run or to do.
- **measurement** — a command and what it printed.

Before you write anything that is not code, run `/prose`.

# What this is

An Electron app: Modbus TCP and RTU, client and server, in one window.

```
src/main/      the Electron main process — Modbus client, servers, device state
src/preload/   the bridge; window.api is generated from IPC_CHANNELS
src/shared/    types, Zod schemas, pure helpers, migrations
src/renderer/  the React UI
```

`@renderer/*` and `@shared` are the import aliases. There are no others.

# Four things that break if you do not know them

- **Nothing in `src/shared` may import from `src/main`.** All three processes
  import shared; it is the one layer that may not reach back.
- **One store selector per field.** `useRootZustand((z) => z.a)` and then
  `((z) => z.b)`, never one selector returning an object. The renderer has zero
  whole-store subscriptions and zero `useShallow`, and that is why it renders a
  two-thousand-row grid without either.
- **`window.api` is generated.** A channel is a name in `IPC_CHANNELS`, a type in
  `IpcHandlerSpec`, and a one-line handler in `main/ipc.ts`. The camelCase method
  appears by itself.
- **Every interactive element carries a `data-testid`.** The e2e suite addresses
  the UI through them.

`src/__tests__/conformance.test.ts` asserts nine conventions, three of them
these, so breaking one fails `yarn test`. What each of the nine means, and the
two no test can see, is in CONTRIBUTING.md under *Code style*.

# The rules

@CONTRIBUTING.md

# What is slow, and what that means

```sh
yarn lint && yarn typecheck && yarn test    # about 75 seconds, most of it typecheck
yarn test:e2e                               # builds first, then minutes
```

Run the e2e specs a change touches while you work, and the suite once, at the
end. `e2e/specs/01-main/` is numbered in the order it runs.
