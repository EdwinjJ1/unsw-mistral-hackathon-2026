# Slack — #digest-launch (last 36h, trimmed)

[yesterday 09:20] luna: launch checklist review at 2, calendar's out
[yesterday 09:21] shirley: 👍
[yesterday 09:24] henry: can we keep it tight, migration finishing today

[yesterday 10:15] shirley: trash experience is in staging. empty state reads "Items stay in Trash for 30 days" — matches the brief. screenshots in thread
[yesterday 10:18] luna: 🎉 that 30 day number tested so well
[yesterday 10:31] aiden: 👀 please read my memo before that copy goes any further

[yesterday 11:40] nick: rate limit guidance for launch day is in the shared doc. tl;dr batch the digest jobs, don't fan out
[yesterday 11:42] henry: 🙏 that changes the pipeline design a bit, will look tonight
[yesterday 11:45] asjad: also worth benchmarking small vs large for the summarisation step, small might be enough and it's a lot cheaper at your volume
[yesterday 11:47] henry: noted, adding to the RFC

[yesterday 12:50] sam: anyone else's calendar completely destroyed this week
[yesterday 12:51] shirley: lol yes
[yesterday 12:52] sam: cool cool cool

[yesterday 15:30] luna: checklist review done. two things still open: legal sign-off and the comms plan which STILL has no owner. third week. someone please
[yesterday 15:32] shirley: not it 😅
[yesterday 15:35] sam: can't, on-call launch week

[yesterday 17:50] aiden: reminder that legal sign-off is conditional, two open items in my memo section 3. it's been showing as "expected today" on the checklist for four days now
[yesterday 17:58] luna: fair, fixing the wording

[today 08:55] priya: migration's done, all 200 instances are on the new scheme ✅
[today 08:57] henry: 🎉 nice work
[today 08:58] shirley: 🎉

[today 09:35] sam: quick q — 200 instances, is that customer instances or service instances? my capacity table assumes ~4000 customer tenants
[today 09:41] priya: 200 is what was in the ticket
[today 09:42] sam: right but which kind
[today 09:44] priya: I'd have to check the original scope doc
[today 09:45] sam: keeping the runbook in draft until we know

[today 10:20] luna: marketing wants final copy today. going with "your team's week, summarised" — everyone ok?
[today 10:22] henry: fine
[today 10:23] shirley: 👍
[today 10:30] aiden: fine as long as nothing in it promises a recovery window

[today 11:15] shirley: lunch?
[today 11:16] sam: yes please
[today 11:16] henry: can't

[today 12:00] luna: @channel freeze on new launch-blocking items after tomorrow. if you know about a risk, raise it TODAY

---
---

# Loom transcript — "Runbook status, 90 seconds" (Sam, today 09:50)

*Auto-transcribed*

"Hey, quick one for whoever picks this up. The runbook's basically written but
I can't take it out of draft yet, and I want the reason on record rather than
in my head.

Two things. First — Priya posted this morning that the migration's done, two
hundred instances. And I believe her, that's not the issue. The issue is my
capacity table is built on customer instances and there are about four
thousand of those. Two hundred matches our service instance count almost
exactly. So either the migration's complete and we're fine, or somebody read
two hundred as customer coverage and we've got thirty-eight hundred tenants
that fall over the moment we run at launch volume. Nobody's wrong, the word's
just doing two jobs.

Second thing, the retention window. Legal says fourteen days for Enterprise,
the trash screens say thirty, and I've now seen thirty in the help article
draft too. That's not one fix, that's three surfaces and it gets worse every
day nobody decides. Luna and Aiden need to sit down.

That's it. I'll update the runbook the second either of those closes."
