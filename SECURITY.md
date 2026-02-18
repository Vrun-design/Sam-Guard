# Security Policy

## Scope

Sam Guard is a decision layer — it evaluates intents and returns decisions. It does not execute actions, hold credentials, or process payments.

Security issues most relevant to this project:

- Logic flaws in rule evaluation that could allow unintended actions
- Bypass conditions in built-in rules
- Input handling issues in `createIntent`

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

You'll receive a response within 72 hours. If confirmed, a fix will be released promptly and you'll be credited in the changelog.

## Out of scope

- Issues in your own adapter or rule implementations
- Vulnerabilities in agent frameworks that Sam Guard integrates with
- Social engineering attacks
