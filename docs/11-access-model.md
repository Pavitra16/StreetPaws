# 11 — Who can do what

Three levels of access, not two. Most of the site needs no account at all.

| | Authorised by | Used for |
|---|---|---|
| **Public** | nothing | reporting, searching, sightings, adoption, donating |
| **Manage link** | a token in an emailed URL | one lost report, by the person who filed it |
| **Password** | session cookie | `/rescuer` and `/admin` |

---

## Public — and staying that way

Report a dog · Find a dog · view any report · **log a sighting** · browse and
apply to adopt · donate · read the fund ledger.

The case for gating some of this behind a login was considered and rejected,
because of who is on the other end at each moment:

**Find is the other half of Report.** The whole lost-dog flow
([10](10-lost-dog-flow.md)) is built for a stranger who has just spotted a dog,
has no account, and will not make one. An owner shares the report to a
neighbourhood WhatsApp group; a neighbour taps the link. A login wall there ends
the chain that the feature exists to start. The same wall would also keep the
page out of a search index, and "lost beagle Hauz Khas" typed into Google is a
real way these dogs get found.

**Nobody creates an account to give money away.** Guest checkout is the norm in
payments because signup is the largest single drop-off, and a donation is a
one-shot act with no ongoing relationship to justify one. `Donation.donor.anonymous`
also exists — requiring an account in order to donate anonymously does not hold
together.

**The problems a login wall would supposedly solve have better answers.**
Scraping contact details is already handled by masking plus the list-view
exclusion ([03](03-reporting-a-dog.md#contact-masking)). Spam is what the rate
limiters are for, and phone OTP is the targeted tool if it ever gets past them.
Accountability comes from collecting contact details at the point of action,
which is when someone will actually give them.

The principle: **the cost of a wall is highest exactly where the stakes are
highest** — an injured animal, a missing pet, someone about to donate.

---

## The manage link

Filing a report never creates an account, which left the owner of a missing dog
unable to do the one thing only they can know to do: say the dog is home. Their
report stayed `open` forever, kept surfacing in searches, and kept collecting
sightings for a dog asleep on a sofa.

The fix is a scoped token, not an account.

```
submit lost report  ──▶  crypto.randomBytes(32)
                          │
                    ┌─────┴──────┐
              raw token      SHA-256 hash
                    │              │
              emailed +      stored on the report
              returned once  (select: false)
```

`services/reportAccessService.js`. Same shape as the password-reset token in
`authService` — the database holds only the hash, so a dump contains nothing
anyone can click.

### What it authorises

`GET /reports/:id/manage` · `PATCH /reports/:id/manage` ·
`POST /reports/:id/manage/resolve`

- mark the dog **reunited**, or take the report down
- edit the description, name, breed, last-seen location
- publish or withdraw the phone number — the consent is theirs to take back

And nothing else. It cannot sign in, cannot read another report, cannot reach
`/rescuer` or `/admin`.

### Three deliberate limits

**Lost reports only.** A found report's reporter is a bystander, not the
animal's owner. Handing them a "mark resolved" button would let a passer-by
close a case a rescuer is on their way to. Enforced at creation
(`b.kind === 'lost' && Boolean(b.contact.email)`) so no payload can request one.

**Only the two outcomes an owner can know about.** `resolveManagedReportSchema`
accepts `reunited` and `closed`. `assigned`, `in_treatment` and `resolved` are
rescuer-driven and rejected with a 400.

**No expiry, but revocation.** A reset token lives 60 minutes because it is used
seconds after being requested. A dog can be missing for weeks, and a link that
dies mid-search strands the one person who can close the report. Closing the
report sets `manage.revokedAt`, and the link stops working.

### The trade being made

Anyone holding the link can act on it — a forwarded email included. That is the
price of zero friction, and it is why the scope is one report and five actions
rather than a session. A rescuer console would not accept that trade, which is
why those keep real passwords.

### Failure modes it was designed around

**Every rejection returns the same message.** No token, wrong token, revoked
link and unknown report all answer *"This link is no longer valid"* — telling
them apart would tell someone probing a report id which case they had hit.

**Comparison is constant-time.** `crypto.timingSafeEqual` on the hashes; a plain
`===` leaks how many leading characters matched, which is enough to walk a token
out of the server one byte at a time.

**The link is shown on screen, not only emailed.** SMTP fails quietly — wrong
address, full mailbox, spam folder — and this link cannot be reissued to someone
who never received it, because proving they filed the report is the very thing
the link does. So submitting a lost report lands the owner *on* their manage
page, with the token in the address bar to bookmark, and the email is the backup
copy rather than the only one.

> **Bug caught during this work.** `manage.tokenHash` is `select: false`, which
> governs what a *query* returns — but a document just built by `create()` has
> every field set in memory, so the create response carried the stored hash
> straight back out. Now stripped in `serializeReport`, next to `embedding`.

---

## Password — unchanged

`/rescuer` and `/admin` keep real accounts, `httpOnly` cookies, role checks and
immediate session revocation on password change or deactivation. See
[08](08-authentication.md). Those are ongoing relationships with real authority
over other people's cases and money, which is exactly where a password earns its
friction.
