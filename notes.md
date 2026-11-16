
Smoother daily use: find anything across the workspace, put finished projects away and see what changed.

- **Search:** a Search page in the sidebar finds work items by title or key across every project you're in. Each project also has a List view beside its board, using the same filters.
- **Archiving projects:** project admins can archive a finished project. It becomes read-only, is hidden from the sidebar, the home page and "My work", and is listed under "Archived" on the projects page. Unarchiving brings it back.
- **Activity:** an Activity page shows what changed in the workspace, newest first and grouped by day. It covers work items, comments, projects, states and members, and only shows what you're allowed to see.
- **Comments:** authors can edit their own comments, and edited comments say so next to their time. Admins can't edit other people's comments.
- **Assignee when creating:** the new work item dialog has an assignee picker.
- **Fixed:** adding or removing a project member was logged as someone joining or leaving the workspace.

Upgrading runs three database changes automatically: a column for comment edits, two for archiving, and an index for the activity page. Back up first, as the README describes.

