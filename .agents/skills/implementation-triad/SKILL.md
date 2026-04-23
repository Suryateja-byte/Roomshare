---
name: implementation-triad
description: Use for repo-tracked implementation work that should follow a sequential Workflow Orchestrator -> Planning agent -> Generating agent -> Critic loop. Trigger on implementation requests or explicit mentions of the triad, planner/generator/critic workflow, or orchestrated implementation.
---

# Implementation Triad Skill

Run implementation work as `Workflow Orchestrator`.

Use this skill when:

- the task will mutate repo-tracked files
- the user explicitly asks for the triad workflow
- the user asks for a planner/generator/critic implementation loop

Do not use this skill for explanation-only, review-only, or other non-mutating
tasks.

## Core Rules

- One active main stage at a time.
- At most one writer.
- `Generating agent` is the only role allowed to edit repo-tracked files.
- `Critic` is review-only.
- No implementation before plan approval.
- No critique before a concrete slice artifact exists.
- No next slice before the current one has explicit `Critic` approval.
- Replan on drift, weak planning, or review thrash.

## Delegation Rules

- Use real subagents only when the user explicitly asks for delegation or
  subagents.
- Without an explicit delegation request, run the same phases sequentially
  in-thread.
- Optional helper subagents may be used only for read-only research, tests, log
  analysis, security review, or other specialist review.
- Never run parallel writers.

## Workflow

### 1. Classify

- If the task is non-mutating, do not trigger the triad workflow.
- If the task mutates repo-tracked files, enter the triad workflow.

### 2. Plan

Activate `Planning agent` first.

The planning stage must:

- scan the local repo first
- browse primary sources only when external APIs, libraries, standards,
  security, or best-practice choices materially affect the implementation
- produce a decision-complete planning artifact

Required planning artifact fields:

- goal and success criteria
- ordered slice list
- target files or subsystems per slice
- invariants and constraints
- acceptance criteria per slice
- validation commands per slice
- rollback notes
- concise cited research summary when browsing was materially required

### 3. Approve Plan

- `Workflow Orchestrator` approves the plan by default for normal-risk tasks.
- Require user approval before implementation for:
  - schema or migration changes
  - new production dependencies
  - external API contract changes
  - auth/security-sensitive behavior changes
  - destructive operations

### 4. Implement One Slice

Activate `Generating agent`.

The generator must:

- implement exactly one approved slice at a time
- stay within the approved plan
- produce an implementation artifact with:
  - slice completed
  - files changed
  - checks run
  - assumptions followed
  - remaining risks or blockers

### 5. Critique the Slice

Activate `Critic` only after a concrete slice artifact exists.

The critic must return one of:

- `approved`
- `changes_required`
- `replan_required`

Each verdict must include:

- findings
- rationale
- exact required next action

### 6. Loop

- If verdict is `approved`, move to the next slice.
- If verdict is `changes_required`, return only to `Generating agent`.
- If verdict is `replan_required`, return to `Planning agent`.

### 7. Escalate

Escalate automatically to replanning when:

- the same slice fails review twice
- critique feedback conflicts across rounds
- the generator cannot satisfy critique without changing plan assumptions

### 8. Finish

The task is done only when:

- all planned slices have explicit `Critic` approval
- all required validation commands have passed
- any replan loops have been resolved
- `Critic` gives final whole-change sign-off
