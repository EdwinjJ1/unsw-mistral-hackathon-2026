# Voice note scripts — record these on a phone (30-45s each, casual tone)

These are written to be READ ALOUD by a teammate and recorded as voice memos.
Natural pauses, um's, and imperfections make them MORE useful, not less.
If the ingest path is text-only, transcribe-and-paste the recording, or feed
these scripts directly as "voice memo transcript" payloads.

---

## VOICE 1 — Aisha (Ops), walking between meetings
**Planted signal: restates the auth contradiction + runbook blocked, verbally**

"Hey, it's Aisha — quick brain dump before I forget. So the runbook's
basically written, right, but I can't take it out of draft. Two reasons.
One — Sam keeps saying the auth migration shipped, and, look, maybe it did,
but the platform dashboard was showing six out of ten nodes this morning,
and my whole capacity table assumes the full pool. If we launch and only
six nodes can write to the bucket, the p95 goes from four minutes to, like,
eleven-plus, and that's... that's not what the pricing page says. And two —
I still don't have a final retention number. Legal says fourteen days max
for Enterprise, the trash UI literally says thirty. Someone above my pay
grade needs to pick one, because the purge steps in section three change
completely depending on which it is. Okay. That's it. Bye."

---

## VOICE 2 — Priya (Product), end of day
**Planted signal: unowned comms plan escalating, plus a soft new risk (help
article references 30 days — spreads the retention conflict further)**

"Hi, it's Priya, um, end-of-day note for the launch doc. Mostly good day —
copy's approved, load test's green. Two things keeping me up. The comms plan
still has no owner. Third week. If nobody takes it by tomorrow I'm taking it
myself, which, given I'm also launch commander, is a terrible idea, so —
please, someone. And second, smaller thing, the help-center article draft
went out for review today and it quotes the thirty-day restore window in,
like, four places. Dana's screens say thirty too. So if Marcus's fourteen-day
thing is real, it's not one fix, it's the trash UI, the help article, the
empty states... it compounds every day we don't decide. Anyway. Tomorrow."

---
---

# DM reply fixtures — feed these through the bot's Absorb path (triage → extract)

These simulate what real humans type back to a check-in DM. Mix of signal
and noise, for testing triage classification.

REPLY 1 (Aisha, real update — should extract task status + blocker):
"runbook's done content-wise but I'm keeping it in draft — still blocked on
confirming the auth migration actually hit all 10 nodes, and the retention
window question is still open with legal"

REPLY 2 (Sam, real update — contradicts Aisha's, should trigger conflict):
"AUTH-42 is done, shipped the full pool last night. runbook should be
unblocked from my side"

REPLY 3 (Dana, noise + soft signal):
"lol mostly just pixel pushing today. trash UI is in staging if anyone wants
to poke it"

REPLY 4 (pure noise — must extract to NOTHING):
"haha yeah no worries, thanks!"

REPLY 5 (pure noise — must extract to NOTHING):
"👍"

REPLY 6 (Marcus, real update — hardens the legal condition):
"to be clear on my end: sign-off stays conditional until the 14-day cap is
in the build or tier-split purge exists. checklist should not show legal as
green"

---
---

# Task tracker export — tasks.csv (paste into a .csv file or ingest as text)

id,title,team,owner,status,due,notes
TASK-201,Export pipeline checkpoint-retry,Engineering,Sam Okafor,done,yesterday,load test green at 2x
TASK-202,AUTH-42 service-token migration,Engineering,Sam Okafor,done,today,"closed by Sam; Ops disputes node count"
TASK-203,EU export bucket provisioning,Engineering,Sam Okafor,in_progress,tomorrow,legal needs confirmation
TASK-204,Trash/restore UI,Design,Dana Liu,done,yesterday,in staging; copy says 30-day window
TASK-205,Export progress states,Design,Dana Liu,done,2 days ago,
TASK-206,Rollback runbook,Legal/Ops,Aisha Torres,blocked,tomorrow,"DRAFT; blocked on AUTH-42 confirmation + retention decision"
TASK-207,Data-handling legal review,Legal/Ops,Marcus Webb,in_progress,today,sign-off conditional per memo §4
TASK-208,Launch-day comms plan,Product,,not_started,in 2 days,NO OWNER — third week unowned
TASK-209,Help-center export article,Product,Priya Sharma,in_progress,tomorrow,quotes 30-day window in 4 places
TASK-210,Pricing page copy,Product,Priya Sharma,done,today,"final: your data out in minutes"
