<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## ApplyTrack architecture
- Data access uses the browser Supabase client + TanStack Query; ownership is enforced only by RLS (`auth.uid() = user_id`) — keep every new table under owner-scoped RLS.
- Validation lives in `src/lib/applications.ts` (zod) mirrored by DB CHECK constraints — change both together.
- Protected pages live under `src/routes/_authenticated/` (client-only gate redirecting to /auth).
