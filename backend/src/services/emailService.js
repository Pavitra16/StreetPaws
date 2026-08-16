import nodemailer from 'nodemailer';
import { env, featureStatus } from '../config/env.js';

/**
 * Email delivery. Degrades to logging when SMTP is not configured, so the app
 * runs end to end on a fresh clone without credentials — a missing SMTP host
 * must never stop a dog report from being routed.
 */

const transporters = new Map();

/**
 * One transport per port. Ports are tried in order because outbound SMTP is
 * unreliable on many consumer connections — 587 is the standard, 2525 is the
 * common alternative when an ISP interferes with it, and 465 is implicit TLS.
 * Observed in practice: 587 timing out on one attempt and succeeding on the next.
 */
const PORT_LADDER = [
  { port: 587, secure: false },
  { port: 2525, secure: false },
  { port: 465, secure: true },
];

function getTransporter(port, secure) {
  if (!transporters.has(port)) {
    transporters.set(
      port,
      nodemailer.createTransport({
        host: env.smtp.host,
        port,
        secure,
        auth: { user: env.smtp.user, pass: env.smtp.pass },
        // Fail fast rather than holding a background job open for minutes.
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      })
    );
  }
  return transporters.get(port);
}

function isTransient(err) {
  const msg = String(err?.message ?? '');
  const code = String(err?.code ?? '');
  // Match nodemailer's own wording as well as the OS-level codes. Its
  // connectionTimeout fires with the plain text "Connection timeout" and no
  // ETIMEDOUT, which the first version of this missed — so a timeout was
  // treated as permanent and the remaining ports were never tried.
  return /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENOTFOUND|EAI_AGAIN|ESOCKET|timeout|timed out|Greeting never received|socket close|Connection closed/i.test(
    `${msg} ${code}`
  );
}

async function send({ to, subject, text, html }) {
  if (!featureStatus().email) {
    console.log(`[email:disabled] would send to ${to}: "${subject}"`);
    return { sent: false, reason: 'smtp_not_configured' };
  }

  // Try the configured port first, then the rest of the ladder.
  const ladder = [
    ...PORT_LADDER.filter((p) => p.port === env.smtp.port),
    ...PORT_LADDER.filter((p) => p.port !== env.smtp.port),
  ];

  let lastError;
  for (const { port, secure } of ladder) {
    try {
      await getTransporter(port, secure).sendMail({ from: env.smtp.from, to, subject, text, html });
      console.log(`[email] sent to ${to} via port ${port}: "${subject}"`);
      return { sent: true, port };
    } catch (err) {
      lastError = err;
      if (!isTransient(err)) {
        // An auth failure or a rejected sender will fail identically on every
        // port — retrying just delays a definite answer.
        console.warn(`[email] permanent failure to ${to}: ${err.message}`);
        return { sent: false, reason: err.message };
      }
      console.warn(`[email] port ${port} failed (${err.message}) — trying next`);
    }
  }

  return { sent: false, reason: lastError?.message ?? 'all SMTP ports failed' };
}

const URGENCY_WORD = { 5: 'CRITICAL', 4: 'Urgent', 3: 'Needs care', 2: 'Monitor', 1: 'Stable' };

