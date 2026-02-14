type CaptionSource = 'node';

type FlushStatus = {
  publishedOk: boolean;
  mongoSavedOk: boolean;
  lockContended: boolean;
};

type FlushRunContext = {
  meetingId: string;
  startedAtMs: number;
  cleanBufferSize: number;
  rawBufferSize: number;
  status: FlushStatus;
};

type Totals = {
  captionsReceived: number;
  segmentsFinalized: number;
  finalizeAttempts: number;
  duplicateFinalizeAttempts: number;
  botDoneCalls: number;
  flushRuns: number;
  flushLockContentions: number;
  flushPublishSuccess: number;
  flushPublishFailure: number;
  flushMongoSuccess: number;
  flushMongoFailure: number;
};

type PerMeeting = {
  captionsReceived: number;
  segmentsFinalized: number;
  finalizeAttempts: number;
  duplicateFinalizeAttempts: number;
  botDoneCalls: number;
};

const totals: Totals = {
  captionsReceived: 0,
  segmentsFinalized: 0,
  finalizeAttempts: 0,
  duplicateFinalizeAttempts: 0,
  botDoneCalls: 0,
  flushRuns: 0,
  flushLockContentions: 0,
  flushPublishSuccess: 0,
  flushPublishFailure: 0,
  flushMongoSuccess: 0,
  flushMongoFailure: 0,
};

const perMeeting = new Map<string, PerMeeting>();
const flushDurationsMs: number[] = [];

const reporterIntervalMs = parseInt(process.env.METRICS_LOG_INTERVAL_MS || '60000', 10);
const duplicateFinalizeWarnThreshold = parseInt(
  process.env.METRICS_DUPLICATE_FINALIZE_WARN_THRESHOLD || '1',
  10
);
const botDoneDuplicateWarnThreshold = parseInt(
  process.env.METRICS_BOT_DONE_DUPLICATE_WARN_THRESHOLD || '1',
  10
);

let reporterStarted = false;
let lastSnapshotAt = Date.now();
let lastSnapshot = {
  captionsReceived: 0,
  segmentsFinalized: 0,
  flushRuns: 0,
};

function getMeetingCounters(meetingId: string): PerMeeting {
  const existing = perMeeting.get(meetingId);
  if (existing) return existing;

  const initial: PerMeeting = {
    captionsReceived: 0,
    segmentsFinalized: 0,
    finalizeAttempts: 0,
    duplicateFinalizeAttempts: 0,
    botDoneCalls: 0,
  };
  perMeeting.set(meetingId, initial);
  return initial;
}

function logJson(kind: 'METRIC' | 'WARN' | 'TRACE', payload: Record<string, unknown>): void {
  console.log(`[${kind}] ${JSON.stringify(payload)}`);
}

