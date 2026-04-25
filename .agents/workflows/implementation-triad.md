---
name: implementation-triad
description: Run a sequential implementation workflow with Workflow Orchestrator, Planning agent, Generating agent, and Critic
---

# Implementation Triad Workflow

Use this workflow for any task that performs implementation, meaning any task
that mutates repo-tracked files or otherwise applies repo-tracked changes.

This workflow follows the repo-wide policy in `AGENTS.md`. It cannot override
higher-priority platform, system, developer, or tool constraints.

## Roles

Use these exact role names:

- `Workflow Orchestrator`
- `Planning agent`
- `Generating agent`
- `Critic`

`Workflow Orchestrator` is the controller. Only one main stage is active at a
time.

## Trigger Matrix

- Non-implementation task -> triad does not trigger.
- Implementation task without an explicit delegation/subagent request -> run the
  full workflow sequentially in-thread.
- Implementation task with an explicit delegation/subagent request -> keep the
  same orchestrated sequence and allow optional read-only helper subagents.
- Helper subagents may be used only for read-only planning support, tests, log
  analysis, security review, or other specialist review.
- Never run parallel writers.

## State Machine

Use these states in order:

1. `Plan`
2. `Plan Approved`
3. `Implement Slice`
4. `Critique Slice`
5. `Revise Slice`
6. `Replan`
7. `Final Critique`
8. `Done`

Hard gates:

- No implementation before `Plan Approved`.
- No critique before a concrete slice artifact exists.
- No next slice before the current slice has explicit `Critic` approval.
- Only `Generating agent` may edit repo-tracked files.

## Plan Approval

- `Workflow Orchestrator` approves the plan by default for normal-risk tasks.
- Require user approval before leaving `Plan` for:
  - schema or migration changes
  - new production dependencies
  - external API contract changes
  - auth/security-sensitive behavior changes
  - destructive operations

## Planning Agent Responsibilities

- Scan the local repo first.
- Browse official or other primary sources only when external APIs, libraries,
  standards, security, or best-practice choices materially affect the plan.
- Produce a decision-complete planning artifact before implementation begins.
- Re-enter the workflow whenever `Critic` returns `replan_required`.

## Planning Artifact

Every approved plan must include:

- goal and success criteria
- ordered slice list
- target files or subsystems per slice
- invariants and constraints
- acceptance criteria per slice
- validation commands per slice
- rollback notes
- concise cited research summary when browsing was materially required

## Generating Agent Responsibilities

- Implement only from the approved planning artifact.
- Work one slice at a time.
- Produce an implementation artifact for each slice.
- Address critique feedback before starting the next slice.

## Implementation Artifact

Each implemented slice must report:

- slice completed
- files changed
- checks run
- assumptions followed
- remaining risks or blockers

## Critic Responsibilities

- Remain review-only; do not implement changes directly.
- Review each slice against the approved plan, cited research when present, repo
  rules, and task requirements.
- Return a structured critique verdict with concrete findings and exact next
  action.

## Critique Verdict Contract

Allowed verdicts:

- `approved`
- `changes_required`
- `replan_required`

Each verdict must include:

- findings
- rationale
- exact required next action

## Slice Loop

Repeat this loop for every planned slice:

1. `Generating agent` implements one slice and produces an implementation
   artifact.
2. `Critic` reviews the slice and returns a verdict.
3. If the verdict is `changes_required`, return to `Revise Slice`.
4. If the verdict is `replan_required`, return to `Replan`.
5. Move to the next slice only after the verdict is `approved`.

## Stall and Replan Rules

- Escalate automatically to `Replan` if the same slice fails review twice.
- Escalate automatically to `Replan` if critique feedback conflicts across
  rounds.
- Escalate automatically to `Replan` if the generator cannot satisfy critique
  without changing plan assumptions.

## Done Criteria

The workflow reaches `Done` only when:

- all planned slices have explicit `Critic` approval
- all required validation commands have passed
- any replan loops have been resolved
- `Critic` provides a final whole-change sign-off
