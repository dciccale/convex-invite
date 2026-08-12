import { ArrowRight, DatabaseZap, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { InviteLifecycle } from "@/components/invite-lifecycle";

const features = [
  {
    icon: ShieldCheck,
    title: "Hash-only by design",
    body: "Generate 256-bit tokens server-side. Persist only their versioned SHA-256 digest.",
  },
  {
    icon: RefreshCw,
    title: "Serializable lifecycle",
    body: "Accept, decline, revoke, expire, and resend race safely inside Convex transactions.",
  },
  {
    icon: DatabaseZap,
    title: "Your app keeps authority",
    body: "Authentication, delivery, memberships, and product policy remain in host code.",
  },
];

export default function HomePage() {
  return (
    <main className="marketing-shell flex flex-1 flex-col">
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="status">
              <span /> OPEN SOURCE · CONVEX COMPONENT
            </div>
            <h1>Invitations without the security footguns.</h1>
            <p className="lede">
              A small, transactional invitation primitive for Convex. Single-use
              links, exact audience binding, atomic grants, and safe resends.
            </p>
            <div className="hero-actions">
              <Link href="/docs" className="button primary">
                Get started <ArrowRight size={16} />
              </Link>
              <a
                className="button secondary"
                href="https://github.com/dciccale/convex-invite"
              >
                View source
              </a>
            </div>
            <div className="install">
              <span>$</span>
              <code>bun add convex-invite</code>
            </div>
          </div>
          <InviteLifecycle />
        </div>
      </section>

      <section className="feature-section">
        <div className="section-kicker">THE COMPONENT BOUNDARY</div>
        <h2>One hard problem, solved once.</h2>
        <p className="section-intro">
          The component owns invitation state and concurrency. Your application
          owns identity and the access it grants.
        </p>
        <div className="feature-grid">
          {features.map((feature) => (
            <article key={feature.title}>
              <feature.icon size={20} />
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="code-band">
        <div>
          <div className="section-kicker">ATOMIC ACCEPTANCE</div>
          <h2>The invitation and your grant commit together.</h2>
          <p>
            If membership creation fails, acceptance rolls back. Retrying as the
            same subject returns the original result.
          </p>
        </div>
        <pre>
          <code>{`const grant = await invites.accept(ctx, {
  token,
  acceptedBy: identity.subject,
  audienceRef: verifiedEmail,
});

const membershipId = await ctx.db.insert(
  "memberships",
  toMembership(grant),
);

await invites.setAcceptanceResult(ctx, {
  ...grant,
  result: { membershipId },
});`}</code>
        </pre>
      </section>

      <section className="final-cta">
        <span className="orb" />
        <h2>Ship the invite flow. Keep the invariants.</h2>
        <Link href="/docs">
          Read the documentation <ArrowRight size={16} />
        </Link>
      </section>
    </main>
  );
}
