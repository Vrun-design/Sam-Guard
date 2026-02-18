# Contributing to Sam Guard

Thanks for your interest. Sam Guard is intentionally minimal — please read this before opening a PR.

## Ground rules

1. **Read the README and PROJECT_BRIEF.md first.** Understand what this is and what it is not.
2. **No features outside scope.** Sam Guard is a gate, not a framework. See the non-goals in the README.
3. **No agent framework imports in `/core`.** Core must stay agent-agnostic.
4. **No payment or compliance logic.** Ever.
5. **Prefer boring code.** Explicit over clever.

## Development setup

```bash
git clone https://github.com/varun/sam-guard
cd sam-guard
npm install
npm run build
npm test
```

## Making changes

- **New built-in rules** → add to `core/gate.ts` and export from `core/index.ts`
- **New adapter examples** → add to `adapters/examples/`
- **Spec changes** → update `spec/transaction-intent.md`

## PR checklist

- Tests added or updated
- No new runtime dependencies
- No agent framework imports in `/core`
- README updated if public API changed

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md).

## Questions

Open a GitHub Discussion or file an issue.
