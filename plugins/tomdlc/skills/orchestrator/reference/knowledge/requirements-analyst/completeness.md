# Completeness checklist

Stories describe what someone asked for. Systems also need capabilities nobody thinks to ask for until they're missing: deleting a record, exporting data, changing a setting, finding something in a long list. Run this checklist after drafting the stories. For each item that could apply, write a requirement, put it in a later increment on the story map, or record it as explicitly out of scope, with a reason.

Scale it like the edge-case sweep: at the low tier, the primary entities and user types only; at the moderate and high tiers, every entity and user type.

## For each entity the users work with
| Capability | Questions |
|---|---|
| Create, view, edit, delete | Can each be done, by whom? Is delete a real delete, an archive or an anonymization? Can it be undone? |
| Lists | Is there a list? Pagination, sort order, filters, search, empty state |
| Search | Which fields? Exact or fuzzy? Results ranked how? Limits? |
| Bulk actions | Edit, delete or export many at once? Limits and partial failure? |
| History | Who changed what, when? Visible to whom? How long kept? |
| Ownership and sharing | Who owns a record? Can it be shared or transferred? What happens when the owner leaves? |
| Import and export | Formats, size limits, validation, what happens with bad rows, duplicates on re-import |
| Relationships | What happens to related records on delete or archive? |

## For the system as a whole
| Capability | Questions |
|---|---|
| Accounts and access | Sign-up or invitation, roles, deactivation, password reset, single sign-on, who manages users |
| Settings and preferences | Per user and per organization; defaults; who can change them |
| Notifications | Which events notify whom, on which channels (email, in-app, chat); preferences and unsubscribe; batching and rate limits |
| Internationalization | Languages, date, number and currency formats, time zones, right-to-left scripts, translated content vs interface only |
| Onboarding and help | First run, empty states, help text, documentation, contact for support |
| Administration and support | What do admins and support staff need: look up a user, see what happened, fix data, impersonate (with audit)? |
| Reporting | What do people need to measure or report on, how often, exported how? |
| Integrations | APIs, webhooks, inbound and outbound integrations, and what happens when one is down |
| Personal data rights | Export, correction and deletion of a person's data (see the compliance guide) |
| Data lifecycle | Retention, archiving, backups, and deleting an organization's data when it leaves |
| Offline and sync | Does anything need to work offline or on a poor connection? Conflict handling on reconnect |
| Billing | Plans, limits, invoices, payment failures (commercial products only) |
| Status and errors | How users learn about outages or maintenance; what error pages show |
| Accessibility | Covered by the `NFR [a11y]` requirement when there's a user interface |

## Recording it
Add a **Completeness** table to `02-requirements.md`: capability, entity or scope, and how it was settled (requirement ID, later increment, or out of scope with a reason). The reviewer checks that the table exists and that nothing obviously needed is missing.

Facts checked against primary sources on 2026-10-14.
