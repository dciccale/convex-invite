# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private
security advisory flow for `dciccale/convex-invite` and include the affected
version, reproduction, impact, and any suggested mitigation. Maintainers should
acknowledge a report within five business days.

## Boundary and host responsibilities

The component stores a SHA-256 digest, never the raw bearer token. The raw token
is returned only by successful `issue` and `resend` calls. The host remains
responsible for:

- authenticating and authorizing every exported wrapper;
- verifying and normalizing the invitee audience reference;
- rate-limiting public preview and acceptance endpoints;
- preventing tokens from entering logs, analytics, browser persistence, error
  text, provider payload history, and referrer headers;
- applying the domain grant in the same top-level mutation as acceptance; and
- choosing a transport and canonical acceptance URL.

Bearer URLs can still appear in browser history and reverse-proxy access logs.
Never put a raw token in scheduled-function arguments. Minimize its lifetime
and visibility.
SHA-256 storage protects against accidental database disclosure but does not
make a leaked raw token safe.

The component does not verify accounts, encrypt transport, send messages,
authorize users, or protect an insecure host wrapper.
