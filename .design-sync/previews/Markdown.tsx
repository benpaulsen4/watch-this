import { Markdown } from "watch-this";

const HELP_ARTICLE = `# Sharing a list

Lists in WatchThis are private until you invite someone. Collaborators can add
titles, mark episodes watched, and leave the list at any time.

## Inviting collaborators

1. Open the list you want to share.
2. Choose **Collaboration** from the list menu.
3. Send the invite link, or add someone by username.

> Anyone with the invite link can join the list until you revoke it.

### Permissions

| Role | Add titles | Mark watched | Invite others |
| --- | --- | --- | --- |
| Owner | Yes | Yes | Yes |
| Collaborator | Yes | Yes | No |
| Viewer | No | No | No |

Revoke a link with \`Settings → Collaboration → Reset link\`, or read more in the
[help centre](/help).
`;

export function HelpArticle() {
  return (
    <div className="max-w-2xl">
      <Markdown markdown={HELP_ARTICLE} />
    </div>
  );
}

export function Inline() {
  return (
    <div className="max-w-2xl">
      <Markdown
        markdown={
          "Episode counts sync from TMDB every night. If a season looks wrong, " +
          "use **Refresh metadata** on the title, or report it via `Help → Feedback`."
        }
      />
    </div>
  );
}
