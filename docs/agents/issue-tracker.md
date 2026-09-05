# Issue Tracker

## Type
Local Markdown

## Storage
Issues and task specifications live as Markdown files under `.scratch/<feature>/` within this repository.

## Convention
- Each feature or work package gets its own directory: `.scratch/<feature-name>/`
- Tickets are written as Markdown files (e.g., `01-task-name.md`) containing context, requirements, acceptance criteria, and status.
- Skills like `to-tickets`, `triage`, `to-spec`, and `qa` read and update these files directly without external API calls.
- External PRs as request surface: No (local tracker).
