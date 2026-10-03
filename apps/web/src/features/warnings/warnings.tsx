"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleHelp, TriangleAlert } from "lucide-react";
import { useSampleHistory } from "@/features/history/history-store";
import {
  isSampleSessionAccessRevoked,
  isSampleSessionDeleted,
  sampleWarnings,
  visibleSampleWarnings,
  warningTouchesDeletedHistory,
  warningTouchesRevokedHistory,
  type SampleWarning,
  type WarningOutcome,
} from "@/features/history/history-model";
import { HistoryNavigation, SampleLabel } from "@/features/history/history-navigation";
import styles from "@/features/history/history.module.css";

const outcomeLabels: Record<WarningOutcome, string> = {
  warning: "Overlap warning",
  no_overlap: "No overlap found",
  unavailable: "Check unavailable",
};

function OutcomeBadge({ outcome }: { outcome: WarningOutcome }) {
  const Icon =
    outcome === "warning" ? TriangleAlert : outcome === "no_overlap" ? Check : CircleHelp;
  const className =
    outcome === "warning"
      ? styles.outcome
      : outcome === "no_overlap"
        ? `${styles.outcome} ${styles.noOverlap}`
        : `${styles.outcome} ${styles.unavailable}`;

  return (
    <span className={className}>
      <Icon size={13} aria-hidden="true" />
      {outcomeLabels[outcome]}
    </span>
  );
}

function formatSampleTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Sample time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(date);
}

function WarningHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">SAMPLE COORDINATION</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <SampleLabel />
    </div>
  );
}

function SampleNotice() {
  return (
    <div className={styles.sampleBand}>
      <TriangleAlert size={16} aria-hidden="true" />
      <p>
        These are illustrative outcomes from sample sessions. No live overlap provider or model
        score is connected; checks never block your work.
      </p>
    </div>
  );
}

function evidenceSessionIds(warning: SampleWarning) {
  return warning.evidence.map((item) => item.sessionId);
}

function WarningUnavailable({
  warning,
  state,
}: {
  warning: SampleWarning;
  state: ReturnType<typeof useSampleHistory>["state"];
}) {
  const sessionIds = evidenceSessionIds(warning);
  const deletedEvidence = warning.evidence.filter((item) =>
    isSampleSessionDeleted(state, item.sessionId),
  );
  const hasDeletedHistory = warningTouchesDeletedHistory(sessionIds, state);
  const hasRevokedHistory = warningTouchesRevokedHistory(sessionIds, state);

  if (hasDeletedHistory) {
    return (
      <section className={`${styles.statusPanel} ${styles.removed}`}>
        <h1>History removed</h1>
        <p>
          This sample warning refers to deleted session history. Its title, outcome, summary, and
          evidence excerpts are no longer shown.
        </p>
        <div className={styles.crossLinks}>
          {deletedEvidence.map((item, index) => (
            <Link
              href={`/sessions/${item.sessionId}#${item.eventId}`}
              key={`${item.sessionId}:${item.eventId}`}
            >
              Open removed session {index + 1}
            </Link>
          ))}
        </div>
      </section>
    );
  }

  if (
    hasRevokedHistory ||
    sessionIds.some((sessionId) => isSampleSessionAccessRevoked(state, sessionId))
  ) {
    return (
      <section className={`${styles.statusPanel} ${styles.revoked}`}>
        <h1>Access revoked</h1>
        <p>
          This sample warning refers to session context you can no longer access. Its title,
          outcome, summary, and evidence excerpts are hidden.
        </p>
      </section>
    );
  }

  return null;
}