function startReporterIfNeeded(): void {
  if (reporterStarted) return;
  reporterStarted = true;

  const timer = setInterval(() => {
    const now = Date.now();
    const intervalSec = Math.max(1, (now - lastSnapshotAt) / 1000);

    const captionsDelta = totals.captionsReceived - lastSnapshot.captionsReceived;
    const finalizedDelta = totals.segmentsFinalized - lastSnapshot.segmentsFinalized;
    const flushDelta = totals.flushRuns - lastSnapshot.flushRuns;

    const topMeetingsByCaptions = Array.from(perMeeting.entries())
      .sort((a, b) => b[1].captionsReceived - a[1].captionsReceived)
      .slice(0, 5)
      .map(([meetingId, stats]) => ({ meetingId, captionsReceived: stats.captionsReceived }));

    const topMeetingsByFinalizeDupes = Array.from(perMeeting.entries())
      .filter(([, stats]) => stats.duplicateFinalizeAttempts > 0)
      .sort((a, b) => b[1].duplicateFinalizeAttempts - a[1].duplicateFinalizeAttempts)
      .slice(0, 5)
      .map(([meetingId, stats]) => ({
        meetingId,
        duplicateFinalizeAttempts: stats.duplicateFinalizeAttempts,
      }));

    const recentFlushDurations = flushDurationsMs.slice(-100);
    const avgFlushDurationMs = recentFlushDurations.length > 0
      ? Math.round(
          recentFlushDurations.reduce((sum, d) => sum + d, 0) / recentFlushDurations.length
        )
      : 0;

    logJson('METRIC', {
      event: 'transcription_pipeline_metrics',
      intervalSec,
      rates: {
        captionsReceivedPerSec: Number((captionsDelta / intervalSec).toFixed(2)),
        segmentsFinalizedPerSec: Number((finalizedDelta / intervalSec).toFixed(2)),
        flushRunsPerSec: Number((flushDelta / intervalSec).toFixed(2)),
      },
      totals,
      flush: {
        avgDurationMsLast100: avgFlushDurationMs,
      },
      topMeetingsByCaptions,
      topMeetingsByFinalizeDupes,
      generatedAt: new Date(now).toISOString(),
    });

    const meetingsWithDuplicateBotDone = Array.from(perMeeting.entries())
      .filter(([, stats]) => stats.botDoneCalls > botDoneDuplicateWarnThreshold)
      .map(([meetingId, stats]) => ({ meetingId, botDoneCalls: stats.botDoneCalls }));

    if (totals.duplicateFinalizeAttempts > duplicateFinalizeWarnThreshold) {
      logJson('WARN', {
        event: 'duplicate_finalize_attempts_detected',
        duplicateFinalizeAttempts: totals.duplicateFinalizeAttempts,
      });
    }

    if (totals.flushMongoFailure > 0) {
      logJson('WARN', {
        event: 'flush_mongo_failures_detected',
        flushMongoFailure: totals.flushMongoFailure,
      });
    }

    if (meetingsWithDuplicateBotDone.length > 0) {
      logJson('WARN', {
        event: 'duplicate_bot_done_calls_detected',
        meetings: meetingsWithDuplicateBotDone,
      });
    }

    lastSnapshotAt = now;
    lastSnapshot = {
      captionsReceived: totals.captionsReceived,
      segmentsFinalized: totals.segmentsFinalized,
      flushRuns: totals.flushRuns,
    };
  }, reporterIntervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

export function traceEvent(
  event: string,
  context: { meetingId?: string; segmentId?: string; source?: string; [key: string]: unknown }
): void {
  startReporterIfNeeded();
  logJson('TRACE', {
    event,
    ...context,
    ts: new Date().toISOString(),
  });
}

export function markCaptionReceived(meetingId: string, source: CaptionSource): void {
  startReporterIfNeeded();
  totals.captionsReceived += 1;
  getMeetingCounters(meetingId).captionsReceived += 1;
  // Intentionally do not emit per-caption trace logs to avoid high-volume log overhead.
  void source;
}

export function markFinalizeAttempt(
  meetingId: string,
  segmentId: string,
  reason: string,
  isDuplicate: boolean
): void {
  startReporterIfNeeded();
  totals.finalizeAttempts += 1;
  const meeting = getMeetingCounters(meetingId);
  meeting.finalizeAttempts += 1;

  if (isDuplicate) {
    totals.duplicateFinalizeAttempts += 1;
    meeting.duplicateFinalizeAttempts += 1;
  }

  traceEvent('segment_finalize_attempt', { meetingId, segmentId, reason, isDuplicate, source: 'node' });
}

export function markSegmentFinalized(meetingId: string, segmentId: string): void {
  startReporterIfNeeded();
  totals.segmentsFinalized += 1;
  getMeetingCounters(meetingId).segmentsFinalized += 1;
  traceEvent('segment_finalized', { meetingId, segmentId, source: 'node' });
}

export function markBotDoneCall(meetingId: string, jobId: string): void {
  startReporterIfNeeded();
  totals.botDoneCalls += 1;
  const meeting = getMeetingCounters(meetingId);
  meeting.botDoneCalls += 1;
  traceEvent('bot_done_called', { meetingId, jobId, source: 'backend' });
}

export function startFlushRun(
  meetingId: string,
  cleanBufferSize: number,
  rawBufferSize: number
): FlushRunContext {
  startReporterIfNeeded();
  totals.flushRuns += 1;
  const run: FlushRunContext = {
    meetingId,
    startedAtMs: Date.now(),
    cleanBufferSize,
    rawBufferSize,
    status: {
      publishedOk: false,
      mongoSavedOk: false,
      lockContended: false,
    },
  };
  traceEvent('flush_started', {
    meetingId,
    source: 'worker',
    cleanBufferSize,
    rawBufferSize,
  });
  return run;
}

export function markFlushLockContention(run: FlushRunContext): void {
  run.status.lockContended = true;
  totals.flushLockContentions += 1;
  traceEvent('flush_lock_contention', { meetingId: run.meetingId, source: 'worker' });
}

export function markFlushPublishResult(run: FlushRunContext, ok: boolean): void {
  run.status.publishedOk = ok;
  if (ok) {
    totals.flushPublishSuccess += 1;
  } else {
    totals.flushPublishFailure += 1;
  }
  traceEvent('flush_publish_result', { meetingId: run.meetingId, ok, source: 'worker' });
}

export function markFlushMongoResult(run: FlushRunContext, ok: boolean): void {
  run.status.mongoSavedOk = ok;
  if (ok) {
    totals.flushMongoSuccess += 1;
  } else {
    totals.flushMongoFailure += 1;
  }
  traceEvent('flush_mongo_result', { meetingId: run.meetingId, ok, source: 'worker' });
}

export function finishFlushRun(run: FlushRunContext): void {
  const durationMs = Date.now() - run.startedAtMs;
  flushDurationsMs.push(durationMs);
  if (flushDurationsMs.length > 1000) {
    flushDurationsMs.shift();
  }
  traceEvent('flush_finished', {
    meetingId: run.meetingId,
    durationMs,
    source: 'worker',
    cleanBufferSize: run.cleanBufferSize,
    rawBufferSize: run.rawBufferSize,
    status: run.status,
  });
}

export function initializeTranscriptionMetrics(): void {
  startReporterIfNeeded();
}
