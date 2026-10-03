"use client";

import Link from "next/link";
import { ArrowRight, Check, CircleHelp, LockKeyhole, PlugZap, ShieldCheck, X } from "lucide-react";
import { useWorkspaceControls } from "@/features/workspace-controls/store";

const capabilityLabels = [
  ["eventCapture", "Event capture"],
  ["overlapCheck", "Overlap check"],
  ["warningDelivery", "Warning delivery"],
] as const;

export function Connections() {
  const { state, actor, dispatch } = useWorkspaceControls();
  const pendingRequests = state.pairingRequests.filter((request) => request.status === "pending");
  const devices = state.devices;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">LOCAL AGENT CONNECTIONS</div>
          <h1>Review a device pairing.</h1>
          <p>
            Approve one sample user and repository scope at a time. No agent is contacted from this
            screen.
          </p>
        </div>
        <span className="controls-sample-tag">Browser sample only</span>
      </div>

      <div className="controls-split-layout">
        <section className="controls-panel" aria-labelledby="pairing-title">
          <div className="controls-panel-heading">
            <div>
              <span className="controls-kicker">PAIRING REVIEW</span>
              <h2 id="pairing-title">Requests for {state.teamName}</h2>
            </div>
            <span className="controls-count">{pendingRequests.length} pending</span>
          </div>

          {state.pairingRequests.length === 0 ? (
            <div className="controls-empty-state">
              <PlugZap size={19} aria-hidden="true" />
              <p>
                No sample device requests. A real pairing request will require the shared backend
                contract.
              </p>
            </div>
          ) : (
            <div className="controls-request-list">
              {state.pairingRequests.map((request) => {
                const scopeMatches = request.repositoryName === state.repositoryName;
                const memberExists = state.members.some((member) => member.id === request.memberId);
                const isRequestingMember = actor?.id === request.memberId;
                const mayApprove =
                  isRequestingMember &&
                  request.status === "pending" &&
                  scopeMatches &&
                  memberExists;
                return (
                  <article
                    className="controls-request"
                    key={request.id}
                    aria-label={`${request.memberName} ${request.agent} pairing request`}
                  >
                    <div className="controls-request-title">
                      <div className="controls-initials" aria-hidden="true">
                        {request.memberName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3>
                          {request.memberName} · {request.agent}
                        </h3>
                        <p>Requests access for this team member</p>
                      </div>
                      <span className={`controls-state-pill controls-state-${request.status}`}>
                        {request.status === "pending"
                          ? "Awaiting review"
                          : request.status === "approved"
                            ? "Approved sample"
                            : "Declined"}
                      </span>
                    </div>

                    <dl className="controls-scope-list">
                      <div>
                        <dt>User scope</dt>
                        <dd>
                          {request.memberName} ({request.memberId})
                        </dd>
                      </div>
                      <div>
                        <dt>Repository scope</dt>
                        <dd>{request.repositoryName}</dd>
                      </div>
                      <div>
                        <dt>Team repository</dt>
                        <dd>{state.repositoryName}</dd>
                      </div>
                    </dl>

                    {!scopeMatches && request.status === "pending" ? (
                      <p className="controls-inline-warning" role="status">
                        This request names a different repository. Update setup or decline this
                        request before pairing.
                      </p>
                    ) : null}
                    {!memberExists && request.status === "pending" ? (
                      <p className="controls-inline-warning" role="status">
                        The requesting member has been removed. This request cannot be approved.
                      </p>
                    ) : null}

                    <div className="controls-capabilities" aria-label="Sample capability status">
                      {capabilityLabels.map(([key, label]) => (
                        <div className="controls-capability" key={key}>
                          <span>{label}</span>
                          <span
                            className={`controls-capability-state controls-capability-${request.capabilities[key]}`}
                          >
                            {request.capabilities[key]}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="controls-field-help">
                      Synthetic compatibility example only. Installed agent versions and capture
                      support are unverified.
                    </p>

                    {request.status === "pending" ? (
                      <div className="controls-button-row">
                        <button
                          type="button"
                          className="button button-primary"
                          disabled={!mayApprove}
                          onClick={() =>
                            dispatch({ type: "approve-pairing", requestId: request.id })
                          }
                        >
                          <Check size={15} aria-hidden="true" />
                          Approve sample device
                        </button>
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={!isRequestingMember}
                          onClick={() =>
                            dispatch({ type: "reject-pairing", requestId: request.id })
                          }
                        >
                          <X size={15} aria-hidden="true" />
                          Decline request
                        </button>
                      </div>
                    ) : null}
                    {request.status === "pending" && !isRequestingMember ? (
                      <p className="controls-permission-note">
                        Only {request.memberName} can approve or decline this request. Use the role
                        preview in Settings to switch sample users.
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
          {pendingRequests.length > 0 &&
          !pendingRequests.some((request) => request.memberId === actor?.id) ? (
            <p className="controls-permission-note">
              Pairing approval is personal consent. Each sample user reviews only their own device
              request.
            </p>
          ) : null}
        </section>

        <aside className="controls-panel controls-safety-panel">
          <span className="controls-kicker">APPROVAL BOUNDARY</span>
          <div className="controls-safety-icon">
            <ShieldCheck size={21} aria-hidden="true" />
          </div>
          <h2>Review the exact scope.</h2>
          <p>
            Pairing approval covers a named sample team member, this team, and one linked
            repository. Access to another repository is not included.
          </p>
          <div className="controls-agent-compatibility">
            <span className="controls-kicker">SYNTHETIC CAPABILITY EXAMPLE</span>
            <ul>
              {(["Claude Code", "Codex"] as const).map((agent) => (
                <li key={agent}>
                  <strong>{agent}</strong>
                  <span>
                    Capture partial · overlap check unsupported · warning delivery unsupported
                  </span>
                </li>
              ))}
            </ul>
            <p>These labels are illustrative. Installed versions and support are unverified.</p>
          </div>
          <div className="controls-notice controls-notice-neutral">
            <LockKeyhole size={16} aria-hidden="true" />
            <span>
              No device credential is generated here. The sample state never contacts an adapter or
              backend.
            </span>
          </div>
          <p className="controls-field-help">
            A live connection requires browser approval, secure device credential storage, and
            server-side revocation checks.
          </p>
        </aside>
      </div>

      <section className="controls-panel controls-devices-panel" aria-labelledby="devices-title">
        <div className="controls-panel-heading">
          <div>
            <span className="controls-kicker">DEVICES</span>
            <h2 id="devices-title">Approved sample devices</h2>
          </div>
          <span className="controls-count">
            {devices.filter((device) => device.status === "approved").length} active sample
          </span>
        </div>
        <div className="controls-device-list">
          {devices.map((device) => (
            <article className="controls-device-row" key={device.id}>
              <div className="controls-device-symbol">
                <PlugZap size={17} aria-hidden="true" />
              </div>
              <div className="controls-device-main">
                <h3>{device.name}</h3>
                <p>
                  {device.agent} · {device.memberName} · {state.repositoryName}
                </p>
                <span className={`controls-state-pill controls-state-${device.status}`}>
                  {device.status === "approved"
                    ? "Approved sample device"
                    : "Revoked sample device"}
                </span>
              </div>
              <button
                type="button"
                className="button button-danger"
                disabled={actor?.id !== device.memberId || device.status === "revoked"}
                onClick={() => dispatch({ type: "revoke-device", deviceId: device.id })}
                title={
                  actor?.id !== device.memberId
                    ? `Only ${device.memberName} can revoke this sample device`
                    : undefined
                }
              >
                {actor?.id === device.memberId ? "Revoke my sample device" : "Revoke sample device"}
              </button>
            </article>
          ))}
        </div>
        <p className="controls-permission-note">
          Each user can revoke their own device. Removing a team member also revokes that member’s
          sample devices.
        </p>
      </section>

      <div className="controls-footer-links">
        <Link className="text-link" href="/setup">
          Review team setup <ArrowRight size={14} aria-hidden="true" />
        </Link>
        <Link className="text-link" href="/settings">
          Configure sharing and members <ArrowRight size={14} aria-hidden="true" />
        </Link>
        <span>
          <CircleHelp size={14} aria-hidden="true" />
          Both Claude Code and Codex have clearly labeled sample capability states.
        </span>
      </div>
    </>
  );
}