export function WarningFeed() {
  const { state } = useSampleHistory();
  const warnings = [...visibleSampleWarnings(state)].sort(
    (left, right) => Date.parse(right.happenedAt) - Date.parse(left.happenedAt),
  );

  return (
    <div className={styles.featureStack}>
      <HistoryNavigation active="/warnings" />
      <WarningHeader
        title="Overlap warnings"
        description="Review the sample context behind each advisory check."
      />
      <SampleNotice />
      <p className={styles.eventCount} role="status">
        {warnings.length} sample check{warnings.length === 1 ? "" : "s"} available
      </p>
      {warnings.length ? (
        <section className={styles.warningList} aria-label="Sample overlap checks">
          {warnings.map((warning) => {
            const isRevoked = warningTouchesRevokedHistory(evidenceSessionIds(warning), state);
            return (
              <article className={styles.warningRow} key={warning.id}>
                {isRevoked ? (
                  <span className={`${styles.outcome} ${styles.revoked}`}>Access revoked</span>
                ) : (
                  <OutcomeBadge outcome={warning.outcome} />
                )}
                <div className={styles.warningBody}>
                  <h2>{isRevoked ? "Access revoked" : warning.title}</h2>
                  <p>
                    {isRevoked ? "Related sample context is no longer available." : warning.summary}
                  </p>
                  <p className={styles.warningMeta}>
                    <time dateTime={warning.happenedAt}>
                      {formatSampleTime(warning.happenedAt)}
                    </time>
                    {" · Sample check"}
                  </p>
                </div>
                <Link
                  className={styles.textLink}
                  href={`/warnings/${warning.id}`}
                  aria-label={`View sample check details${isRevoked ? " for access revoked history" : `: ${warning.title}`}`}
                >
                  View details <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </article>
            );
          })}
        </section>
      ) : (
        <section className={styles.statusPanel}>
          <h2>No sample warnings available</h2>
          <p>Warnings linked to removed history are hidden from this feed.</p>
        </section>
      )}
      <p className={styles.fixtureFootnote}>
        Warning, completed no-overlap, and unavailable outcomes are separate sample states. A
        warning is advisory and never pauses local coding.
      </p>
    </div>
  );
}

export function WarningDetail({ id }: { id: string }) {
  const { state } = useSampleHistory();
  const warning = sampleWarnings.find((item) => item.id === id);
  const unavailable =
    warning &&
    (warningTouchesDeletedHistory(evidenceSessionIds(warning), state) ||
      warningTouchesRevokedHistory(evidenceSessionIds(warning), state));

  return (
    <div className={styles.featureStack}>
      <HistoryNavigation active="/warnings" />
      <Link href="/warnings" className="back-link">
        <ArrowLeft size={15} aria-hidden="true" />
        All sample checks
      </Link>
      {!warning ? (
        <section className={styles.statusPanel}>
          <h1>Sample check not found</h1>
          <p>This warning is not part of the available sample history.</p>
          <Link href="/warnings" className={styles.textLink}>
            Return to warnings
          </Link>
        </section>
      ) : unavailable ? (
        <WarningUnavailable warning={warning} state={state} />
      ) : (
        <>
          <WarningHeader title={warning.title} description={warning.summary} />
          <SampleNotice />
          <div className={styles.warningDetailGrid}>
            <section>
              <div className={styles.sectionCard}>
                <div className={styles.sectionHeading}>
                  <h2>Supporting sample activity</h2>
                  <OutcomeBadge outcome={warning.outcome} />
                </div>
                <div className={styles.evidenceList}>
                  {warning.evidence.map((item) => (
                    <article
                      className={styles.evidenceCard}
                      key={`${item.sessionId}:${item.eventId}`}
                    >
                      <h3>{item.label}</h3>
                      <blockquote>{item.excerpt}</blockquote>
                      <Link
                        className={styles.textLink}
                        href={`/sessions/${item.sessionId}#${item.eventId}`}
                        aria-label={`Open sample event: ${item.label}`}
                      >
                        Open related sample event <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    </article>
                  ))}
                </div>
              </div>
            </section>
            <aside className={styles.sectionCard}>
              <h2>What this result means</h2>
              {warning.outcome === "warning" ? (
                <p>
                  The sample context suggests related work. Use your usual workflow to coordinate;
                  this warning does not gate or direct coding.
                </p>
              ) : warning.outcome === "no_overlap" ? (
                <p>
                  The sample check completed and found no related session. That is different from an
                  unavailable check.
                </p>
              ) : (
                <p>
                  {warning.unavailableReason ??
                    "The sample check did not complete. No overlap conclusion was recorded."}
                </p>
              )}
              <p className={styles.fixtureFootnote}>
                {formatSampleTime(warning.happenedAt)} · Sample only. No numeric model score is
                available.
              </p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
