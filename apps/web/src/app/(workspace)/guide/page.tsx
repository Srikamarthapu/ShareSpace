import Link from "next/link";
import { ArrowRight, Users, Terminal, MessagesSquare, Database } from "lucide-react";
export const metadata = { title: "Workspace guide" };
export default function Page() {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">GETTING STARTED</div>
          <h1>A shared view of the work.</h1>
          <p>Two builders, one repository, and the context your agents choose to share.</p>
        </div>
      </div>
      <div className="guide-grid">
        <section className="guide-card">
          <Users size={23} aria-hidden="true" />
          <h2>Make room for your teammate</h2>
          <p>
            Name your team, link one repository, and create an invitation. An admin can rotate the
            link or remove a member.
          </p>
          <Link className="text-link" href="/setup">
            Try sample setup <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </section>
        <section className="guide-card">
          <Terminal size={23} aria-hidden="true" />
          <h2>Connect with intention</h2>
          <p>
            Review the device, repository, and capture capabilities before approval. Claude Code and
            Codex use separate ShareSpace device credentials.
          </p>
          <Link className="text-link" href="/connect">
            Review connections <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </section>
        <section className="guide-card">
          <MessagesSquare size={23} aria-hidden="true" />
          <h2>Catch up before a change</h2>
          <p>
            Read shared prompts, agent responses, and bounded tool excerpts. Warnings point to
            related work and remain advisory. A missing check is unavailable.
          </p>
          <Link className="text-link" href="/sessions">
            Explore session history <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </section>
        <section className="guide-card">
          <Database size={23} aria-hidden="true" />
          <h2>Keep sharing under control</h2>
          <p>
            Sharing starts off. Pause future uploads or keep a session private. Stored history uses
            a sliding window; a separate deletion removes your shared history.
          </p>
          <Link className="text-link" href="/storage">
            Review storage <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </section>
      </div>
      <section className="guide-callout">
        <div>
          <h2>You’re exploring a sample workspace</h2>
          <p>
            Every invitation, device, event, and storage reading here is a browser-only example. No
            real invitations are sent and no local agent sessions are uploaded. Sample controls let
            you try the flow while the live workspace service is being connected.
          </p>
          <Link className="button button-primary" href="/login">
            Sign in to your account <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