export async function sendDogAlert({ organization, report, distanceKm, appUrl }) {
  const urgency = report.effectiveUrgency ?? 1;
  const label = URGENCY_WORD[urgency] ?? 'Reported';
  const breed = report.aiAnalysis?.breed ?? 'Unidentified breed';
  const description =
    report.description ?? report.aiAnalysis?.generatedDescription ?? 'No description provided.';
  const where = report.location?.address ?? report.location?.city ?? 'Location on the map';
  const link = `${appUrl}/rescuer`;

  // Urgency goes in the subject line: a rescuer scanning a phone lock screen
  // should not have to open the mail to know whether it can wait.
  const subject = `[${label}] Dog reported ${distanceKm != null ? `${distanceKm}km away` : 'nearby'} — ${breed}`;

  const text = [
    `A dog has been reported near you.`,
    ``,
    `Severity: ${label} (level ${urgency}/5)`,
    `Breed: ${breed}`,
    `Where: ${where}`,
    distanceKm != null ? `Distance: ${distanceKm} km from you` : null,
    ``,
    description,
    ``,
    `Open your dashboard to accept or decline: ${link}`,
    ``,
    `You are receiving this because your organisation is registered on StreetPaws and this report is within your service area.`,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px">
      <p style="display:inline-block;padding:4px 10px;border-radius:99px;background:${urgency >= 4 ? '#fee2e2' : '#f5f5f4'};color:${urgency >= 4 ? '#991b1b' : '#44403c'};font-weight:600;font-size:13px">
        ${label} · level ${urgency}/5
      </p>
      <h2 style="margin:12px 0 4px">Dog reported ${distanceKm != null ? `${distanceKm} km away` : 'near you'}</h2>
      <p style="color:#57534e;margin:0 0 12px">${breed} · ${where}</p>
      <p style="color:#292524">${description}</p>
      <p><a href="${link}" style="display:inline-block;background:#ed6820;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open dashboard</a></p>
      <p style="color:#a8a29e;font-size:12px">You are receiving this because your organisation is registered on StreetPaws and this report is within your service area.</p>
    </div>`;

  return send({ to: organization.email, subject, text, html });
}

export async function sendOrganizationApproved(org, credentials) {
  const subject = 'Your StreetPaws registration has been approved';
  const lines = [
    `Hello ${org.contactPersonName ?? org.name},`,
    ``,
    `Your registration on StreetPaws has been approved. You will now receive alerts about dogs reported near ${org.location?.city ?? 'you'}.`,
  ];

  if (credentials) {
    lines.push(
      ``,
      `Sign in with:`,
      `  Email: ${credentials.email}`,
      `  Temporary password: ${credentials.tempPassword}`,
      ``,
      `You will be asked to choose a new password on first sign-in.`
    );
  }

  if (!org.verified) {
    lines.push(
      ``,
      `Note: reporter phone numbers stay hidden until your organisation is verified. You can still accept and work cases.`
    );
  }

  return send({ to: org.email, subject, text: lines.join('\n') });
}

export async function sendPasswordReset(user, link) {
  return send({
    to: user.email,
    subject: 'Reset your StreetPaws password',
    text: [
      `Hello ${user.name},`,
      ``,
      `Someone asked to reset the password for this account. Open the link below to choose a new one:`,
      ``,
      link,
      ``,
      `The link works once and expires in 1 hour.`,
      ``,
      `If this was not you, ignore this email — your password has not changed.`,
    ].join('\n'),
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px">
        <h2 style="margin:0 0 8px">Reset your password</h2>
        <p style="color:#57534e">Someone asked to reset the password for <strong>${user.email}</strong>.</p>
        <p><a href="${link}" style="display:inline-block;background:#ed6820;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Choose a new password</a></p>
        <p style="color:#78716c;font-size:13px">This link works once and expires in 1 hour.</p>
        <p style="color:#a8a29e;font-size:12px">If this was not you, ignore this email — your password has not changed.</p>
      </div>`,
  });
}

/**
 * Sent once, when a lost report is filed: the owner's way back into it.
 *
 * This link is the only thing standing between the owner and a report they can
 * never close, so it says plainly what it is for — an owner who deletes this as
 * a receipt has lost control of their own post.
 */
export async function sendReportManageLink({ report, manageUrl }) {
  const name = report.dogName ?? 'your dog';

  return send({
    to: report.contact.email,
    subject: `Keep this — your report for ${name}`,
    text: [
      `Your report for ${name} is live, and people nearby can see it now.`,
      ``,
      `Keep this email. This link is how you manage the report — there is no`,
      `password and no account, so it is the only way back in:`,
      ``,
      manageUrl,
      ``,
      `From there you can:`,
      `  - mark ${name} as found, which takes the report out of search`,
      `  - correct the description or where they were last seen`,
      `  - take the report down`,
      ``,
      `We will email you whenever somebody reports seeing ${name}.`,
      ``,
      `Anyone with this link can manage the report, so forward it only to people`,
      `helping you look.`,
    ].join('\n'),
  });
}

/**
 * Someone logged a sighting of a lost dog. The owner is refreshing the page in
 * the meantime, so this needs to reach their phone, not their dashboard.
 */
export async function sendSightingLogged({ report, sighting, distanceKm, appUrl }) {
  const name = report.dogName ?? 'your dog';
  const where = sighting.location?.address ?? sighting.location?.city ?? 'a location on the map';
  const link = `${appUrl}/reports/${report._id}`;

  return send({
    to: report.contact.email,
    // The dog's name in the subject line: this has to be readable on a lock
    // screen, next to everything else competing for their attention.
    subject: `Possible sighting of ${name} near ${where}`,
    text: [
      `Someone reported seeing ${name}.`,
      ``,
      `Where: ${where}${distanceKm != null ? ` (${distanceKm} km from where you lost them)` : ''}`,
      `When: ${new Date(sighting.seenAt).toLocaleString('en-IN')}`,
      sighting.note ? `\nWhat they said: ${sighting.note}` : '',
      sighting.media?.length ? `\nThey attached a photo — open the report to see it.` : '',
      ``,
      `See it on the map: ${link}`,
      ``,
      `This is someone's best guess, not a confirmation.`,
    ]
      .filter(Boolean)
      .join('\n'),
  });
}

export async function sendOrganizationRejected(org, note) {
  return send({
    to: org.email,
    subject: 'About your StreetPaws registration',
    text: [
      `Hello ${org.contactPersonName ?? org.name},`,
      ``,
      `We are not able to approve your registration at this time.`,
      note ? `\nReason: ${note}` : '',
      ``,
      `If you think this is a mistake, reply to this email.`,
    ].join('\n'),
  });
}
