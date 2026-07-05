# Primary Developer Management Page — Racoon Eye v1

Status: **fully discussed and confirmed** (2026-07-05).

**This page is intentionally disconnected from the main site.** It is not linked from the homepage, hamburger menu, footer, or any public-facing page. It should only be accessible via a direct URL known to authorized developers, or via a separate entry point (exact mechanism TBD at build time, but must not be discoverable via the main site UI).

## Purpose

Central hub for all developer administration tasks:
- Manage developer accounts and credentials (create, revoke, reset passwords)
- Manage all access types (first-aid catalog editing, hospital profile management, etc.)
- View audit logs of developer actions across the platform
- Access separate management portals (first-aid developer page, hospital management portal, etc.)

## Interface

- **No site theme required** — this is an internal admin tool, so it can prioritize clarity over branding (though sans-serif fonts should still be used).
- **Access control:** requires a master developer/admin login (separate from regular developer credentials; exact flow TBD).

## Sections

### 1. Developer account management
- List all active developer accounts
- Create new developer account (generate credentials, assign role/access type)
- Revoke access (disable an account immediately)
- Reset password (issue a temporary password or reset link)
- Audit log: view actions taken by each developer (timestamp, action type, resource modified)

### 2. Access type management
- Define and manage access types (e.g., "first-aid-editor", "hospital-manager", "admin").
- Assign/revoke access types per developer account.
- Set per-access-type rate limits, action caps, or other restrictions (if needed).

### 3. Portal links
- Direct links to separate management portals:
  - **First Aid developer portal** ([first-aid.md](first-aid.md) developer section)
  - **Hospital management portal** ([hospital-management-portal.md](hospital-management-portal.md))
  - (Additional portals added as the app scales)

### 4. System audit logs
- Searchable/filterable log of all developer actions across the platform
- Fields: timestamp, developer ID, action type (upload, edit, delete, revoke, etc.), resource (first-aid entry, hospital listing, developer account, etc.), change description
- Retention and export options (TBD)

### 5. Settings (TBD)
- Session timeout policies
- Rate-limiting rules
- Credential expiration policies
- etc.

## Security

- **URL:** not linked anywhere on the main site; access via direct URL or a separate admin entry point.
- **Master login:** requires a separate, hardened authentication (stronger than regular dev login) — exact mechanism TBD, but should consider:
  - Multi-factor authentication (MFA) if feasible.
  - Hardened password policy.
  - IP whitelisting (if infrastructure allows).
  - Session logging/alerting on unusual access patterns.
- **Audit trail:** every action on this page is logged (who, what, when, why if applicable).
- **Security-auditor:** must review this page thoroughly before deployment — it is the master key to all developer access and sensitive system configuration.

## Open items / not yet decided

- URL structure / access mechanism (how is it discovered/accessed by authorized admins?).
- Master login flow (hardened auth, MFA, etc.).
- Exact roles/access-type taxonomy.
- Rate-limiting and action-cap granularity.
- Audit log retention policy and export formats.
