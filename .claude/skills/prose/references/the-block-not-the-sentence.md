# What a block nobody re-read cost

Why `/prose` prunes the block and not the sentence.

**A comment that survived a move stops being true without being edited.**
`AddRegister.tsx` was split into five files by a script that cut on each `const`
line. A section banner sits *above* the component it introduces, so every banner
stayed behind with the component before it.

Jens found the first one by reading the diff: a `// MAIN` at the end of
`addRegisterActions.tsx`, introducing nothing. A sweep found five more of the
same shape, one of them mislabelling a live component:

| banner | what was under it |
| --- | --- |
| `// Min Max components` | `IntervalInputForward` |
| `// Fixed Or Generator` | `CommentField` |
| `// MAIN`, `// Comment`, `// Shared submit logic` | end of file |
| `// Toggle endianness button removed` | end of file, and already dead before the split |

Nothing failed. Lint passed, typecheck passed, 591 tests passed, and 86 E2E
specs passed. A banner is prose, and prose has no suite.

**The same day, an edit left a keyword behind.** Reading the app version off the
store instead of over IPC removed the only `await` from two handlers, and left
`async` on both. Jens found those by reading too.

```sh
yarn lint    # passes: require-await is not enabled
```

Both are the same failure: the sentence that was edited was checked, and the
block it lived in was not re-read.
