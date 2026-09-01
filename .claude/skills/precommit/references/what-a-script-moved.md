# What a script moved without saying so

**A split left six section banners naming the wrong thing.** `AddRegister.tsx`
was 900 lines and 27 components; a script cut it into five files on each `const`
line. A banner sits *above* the component it introduces, so every one of them
stayed behind with the component before it.

| the banner | what ended up under it |
| --- | --- |
| `// Min Max components` | `IntervalInputForward` |
| `// Fixed Or Generator` | `CommentField` |
| `// MAIN`, `// Comment`, `// Shared submit logic` | nothing, end of file |

Jens found the first by reading the diff. The sweep that found the other five
was a script too:

```sh
python3 - <<'PY'
import re, pathlib
for f in pathlib.Path('<dir>').glob('*.tsx'):
    s = f.read_text()
    for m in re.finditer(r'^(?://\n)+// (.+)$', s, re.M):
        nxt = re.search(r'^(?:export )?(?:const|function) (\w+)', s[m.end():], re.M)
        print(f.name, m.group(1), '->', nxt.group(1) if nxt else 'NOTHING')
PY
```

**Nothing failed.** Lint passed, typecheck passed, 591 unit tests and 86 e2e
specs passed. A banner is prose, and prose has no suite — which is why the check
has to be a command run against the diff rather than a suite waited on.
