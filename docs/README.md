# EchoBrief Documentation

Engineering documentation for the EchoBrief meeting intelligence platform.
Start with [Architecture](architecture.md) if you are new to the codebase.

---

## Understanding the system

| Doc | Read it when you need to know… |
|---|---|
| [Architecture](architecture.md) | How the four runtimes fit together, the meeting state machine, the design principles behind the boundaries |
| [Pipeline](pipeline.md) | Exactly what happens between "paste a meeting URL" and "summary in the inbox" — every hop, fallback and race |
| [Chat & analytics](chat-and-analytics.md) | How Ask retrieves transcripts, and how conversation metrics are computed rather than estimated |
| [Database](database.md) | Schema, RLS, the columns that carry pipeline semantics, migration history |
| [Edge functions](edge-functions.md) | What each of the 52 functions does, how it is triggered, and how it authenticates |
| [MCP server](mcp.md) | How Claude and other LLM tools read the meeting data — tools, token auth, limits |

## Working on it

| Doc | Read it when you need to… |
|---|---|
| [Contributing](contributing.md) | Set up locally, and learn the rules that are actually enforced |
| [Experience audit](audits/2026-09-09/README.md) | Review verified UI fixes, screenshots, test coverage and the remaining priorities |
| [Testing](testing.md) | Understand the four test tiers and the eval suite, and which one catches what |
| [Security](security.md) | Add a function, touch auth, or reason about tenant isolation |
| [Operations](operations.md) | Deploy, change a cron, respond to an alert, or debug a stuck meeting |

## Reference

| Doc | Contents |
|---|---|
| [Errors runbook](../errors.md) | Every error signature the pipeline can produce, with root cause and recovery |
| [Engineering notes](engineering-notes.md) | Long-form write-ups of 24 problems this system hit and how each was solved |
| [Evals](../scripts/evals/EVALS.md) | The 8 output-quality graders, judge calibration, and the production→eval feedback loop |
| [Brand](../BRAND.md) | Colours, typography, design guidelines |

---

## Quick answers

**A meeting is stuck.** → [Operations § incident playbook](operations.md#incident-playbook)

**Why is the transcript empty?** → [Pipeline § why chunking exists](pipeline.md#why-chunking-exists)

**Why is the speaker called `SPEAKER_01`?** → [Pipeline § speaker attribution](pipeline.md#stage-5--speaker-attribution)

**Can I make a cron run more often?** → Almost certainly not. [Operations § scheduled jobs](operations.md#-do-not-raise-these-frequencies)

**Where do I add a new error signature?** → Two files, together. [Contributing § documenting a new error](contributing.md#documenting-a-new-error)

**Why doesn't regenerating insights do anything?** → `saveInsights` only inserts. [Pipeline § insights and delivery](pipeline.md#stage-6--insights-and-delivery)
