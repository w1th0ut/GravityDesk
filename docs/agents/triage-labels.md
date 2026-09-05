# Triage Labels

## Vocabulary

This repository uses the canonical five-role triage state machine:

| Role | Label String | Meaning |
|---|---|---|
| Needs evaluation | `needs-triage` | Newly created issue or feature requiring evaluation |
| Waiting on reporter | `needs-info` | Blocked on clarification or user input |
| AFK Agent Ready | `ready-for-agent` | Fully specified specification ready for autonomous execution |
| Human Implementation | `ready-for-human` | Requires human decision, physical device testing, or credentials |
| Will Not Fix | `wontfix` | Discarded, out of scope, or obsolete |

## Usage
Autonomous agents inspecting `.scratch/` tasks should respect these status flags to determine execution readiness.
