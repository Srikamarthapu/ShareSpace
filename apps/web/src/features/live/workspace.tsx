"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Bell,
  GitBranch,
  LayoutGrid,
  MessageSquareText,
  Settings2,
  ChevronRight,
} from "lucide-react";
import {
  AGENT_LABELS,
  teamsRequestSchema,
  teamsResponseSchemas,
  devicesResponseSchemas,
  type PairingView,
  type SessionRow,
} from "@workspace/core";
import { signOut } from "@/features/auth/actions";
import { MemberAvatar } from "@/components/ui";
import { useLiveWorkspace, mutate } from "./data";
import { repositoryInput, repositoryInputError } from "./repository-input";
import { LiveSessions, LiveTranscript } from "./transcript";
import { LiveOverview } from "./overview";
import "./workspace.css";

const navigation = [
  { view: "team", title: "Workspace", icon: LayoutGrid },
  { view: "sessions", title: "Sessions", icon: MessageSquareText },
  { view: "warnings", title: "Warnings", icon: Bell },
  { view: "settings", title: "Settings", icon: Settings2 },
];
function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not available";
}
function mb(value: number) {
  return `${(value / 1_000_000).toFixed(2)} MB`;
}
function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function LiveWorkspace({
  user,
  query,
}: {
  user: { id: string; email: string };
  query: Record<string, string>;
}) {
  const router = useRouter();
  const view =
    query.view === "settings" && (query.tab === "devices" || query.tab === "storage")
      ? query.tab
      : (query.view ?? "team");
  const settingsOpen = ["settings", "devices", "storage", "manage"].includes(view);
  const [eventLimit, setEventLimit] = useState(100);
  const { client, data, loading, error, connection, refresh } = useLiveWorkspace(
    user.id,
    query.session,
    eventLimit,
    query.repository,
  );
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [createErrors, setCreateErrors] = useState<{ team?: string; repository?: string }>({});
  const [repositoryError, setRepositoryError] = useState("");
  const [invite, setInvite] = useState("");
  const [pairing, setPairing] = useState<PairingView | null>(null);
  const [code, setCode] = useState(query.code ?? "");
  const self = data.members.find((member) => member.user_id === user.id);
  const ownName = self?.display_name ?? user.email;
  const selected = data.selected?.id === query.session ? data.selected : null;
  const currentTitle = settingsOpen
    ? "Settings"
    : (navigation.find((item) => item.view === view)?.title ?? "Workspace guide");
  const isAdmin = self?.role === "admin";
  async function act(work: () => Promise<void>, success?: string) {
    setPending(true);
    setActionError("");
    setNotice("");
    try {
      await work();
      await refresh();
      if (success) setNotice(success);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The action could not be completed.");
    } finally {
      setPending(false);
    }
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const repository = repositoryInput(String(form.get("repository_name") ?? ""));
    const request = teamsRequestSchema.safeParse({
      action: "create_team",
      team_name: String(form.get("team_name") ?? "").trim(),
      repository_name: repository ?? "",
    });
    setActionError("");
    if (!request.success) {
      const errors = {
        ...(request.error.issues.some((issue) => issue.path[0] === "team_name")
          ? { team: "Enter a team name with 2–80 characters." }
          : {}),
        ...(!repository ? { repository: repositoryInputError } : {}),
      };
      setCreateErrors(errors);
      const field = element.elements.namedItem(errors.team ? "team_name" : "repository_name");
      if (field instanceof HTMLInputElement) field.focus();
      return;
    }
    setCreateErrors({});
    await act(async () => {
      await mutate(client, "teams", request.data);
      router.replace("/live?view=manage");
    }, "Your team is ready. Invite your teammate next.");
  }
  async function loadInvite(rotate: boolean) {
    if (!data.team) return;
    await act(
      async () => {
        const value = await mutate(client, "teams", {
          action: rotate ? "rotate_invite" : "get_invite",
          team_id: data.team!.id,
        });
        const result = teamsResponseSchemas.get_invite.parse(value);
        setInvite(
          result.invite_token
            ? new URL(`/join/${result.invite_token}`, window.location.origin).href
            : "",
        );
        if (!result.invite_token) setNotice("No invitation yet. Create a new invite link below.");
      },
      rotate ? "New invitation created. Previous invite links no longer work." : undefined,
    );
  }
  const [preview, setPreview] = useState<{ state: string; team_name: string | null } | null>(null);
  useEffect(() => {
    if (!query.invite) return;
    let cancelled = false;
    void mutate(client, "teams", { action: "preview_invite", token: query.invite })
      .then((value) => {
        if (!cancelled) setPreview(teamsResponseSchemas.preview_invite.parse(value));
      })
      .catch(() => {
        if (!cancelled) setPreview({ state: "invalid", team_name: null });
      });
    return () => {
      cancelled = true;
    };
  }, [client, query.invite]);
  function sharing(enabled?: boolean, paused?: boolean) {
    if (!data.repository) return;
    void act(async () => {
      await mutate(client, "sharing", {
        action: "set_sharing",
        repository_id: data.repository!.id,
        ...(enabled === undefined ? {} : { enabled }),
        ...(paused === undefined ? {} : { paused }),
      });
    }, "Sharing preferences saved.");
  }
  function visibility(session: SessionRow) {
    void act(async () => {
      await mutate(client, "sharing", {
        action: "set_session_visibility",
        session_id: session.id,
        visibility: session.visibility === "shared" ? "private" : "shared",
      });
    }, "Session visibility updated.");
  }
  const heading = (title: string, subtitle: string) => (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <button
        className="button button-secondary"
        type="button"
        disabled={pending || loading}
        onClick={() => void refresh()}
      >
        Refresh
      </button>
    </div>
  );

  return (
    <div className="app-shell live-workspace">
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <Link className="brand" href="/live">
          ShareSpace<span className="version">alpha</span>
        </Link>
        <div className="nav-caption">PROJECT</div>
        <nav aria-label="Workspace navigation" className="main-navigation">
          {navigation.map(({ view: itemView, title, icon: Icon }) => (
            <Link
              key={itemView}
              href={`/live?view=${itemView}`}
              className={`nav-item ${view === itemView || (itemView === "settings" && settingsOpen) ? "selected" : ""}`}
              aria-current={
                view === itemView || (itemView === "settings" && settingsOpen) ? "page" : undefined
              }
            >
              <Icon size={17} aria-hidden="true" />
              {title}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link className="guide-link" href="/live?view=guide">
            <BookOpen size={17} aria-hidden="true" />
            Setup guide
          </Link>
          <div className="profile">
            <span className="avatar avatar-small" aria-hidden="true">
              {ownName.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{ownName}</strong>
              <span>{self?.role ?? "Your account"}</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <strong>{data.team?.name ?? "Your workspace"}</strong>
            <ChevronRight size={14} aria-hidden="true" />
            <span>{currentTitle}</span>
          </div>
          <div className="workspace-mode">
            <form action={signOut}>
              <button className="button button-secondary" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {actionError && (
            <p className="live-feedback error-text" role="alert">
              {actionError}
            </p>
          )}
          {notice && (
            <p className="live-feedback" role="status">
              {notice}
            </p>
          )}
          {loading ? (
            <p role="status">Loading your workspace…</p>
          ) : error ? (
            <>
              <h1>Workspace unavailable</h1>
              <p role="alert">{error}</p>
              <div className="live-actions">
                <button className="button button-primary" onClick={() => void refresh()}>
                  Retry
                </button>
                <Link className="button button-secondary" href="/login">
                  Sign in again
                </Link>
              </div>
            </>
          ) : (
            <>
              {query.invite && (
                <section className="setup-panel live-section">
                  <h2>{preview?.team_name ? `Join ${preview.team_name}` : "Team invitation"}</h2>
                  {!preview ? (
                    <p>Checking invitation…</p>
                  ) : preview.state !== "valid" ? (
                    <p>
                      This invitation is unavailable or has been replaced. Ask the team
                      administrator for a fresh link.
                    </p>
                  ) : (
                    <>
                      <p>
                        Joining gives your team access to sessions you explicitly share. New
                        accounts start with sharing off.
                      </p>
                      <button
                        disabled={pending}
                        className="button button-primary"
                        onClick={() =>
                          void act(async () => {
                            await mutate(client, "teams", {
                              action: "accept_invite",
                              token: query.invite,
                            });
                            router.replace("/live?view=manage");
                          }, "You joined the team.")
                        }
                      >
                        Join team
                      </button>
                    </>
                  )}
                </section>
              )}
              {!data.team ? (
                <>
                  {heading(
                    "Welcome to ShareSpace",
                    "Create your team or open an invitation from your teammate.",
                  )}
                  <section className="setup-panel live-narrow">
                    <h2>Start a workspace</h2>
                    <p>
                      One repository, shared context, and explicit control over what leaves your
                      machine.
                    </p>
                    <form className="live-form" onSubmit={create}>
                      <label htmlFor="team-name">Team name</label>
                      <input
                        id="team-name"
                        name="team_name"
                        required
                        minLength={2}
                        maxLength={80}
                        placeholder="Your team"
                        aria-invalid={!!createErrors.team}
                        aria-describedby={createErrors.team ? "team-name-error" : undefined}
                        onChange={() => setCreateErrors((value) => ({ ...value, team: undefined }))}
                      />
                      {createErrors.team && (
                        <span id="team-name-error" className="error-text" role="alert">
                          {createErrors.team}
                        </span>
                      )}
                      <label htmlFor="repository-name">GitHub repository</label>
                      <input
                        id="repository-name"
                        name="repository_name"
                        required
                        maxLength={2048}
                        placeholder="owner/repository or GitHub URL"
                        aria-invalid={!!createErrors.repository}
                        aria-describedby={`repository-help${createErrors.repository ? " repository-name-error" : ""}`}
                        onChange={() =>
                          setCreateErrors((value) => ({ ...value, repository: undefined }))
                        }
                      />
                      {createErrors.repository && (
                        <span id="repository-name-error" className="error-text" role="alert">
                          {createErrors.repository}
                        </span>
                      )}
                      <span id="repository-help" className="muted small">
                        Paste a GitHub repository URL or enter owner/repository. This does not grant
                        GitHub access or upload code.
                      </span>
                      <button className="button button-primary" type="submit" disabled={pending}>
                        Create team
                      </button>
                    </form>
                  </section>
                </>
              ) : (
                <>
                  {settingsOpen && (
                    <nav className="live-settings-tabs" aria-label="Settings sections">
                      {[
                        { view: "manage", label: "Team" },
                        { view: "settings", label: "Sharing" },
                        { view: "devices", label: "Connections" },
                        { view: "storage", label: "Storage" },
                      ].map((item) => (
                        <Link
                          key={item.view}
                          href={`/live?view=${item.view}`}
                          aria-current={view === item.view ? "page" : undefined}
                        >
                          {item.label}
                        </Link>
                      ))}
                      <Link href="/live/billing">Billing</Link>
                    </nav>
                  )}
                  {view === "team" && <LiveOverview data={data} />}
                  {view === "manage" && (
                    <>
                      {heading(
                        "Your team",
                        "Invite a teammate and coordinate on the same repository.",
                      )}
                      <section className="setup-panel live-section">
                        <h2>{data.team.name}</h2>
                        <p>
                          <GitBranch size={14} aria-hidden="true" />{" "}
                          {data.repository?.name ?? "Repository unavailable"}
                        </p>
                        <ul className="live-list">
                          {data.members.map((member) => (
                            <li key={member.user_id}>
                              <div className="live-member">
                                <MemberAvatar id={member.user_id} name={member.display_name} />
                                <div>
                                  <strong>
                                    {member.display_name}
                                    {member.user_id === user.id ? " (you)" : ""}
                                  </strong>
                                  <p className="muted small">
                                    {member.role} · Joined {when(member.joined_at)}
                                  </p>
                                </div>
                              </div>
                              {isAdmin && member.user_id !== user.id && (
                                <button
                                  className="button button-secondary"
                                  disabled={pending}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Remove ${member.display_name} and revoke their connected devices?`,
                                      )
                                    )
                                      void act(async () => {
                                        await mutate(client, "teams", {
                                          action: "remove_member",
                                          team_id: data.team!.id,
                                          user_id: member.user_id,
                                        });
                                      }, "Member removed and their devices revoked.");
                                  }}
                                >
                                  Remove member
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </section>
                      <section className="setup-panel live-section">
                        <h2>Repositories</h2>
                        <ul className="live-list">
                          {data.repositories.map((repository) => (
                            <li key={repository.id}>
                              <strong>{repository.name}</strong>
                              <Link
                                className="text-link"
                                href={`/live?view=settings&repository=${repository.id}`}
                              >
                                Sharing settings →
                              </Link>
                            </li>
                          ))}
                        </ul>
                        {isAdmin && (
                          <form
                            className="live-form live-narrow"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const element = event.currentTarget;
                              const form = new FormData(element);
                              const repository = repositoryInput(
                                String(form.get("repository_name") ?? ""),
                              );
                              setActionError("");
                              if (!repository) {
                                setRepositoryError(repositoryInputError);
                                const field = element.elements.namedItem("repository_name");
                                if (field instanceof HTMLInputElement) field.focus();
                                return;
                              }
                              setRepositoryError("");
                              void act(async () => {
                                await mutate(client, "teams", {
                                  action: "add_repository",
                                  team_id: data.team!.id,
                                  repository_name: repository,
                                });
                              }, "Repository added.");
                            }}
                          >
                            <label htmlFor="add-repository">Add repository</label>
                            <input
                              id="add-repository"
                              name="repository_name"
                              required
                              maxLength={2048}
                              placeholder="owner/repository or GitHub URL"
                              aria-invalid={!!repositoryError}
                              aria-describedby={`add-repository-help${repositoryError ? " add-repository-error" : ""}`}
                              onChange={() => setRepositoryError("")}
                            />
                            {repositoryError && (
                              <span id="add-repository-error" className="error-text" role="alert">
                                {repositoryError}
                              </span>
                            )}
                            <p id="add-repository-help" className="muted small">
                              Enter owner/repository or a GitHub URL. Free includes one repository.
                              The $20/month test subscription supports up to five.
                            </p>
                            <button className="button button-secondary" disabled={pending}>
                              Add repository
                            </button>
                          </form>
                        )}
                      </section>
                      {isAdmin && (
                        <section className="setup-panel">
                          <h2>Team invitation</h2>
                          <p>
                            Share the invite privately. Your teammate must sign in before joining.
                          </p>
                          <div className="live-actions">
                            <button
                              className="button button-secondary"
                              disabled={pending}
                              onClick={() => void loadInvite(false)}
                            >
                              Show current invite
                            </button>
                            <button
                              className="button button-primary"
                              disabled={pending}
                              onClick={() => {
                                if (
                                  !invite ||
                                  window.confirm(
                                    "Replace the existing invitation? Old links will stop working.",
                                  )
                                )
                                  void loadInvite(true);
                              }}
                            >
                              Create new invite link
                            </button>
                          </div>
                          {invite && (
                            <div className="live-form">
                              <label htmlFor="invite-link">Invite link</label>
                              <input
                                id="invite-link"
                                readOnly
                                value={invite}
                                onFocus={(e) => e.currentTarget.select()}
                              />
                              <button
                                className="button button-secondary"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(invite);
                                    setNotice("Invite link copied.");
                                  } catch {
                                    setNotice("Select the invite link above and copy it.");
                                  }
                                }}
                              >
                                Copy invite
                              </button>
                            </div>
                          )}
                        </section>
                      )}
                    </>
                  )}
                  {view === "settings" && (
                    <>
                      {heading(
                        "Sharing settings",
                        "You decide what your agent shares with the team.",
                      )}
                      <section className="setup-panel live-narrow">
                        <label htmlFor="sharing-repository">Repository</label>
                        <select
                          id="sharing-repository"
                          value={data.repository?.id ?? ""}
                          onChange={(event) =>
                            router.replace(`/live?view=settings&repository=${event.target.value}`)
                          }
                        >
                          {data.repositories.map((repository) => (
                            <option key={repository.id} value={repository.id}>
                              {repository.name}
                            </option>
                          ))}
                        </select>
                        <h2 className="section-spacing">{data.repository?.name}</h2>
                        <p>
                          Sharing is{" "}
                          {data.sharing?.enabled ? (data.sharing.paused ? "paused" : "on") : "off"}{" "}
                          for your account.
                        </p>
                        <div className="live-form">
                          <label className="live-toggle">
                            <input
                              type="checkbox"
                              checked={data.sharing?.enabled ?? false}
                              disabled={pending}
                              onChange={(e) => sharing(e.target.checked, false)}
                            />
                            Share future agent sessions with my team
                          </label>
                          <label className="live-toggle">
                            <input
                              type="checkbox"
                              checked={data.sharing?.paused ?? false}
                              disabled={pending || !data.sharing?.enabled}
                              onChange={(e) => sharing(undefined, e.target.checked)}
                            />
                            Pause new event uploads
                          </label>
                          <p className="muted small">
                            Pausing or turning sharing off stops future uploads. Already shared
                            history remains until you delete it from its session. Private sessions
                            reject new uploads and are hidden from teammates.
                          </p>
                        </div>
                        <Link className="text-link" href="/live?view=devices">
                          Manage connected devices →
                        </Link>
                      </section>
                    </>
                  )}
                  {view === "devices" && (
                    <>
                      {heading(
                        "Agent connections",
                        "Approve only a request you started from your own terminal.",
                      )}
                      <section className="setup-panel live-section">
                        <h2>Approve a connection</h2>
                        <p>
                          Run the adapter pairing command in your repository, then enter its code
                          here. Compare the code, agent, and repository before approving.
                        </p>
                        <form
                          className="live-form live-narrow"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void act(async () => {
                              setPairing(
                                devicesResponseSchemas.get_pairing.parse(
                                  await mutate(client, "devices", {
                                    action: "get_pairing",
                                    user_code: code.trim().toUpperCase(),
                                  }),
                                ),
                              );
                            });
                          }}
                        >
                          <label htmlFor="pairing-code">Pairing code</label>
                          <input
                            id="pairing-code"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            required
                            pattern="[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}"
                            placeholder="ABCD-2345"
                            autoComplete="off"
                          />
                          <button className="button button-primary" disabled={pending}>
                            Review connection
                          </button>
                        </form>
                        {pairing && (
                          <div className="live-pairing">
                            <h3>{pairing.device_name}</h3>
                            <p>
                              {AGENT_LABELS[pairing.agent]} · {pairing.repository_name}
                            </p>
                            <p>
                              Code <strong>{pairing.user_code}</strong> · {pairing.status} · Expires{" "}
                              {when(pairing.expires_at)}
                            </p>
                            <p className="muted small">
                              Capture: {pairing.capabilities.event_capture}. Overlap checks:{" "}
                              {pairing.capabilities.overlap_check}. Warning delivery:{" "}
                              {pairing.capabilities.warning_delivery}.
                            </p>
                            <div className="live-actions">
                              <button
                                className="button button-primary"
                                disabled={
                                  pending || pairing.status !== "pending" || !pairing.repository_id
                                }
                                onClick={() =>
                                  void act(async () => {
                                    await mutate(client, "devices", {
                                      action: "approve_pairing",
                                      user_code: pairing.user_code,
                                    });
                                    setPairing(null);
                                  }, "Device approved. Finish pairing in your terminal, then enable sharing in Settings.")
                                }
                              >
                                Approve device
                              </button>
                              <button
                                className="button button-secondary"
                                disabled={pending || pairing.status !== "pending"}
                                onClick={() =>
                                  void act(async () => {
                                    await mutate(client, "devices", {
                                      action: "reject_pairing",
                                      user_code: pairing.user_code,
                                    });
                                    setPairing(null);
                                  }, "Pairing rejected.")
                                }
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        )}
                      </section>
                      <h2>Connected devices</h2>
                      {!data.devices.length ? (
                        <Empty title="No connected agents yet">
                          Pair Claude Code or Codex from your terminal to start.
                        </Empty>
                      ) : (
                        <ul className="live-list">
                          {data.devices.map((device) => (
                            <li key={device.id}>
                              <div>
                                <strong>{device.name}</strong>
                                <p>
                                  {AGENT_LABELS[device.agent]} · {device.status} ·{" "}
                                  {data.members.find((member) => member.user_id === device.user_id)
                                    ?.display_name ?? "Former member"}
                                </p>
                                <p className="muted small">
                                  Last used {when(device.last_used_at)} · Capture{" "}
                                  {device.capabilities.event_capture}
                                </p>
                              </div>
                              {device.user_id === user.id && device.status === "approved" && (
                                <button
                                  className="button button-secondary"
                                  disabled={pending}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        "Revoke this device? It will need to pair again before uploading.",
                                      )
                                    )
                                      void act(async () => {
                                        await mutate(client, "devices", {
                                          action: "revoke_device",
                                          device_id: device.id,
                                        });
                                      }, "Device revoked.");
                                  }}
                                >
                                  Revoke device
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {view === "sessions" &&
                    (query.session ? (
                      selected ? (
                        <LiveTranscript
                          key={selected.id}
                          data={data}
                          session={selected}
                          userId={user.id}
                          pending={pending}
                          eventLimit={eventLimit}
                          onLoadEarlier={() =>
                            setEventLimit((limit) => Math.min(1000, limit + 100))
                          }
                          onVisibility={() => visibility(selected)}
                          onDelete={() =>
                            act(async () => {
                              await mutate(client, "sharing", {
                                action: "delete_session",
                                session_id: selected.id,
                              });
                            }, "Shared history deleted.")
                          }
                          connection={connection}
                          refresh={() => void refresh()}
                        />
                      ) : (
                        <Empty title="Session unavailable">
                          This session may be private, removed, or outside your current team.{" "}
                          <Link href="/live?view=sessions">Return to sessions.</Link>
                        </Empty>
                      )
                    ) : (
                      <LiveSessions data={data} />
                    ))}
                  {view === "warnings" && (
                    <>
                      {heading(
                        "Overlap warnings",
                        "Checks from actual implementation requests. Missing provider access is shown as unavailable.",
                      )}
                      {!data.warnings.length ? (
                        <Empty title="No overlap checks yet">
                          Your connected adapter will request a check when implementation work
                          starts. An empty list does not mean work is conflict-free.
                        </Empty>
                      ) : (
                        <ul className="live-list">
                          {data.warnings.map((warning) => (
                            <li key={warning.id}>
                              <div>
                                <h2>
                                  {warning.outcome === "warning"
                                    ? "Possible overlap"
                                    : warning.outcome === "no_overlap"
                                      ? "No overlap found in this check"
                                      : "Check unavailable"}
                                </h2>
                                <p>{warning.request_excerpt ?? "Request excerpt removed"}</p>
                                {warning.unavailable_reason && (
                                  <p className="muted">
                                    Reason: {warning.unavailable_reason.replaceAll("_", " ")}. Work
                                    continues; no clear result is assumed.
                                  </p>
                                )}
                                {warning.findings.map((finding, index) => (
                                  <div key={index}>
                                    <p>{finding.summary}</p>
                                    <Link
                                      className="text-link"
                                      href={`/live?view=sessions&session=${finding.related_session_id}`}
                                    >
                                      Related session →
                                    </Link>
                                    {finding.evidence.map((evidence) => (
                                      <p key={evidence.event_id} className="muted small">
                                        {evidence.excerpt ?? "Evidence removed"}
                                      </p>
                                    ))}
                                  </div>
                                ))}
                                <p className="muted small">{when(warning.created_at)}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {view === "storage" && (
                    <>
                      {heading(
                        "History storage",
                        "A sliding window keeps retained history within the configured limits.",
                      )}
                      <div className="live-grid">
                        <section className="setup-panel">
                          <h2>Your history</h2>
                          {data.storage ? (
                            <>
                              <strong className="live-number">
                                {mb(data.storage.person.accounted_bytes)}
                              </strong>
                              <p>
                                of {mb(data.storage.person.limit_bytes)} ·{" "}
                                {data.storage.person.state}
                              </p>
                              <progress
                                aria-label="Your retained history usage"
                                value={data.storage.person.accounted_bytes}
                                max={data.storage.person.limit_bytes}
                              />
                            </>
                          ) : (
                            <p>Usage is unavailable. No free capacity is assumed.</p>
                          )}
                        </section>
                        <section className="setup-panel">
                          <h2>Database capacity</h2>
                          <p>
                            {data.storage?.database.database_bytes != null
                              ? `${mb(data.storage.database.database_bytes)} · ${data.storage.database.state}`
                              : "Measurement unavailable"}
                          </p>
                          <p className="muted small">
                            Measured {when(data.storage?.database.measured_at ?? null)}
                          </p>
                        </section>
                      </div>
                      <p className="muted section-spacing">
                        At 40 MB per person, older completed history is cleaned toward 30 MB.
                        Database pressure can pause uploads. Deleted and pruned session records
                        remain without their transcript.
                      </p>
                      <h2>Recent cleanup</h2>
                      {!data.cleanup.length ? (
                        <Empty title="No cleanup notices">
                          Storage cleanup and manual deletions will appear here.
                        </Empty>
                      ) : (
                        <ul className="live-list">
                          {data.cleanup.map((item) => (
                            <li key={item.id}>
                              <div>
                                <strong>{item.reason.replaceAll("_", " ")}</strong>
                                <p>
                                  {item.removed_session_ids.length} sessions ·{" "}
                                  {mb(item.freed_bytes)} freed · {when(item.created_at)}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {!navigation.some((item) => item.view === view) && !settingsOpen && (
                    <>
                      {heading(
                        "Start sharing real work",
                        "Use a test repository without secrets for your first demo.",
                      )}
                      <ol className="live-guide">
                        <li>
                          <h2>Invite your teammate</h2>
                          <p>
                            Open Team, create an invite, and send it to your teammate. They sign up
                            in a different browser profile and join the same team.
                          </p>
                          <Link className="text-link" href="/live?view=manage">
                            Open Team →
                          </Link>
                        </li>
                        <li>
                          <h2>Connect your local agent</h2>
                          <p>
                            Run the adapter from this project’s README in the repository you linked.
                            Open Connections, review its code and repository, then approve. Never
                            paste a device token into chat.
                          </p>
                          <Link className="text-link" href="/live?view=devices">
                            Open Connections →
                          </Link>
                        </li>
                        <li>
                          <h2>Enable sharing deliberately</h2>
                          <p>
                            Each person turns on their own sharing in Settings. Run a coding session
                            through the configured adapter and check that its actual events appear
                            in Sessions for both teammates.
                          </p>
                          <Link className="text-link" href="/live?view=settings">
                            Open Settings →
                          </Link>
                        </li>
                        <li>
                          <h2>Test privacy controls</h2>
                          <p>
                            Pause uploads, make a session private, delete shared history, and revoke
                            the device. Confirm the teammate’s view updates and revoked uploads are
                            rejected.
                          </p>
                        </li>
                        <li>
                          <h2>Try the test subscription</h2>
                          <p>
                            Open Billing and use Stripe’s test checkout. No real payment is
                            collected in the demo.
                          </p>
                          <Link className="text-link" href="/live/billing">
                            Open Billing →
                          </Link>
                        </li>
                      </ol>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
