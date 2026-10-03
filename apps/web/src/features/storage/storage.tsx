"use client";

import { useState } from "react";
import { AlertCircle, ArrowRight, Check, Database, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  isSampleSessionAccessRevoked,
  isSampleSessionDeleted,
  sampleStorageScenarios,
  type StorageScenario,
  type StorageScenarioId,
} from "@/features/history/history-model";
import { deleteOwnSampleSession, useSampleHistory } from "@/features/history/history-store";
import { HistoryNavigation, SampleLabel } from "@/features/history/history-navigation";
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
        <p>
          Database capacity is unknown, not zero. In a live workspace, new session-content writes
          stay paused until fresh capacity confirms safe headroom.
        </p>
      </div>
    );
  }

  if (databasePaused) {
    return (
      <div className={`${styles.scenarioState} ${styles.paused}`} role="status">
        <AlertCircle size={16} aria-hidden="true" />
        <p>
          Sample uploads are paused: projected shared database use is{" "}
          {formatMb(scenario.projectedDatabaseMb)}, above the 400 MB pause boundary. Current use is{" "}
          {formatMb(scenario.databaseMb)}. Cleanup can start at 350 MB; writes resume only after
          safe headroom is verified. Local coding continues.
        </p>
      </div>
    );
  }

  if (scenario.id === "cleanup" && scenario.cleanupMb !== undefined) {
    return (
      <div className={styles.scenarioState} role="status">
        <Check size={16} aria-hidden="true" />
        <p>
          Sample cleanup removed older inactive history and brought accounted content to{" "}
          {formatMb(scenario.cleanupMb)}, below the 30 MB target. Active sessions were protected.
        </p>
      </div>
    );
  }

  if (projectedPersonWarning || databaseWarning) {
    return (
      <div className={`${styles.scenarioState} ${styles.warning}`} role="status">
        <TriangleAlert size={16} aria-hidden="true" />
        <p>
          {projectedPersonWarning
            ? `Projected person content is ${formatMb(scenario.projectedPersonMb)}, above the 40 MB cleanup-warning line. The rolling policy prunes oldest inactive history toward 30 MB.`
            : `Actual shared database use is ${formatMb(scenario.databaseMb)}, at or above the 350 MB maintenance-warning line.`}{" "}
          Active sessions and other people’s below-threshold history stay protected.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.scenarioState} role="status">
      <ShieldCheck size={16} aria-hidden="true" />
      <p>
        Sample capacity is below the warning boundaries. This is not a live storage measurement.
      </p>
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

function StorageHeader() {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">SAMPLE HISTORY</div>
        <h1>History &amp; storage</h1>
        <p>Review example rolling-history limits and remove your own sample copy.</p>
      </div>
      <SampleLabel />
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
      setDeleteStatus(
        "Your sample history was removed from this browser. Related warning excerpts are hidden.",
      );
    } else {
      setDeleteStatus("The sample history could not be removed from this browser.");
    }
  }

  return (
    <div className={styles.featureStack}>
      <HistoryNavigation active="/storage" />
      <StorageHeader />
      <div className={styles.sampleBand}>
        <Database size={16} aria-hidden="true" />
        <p>
          Sample scenarios only. The values below are not actual storage measurements, and no live
          cleanup or upload pause is connected.
        </p>
      </div>

      <div className={styles.warningDetailGrid}>
        <section className={styles.storageCard} aria-labelledby="storage-scenario-title">
          <h2 id="storage-scenario-title">Example usage</h2>
          <p>Per-person history and total database capacity are separate limits.</p>

          <div className={styles.statGrid}>
            <div className={styles.stat}>
              <span>Person content</span>
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
              <span>Shared database</span>
              <strong>{formatMb(scenario.databaseMb)}</strong>
              <span>Projected {formatMb(scenario.projectedDatabaseMb)}</span>
              {scenario.databaseMb === null ? (
                <p className={styles.fixtureFootnote}>
                  Capacity is unverified; unknown is not treated as 0 MB.
                </p>
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

        <aside className={styles.sectionCard}>
          <h2>Rolling history boundaries</h2>
          <p>Starting v1 thresholds from the product specification.</p>
          <ul className={styles.thresholdList}>
            <li>
              <span>Per-person content limit</span>
              <strong>50 MB</strong>
            </li>
            <li>
              <span>Projected cleanup warning</span>
              <strong>40 MB</strong>
            </li>
            <li>
              <span>Cleanup target</span>
              <strong>30 MB</strong>
            </li>
            <li>
              <span>Actual database warning</span>
              <strong>350 MB</strong>
            </li>
            <li>
              <span>Projected write-pause boundary</span>
              <strong>400 MB</strong>
            </li>
          </ul>
          <p className={styles.fixtureFootnote}>
            Cleanup affects ShareSpace copies only. It protects active sessions and never removes
            another person’s history to satisfy an individual allowance.
          </p>
        </aside>
      </div>

      <section className={styles.storageCard} aria-labelledby="own-history-title">
        <h2 id="own-history-title">Your stored sample history</h2>
        <p>Deletion controls apply only to your own sample sessions, saved in this browser.</p>
        {ownSessions.length === 0 && (
          <p className={styles.fixtureFootnote}>This sample member has no session history yet.</p>
        )}
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
                    <span>Sample session details and transcript excerpts are hidden.</span>
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
                    {session.agent} · {session.repository} · Your sample history
                  </span>
                </div>
                <details className={styles.reviewDisclosure}>
                  <summary>Review deletion</summary>
                  <div className={styles.deletePanel}>
                    <h3>Delete this sample history?</h3>
                    <p>
                      This removes your stored sample transcript from this browser and hides
                      warnings that cite it. It does not change your teammate’s history, a real
                      workspace, or any local coding session.
                    </p>
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
        <p className={styles.fixtureFootnote}>
          Teammate Sam’s session is not shown in this deletion control. The button also checks
          ownership before removing a sample record.
        </p>
      </section>
    </div>
  );
}
