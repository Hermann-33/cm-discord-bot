# ADR-0003: Guild-Only Slash Command Policy

## Status

Accepted — implementation pending for the existing `cm aura` message command

- Date: 2026-08-17
- Type: Product / Security / Discord interface

## Context

The current bot mixes one message command (`cm aura`) with one guild slash command (`/refresh-leaderboard`). Future admin features are high impact. The desired product rule is a single configured Cheater's Market server and slash-command-only interaction.

## Decision

- All command surfaces should converge on Discord slash commands.
- Commands are registered to the configured guild, not globally.
- Every command must also perform an explicit runtime `inGuild()`/guild-ID check; registration scope is defense in depth, not the only guard.
- DMs fail closed.
- `cm aura` is a migration target and should become `/aura` (or an equivalent approved slash name).
- `/refresh-leaderboard` remains a slash command and should retain/strengthen explicit guild, channel, and staff authorization.
- Admin/mutation commands receive the stronger user-ID whitelist controls in ADR-0004.

## Consequences

Benefits:

- discoverable typed commands;
- no free-form prefix parsing for future admin actions;
- less accidental cross-guild/DM exposure;
- eventual ability to drop Message Content intent if nothing else requires it.

Costs:

- migration work is required for `cm aura`;
- command registration changes must be deployed explicitly.

## Current-state caveat

This ADR describes the accepted end state. Current source still implements `cm aura` through `MessageCreate`. Do not misreport the migration as completed until code/registration/tests are changed and verified.

## Rollback/supersession

A decision to retain message commands or global commands requires a new ADR.