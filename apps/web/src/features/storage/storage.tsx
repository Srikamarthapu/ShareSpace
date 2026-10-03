"use client";

import { useState } from "react";
import { AlertCircle, ArrowRight, Check, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  isSampleSessionAccessRevoked,
  isSampleSessionDeleted,
  sampleStorageScenarios,
  type StorageScenario,
  type StorageScenarioId,
} from "@/features/history/history-model";
import { deleteOwnSampleSession, useSampleHistory } from "@/features/history/history-store";
import { sampleSessions } from "@/features/workspace/session-model";
import styles from "@/features/history/history.module.css";
import { useWorkspaceControls } from "@/features/workspace-controls/store";

const formatMb = (value: number | null) => (value === null ? "Unknown" : `${value.toFixed(1)} MB`);

function ScenarioState({ scenario }: { scenario: StorageScenario }) {
  const databasePaused =
    scenario.projectedDatabaseMb !== null && scenario.projectedDatabaseMb >= 400;
  const databaseWarning = scenario.databaseMb !== null && scenario.databaseMb >= 350;
  const projectedPersonWarning = scenario.projectedPersonMb >= 40;

  if (
    scenario.id === "unknown" ||
    scenario.databaseMb === null ||
    scenario.projectedDatabaseMb === null
  ) {
    return (
      <div className={`${styles.scenarioState} ${styles.unknown}`} role="status">
        <AlertCircle size={16} aria-hidden="true" />
        <p>Capacity is unknown, not zero. Uploads stay paused until it is confirmed.</p>
      </div>
    );
  }

  if (databasePaused) {
    return (
      <div className={`${styles.scenarioState} ${styles.paused}`} role="status">
        <AlertCircle size={16} aria-hidden="true" />
        <p>
          Uploads paused. Projected use is {formatMb(scenario.projectedDatabaseMb)}, above the 400
          MB limit.
        </p>
      </div>
    );
  }

  if (scenario.id === "cleanup" && scenario.cleanupMb !== undefined) {
    return (
      <div className={styles.scenarioState} role="status">
        <Check size={16} aria-hidden="true" />
        <p>Cleanup removed older history. You are now at {formatMb(scenario.cleanupMb)}.</p>
      </div>
    );
  }

  if (projectedPersonWarning || databaseWarning) {
    return (
      <div className={`${styles.scenarioState} ${styles.warning}`} role="status">
        <TriangleAlert size={16} aria-hidden="true" />
        <p>
          {projectedPersonWarning
            ? `Your history will reach ${formatMb(scenario.projectedPersonMb)}. Oldest inactive sessions will be cleaned up.`
            : `Database use is ${formatMb(scenario.databaseMb)}, near the limit.`}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.scenarioState} role="status">
      <ShieldCheck size={16} aria-hidden="true" />
      <p>Below all limits.</p>
    </div>
  );
}

function StorageMeter({
  label,
  value,
  max,
  variant,
}: {
  label: string;
  value: number;
  max: number;
  variant?: string;
}) {
  return (
    <div
      className={`${styles.meter} ${variant ?? ""}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={`${formatMb(value)} sample value`}
    >
      <span style={{ width: `${Math.max(0, Math.min((value / max) * 100, 100))}%` }} />
    </div>
  );
}

export function Storage() {
  const { state } = useSampleHistory();
  const { actor } = useWorkspaceControls();
  const currentOwner = actor?.id === "sri" ? "Sri" : actor?.id === "sam" ? "Sam" : "";
  const [scenarioId, setScenarioId] = useState<StorageScenarioId>("warning");
  const [deleteStatus, setDeleteStatus] = useState("");
  const scenario =
    sampleStorageScenarios.find((item) => item.id === scenarioId) ?? sampleStorageScenarios[0];
  const ownSessions = sampleSessions.filter((session) => session.owner === currentOwner);

  function removeOwnSampleHistory(sessionId: string) {
    if (deleteOwnSampleSession(sessionId, currentOwner)) {
      setDeleteStatus("Your session history was removed.");
    } else {
      setDeleteStatus("Could not delete. Try again.");
    }
  }

  return (
    <div className={styles.featureStack}>
      <section className={styles.storageCard} aria-labelledby="storage-scenario-title">
        <h2 id="storage-scenario-title">Usage</h2>

        <div className={styles.statGrid}>
          <div className={styles.stat}>
            <span>Your history</span>
            <strong>{formatMb(scenario.personMb)}</strong>
            <span>Projected {formatMb(scenario.projectedPersonMb)}</span>
            <StorageMeter
              label="Current sample person content against the 50 MB limit"
              value={scenario.personMb}
              max={50}
              variant={scenario.projectedPersonMb >= 40 ? styles.warning : undefined}
            />
          </div>
          <div className={styles.stat}>
            <span>Team database</span>
            <strong>{formatMb(scenario.databaseMb)}</strong>
            <span>Projected {formatMb(scenario.projectedDatabaseMb)}</span>
            {scenario.databaseMb === null ? (
              <p className={styles.fixtureFootnote}>Not measured</p>
            ) : (
              <StorageMeter
                label="Current sample database size against the 400 MB pause boundary"
                value={scenario.databaseMb}
                max={400}
                variant={
                  scenario.projectedDatabaseMb !== null && scenario.projectedDatabaseMb >= 400
                    ? styles.paused
                    : undefined
                }
              />
            )}
          </div>
        </div>

        <ScenarioState scenario={scenario} />
        <p className={styles.fixtureFootnote}>Limits: 50 MB per person · 400 MB total</p>

        <details className={styles.reviewDisclosure}>
          <summary>Preview another sample scenario</summary>
          <div className={styles.reviewDisclosureContent}>
            <div className={styles.scenarioPicker}>
              <label htmlFor="storage-scenario">Scenario</label>
              <select
                id="storage-scenario"
                value={scenarioId}
                onChange={(event) => setScenarioId(event.target.value as StorageScenarioId)}
              >
                {sampleStorageScenarios.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </details>
      </section>

      <section className={styles.storageCard} aria-labelledby="own-history-title">
        <h2 id="own-history-title">Your sessions</h2>
        {ownSessions.length === 0 && <p className={styles.fixtureFootnote}>No sessions yet.</p>}
        {deleteStatus && (
          <p className={styles.fixtureFootnote} role="status">
            {deleteStatus}
          </p>
        )}
        <div className={styles.sessionStorageList}>
          {ownSessions.map((session) => {
            const deleted = isSampleSessionDeleted(state, session.id);
            const revoked = isSampleSessionAccessRevoked(state, session.id);
            if (deleted || revoked) {
              return (
                <div className={styles.sessionStorageRow} key={session.id}>
                  <div>
                    <strong>{deleted ? "History removed" : "Access revoked"}</strong>
                  </div>
                  <span>{deleted ? "Removed from this browser" : "No longer available"}</span>
                </div>
              );
            }

            return (
              <div className={styles.sessionStorageRow} key={session.id}>
                <div>
                  <strong>{session.title}</strong>
                  <span>
                    {session.agent} · {session.branch}
                  </span>
                </div>
                <details className={styles.reviewDisclosure}>
                  <summary>Review deletion</summary>
                  <div className={styles.deletePanel}>
                    <p>Delete this session and hide warnings that cite it?</p>
                    <button
                      className={styles.dangerButton}
                      type="button"
                      onClick={() => removeOwnSampleHistory(session.id)}
                    >
                      Confirm deletion
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
