# AI Agent Brief

Keep context small. Prefer the docs in this order:

1. `Docs/CURRENT_STATUS.md`
2. `Docs/MVP_SCOPE.md`
3. `Docs/BACKLOG.md`
4. `Docs/QA_SMOKE_TEST_CHECKLIST.md`
5. `Docs/PRINTFUL_NOTES.md`
6. `Docs/DECISIONS.md`

## Do
- Focus on P0 items first.
- Keep changes minimal and reversible.
- Update `Docs/CURRENT_STATUS.md` when you complete a P0 item.
- Run `npm run sync:status` after editing `Docs/BACKLOG.md`.

## Do Not
- Reformat or rewrite docs unless asked.
- Add new large docs without removing older ones.
- Expand scope beyond `Docs/MVP_SCOPE.md`.
