"use client";

import { Check, PlugZap, X } from "lucide-react";
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
      <section className="controls-panel" aria-labelledby="pairing-title">
        <div className="controls-panel-heading">
          <h2 id="pairing-title">Pairing requests</h2>
          <span className="controls-count">{pendingRequests.length} pending</span>
        </div>

        {state.pairingRequests.length === 0 ? (
          <div className="controls-empty-state">
            <PlugZap size={19} aria-hidden="true" />
            <p>No pairing requests.</p>
          </div>
        ) : (
          <div className="controls-request-list">
            {state.pairingRequests.map((request) => {
              const scopeMatches = request.repositoryName === state.repositoryName;
              const memberExists = state.members.some((member) => member.id === request.memberId);
              const isRequestingMember = actor?.id === request.memberId;
              const mayApprove =
                isRequestingMember && request.status === "pending" && scopeMatches && memberExists;
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

                  {request.status === "pending" ? (
                    <div className="controls-button-row">
                      <button
                        type="button"
                        className="button button-primary"
                        disabled={!mayApprove}
                        onClick={() => dispatch({ type: "approve-pairing", requestId: request.id })}
                      >
                        <Check size={15} aria-hidden="true" />
                        Approve sample device
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={!isRequestingMember}
                        onClick={() => dispatch({ type: "reject-pairing", requestId: request.id })}
                      >
                        <X size={15} aria-hidden="true" />
                        Decline request
                      </button>
                    </div>
                  ) : null}
                  {request.status === "pending" && !isRequestingMember ? (
                    <p className="controls-permission-note">
                      Only {request.memberName} can approve this.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="controls-panel controls-devices-panel" aria-labelledby="devices-title">
        <div className="controls-panel-heading">
          <h2 id="devices-title">Devices</h2>
          <span className="controls-count">
            {devices.filter((device) => device.status === "approved").length} active
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
      </section>
      <p className="controls-field-help">No device credential is generated here.</p>
    </>
  );
}
