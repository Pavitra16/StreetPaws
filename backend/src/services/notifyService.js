import { Alert, Organization } from '../models/index.js';
import { rankOrganizationsForReport } from './routingService.js';
import { sendDogAlert } from './emailService.js';
import { env } from '../config/env.js';

/**
 * Creates the Alert rows for a report and delivers them.
 *
 * Two channels, and the distinction matters:
 *
 *   in-app — the Alert row itself. Always created, never fails, and is what the
 *            rescuer console reads. This is the record.
 *   email  — sent on top, best effort. This is what actually reaches someone
 *            who is not sitting with the site open, which is every rescuer
 *            almost all of the time. A send failure must never lose the alert,
 *            so it is caught and recorded on the row rather than thrown.
 *
 * WhatsApp is the channel people in this field really use, but the Business API
 * needs Meta business verification before a single message can be sent. Email
 * works today with no approval process, so it carries the load until that
 * exists; adding WhatsApp later is another branch in deliver() and nothing else.
 *
 * Alerts are also the audit trail. When a rescuer asks why they never heard
 * about a dog two streets away, the row (or its absence) plus the stored
 * routingScore is the answer.
 */

async function deliver(alert, org, report, distanceKm) {
  // In-app is always "delivered" — the Alert row is the dashboard entry.
  // Email is best-effort on top: a failed send must not lose the alert.
  try {
    const result = await sendDogAlert({
      organization: org,
      report,
      distanceKm,
      appUrl: env.clientOrigin,
    });
    if (result.sent) {
      alert.channel = 'email';
      await alert.save();
    }
    return result;
  } catch (err) {
    alert.error = err.message?.slice(0, 300);
    await alert.save();
    console.warn(`[notify] email to ${org.email} failed: ${err.message}`);
    return { sent: false };
  }
}

export async function fanOutReport(report, { limit = 5 } = {}) {
  let { candidates, needs, reachKm, considered } = await rankOrganizationsForReport(report, { limit });

  /**
   * Reach is scaled to urgency, which means a low-urgency report in a thinly
   * covered area can reach nobody at all. A dog nobody is told about is the one
   * outcome this system must not produce, so widen once rather than give up —
   * a rescuer 30km away who declines is still better than silence.
   */
  if (!candidates?.length) {
    const widened = await rankOrganizationsForReport(report, { limit, overrideReachKm: 40 });
    if (widened.candidates?.length) {
      console.log(
        `[notify] ${report.id}: nobody within ${reachKm}km, widened to 40km → ${widened.candidates.length} found`
      );
      ({ candidates, needs, considered } = widened);
      reachKm = 40;
    }
  }

  if (!candidates?.length) {
    console.warn(`[notify] ${report.id}: NO RESCUER REACHABLE (${considered} considered within 40km)`);
    return { sent: 0, needs, reachKm, alerts: [], unreachable: true };
  }

  const alerts = [];
  for (const c of candidates) {
    try {
      // The unique (dogReportId, organizationId) index makes re-running the
      // fan-out safe — a retried job will not spam the same rescuer twice.
      const alert = await Alert.create({
        dogReportId: report._id,
        organizationId: c.org._id,
        distanceKm: c.distanceKm,
        routingScore: Number(c.score.toFixed(4)),
        urgency: report.effectiveUrgency,
        channel: 'in_app',
        status: 'sent',
      });

      await deliver(alert, c.org, report, c.distanceKm);

      await Organization.updateOne(
        { _id: c.org._id },
        { $inc: { 'responseStats.assigned': 1 } }
      );

      alerts.push(alert);
    } catch (err) {
      if (err.code === 11000) continue; // already alerted, not an error
      console.error(`[notify] failed to alert ${c.org.id} about ${report.id}:`, err.message);
    }
  }

  console.log(
    `[notify] ${report.id} (urgency ${report.effectiveUrgency}) → ${alerts.length} rescuer(s) within ${reachKm}km`
  );

  return { sent: alerts.length, needs, reachKm, alerts };
}
