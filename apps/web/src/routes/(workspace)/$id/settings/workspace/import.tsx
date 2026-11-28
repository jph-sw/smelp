import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import { usePageTitle } from "#/hooks/use-page-title";
import {
	applyJiraImport,
	type JiraDryRun,
	type JiraImportMapping,
	type JiraImportResult,
	previewJiraImport,
	type StateTarget,
} from "#/lib/data/jira-import";
import { toastError } from "#/lib/errors";
import { useWorkspaceAccess } from "#/lib/workspace-viewer";

export const Route = createFileRoute(
	"/(workspace)/$id/settings/workspace/import",
)({
	component: RouteComponent,
});

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const TARGET_ITEMS: { label: string; value: StateTarget }[] = [
	{ label: "Backlog", value: "backlog" },
	{ label: "Todo", value: "todo" },
	{ label: "In Progress", value: "in_progress" },
	{ label: "Done", value: "done" },
	{ label: "Cancelled", value: "cancelled" },
];
const ACCESS_ITEMS = [
	{ label: "Private", value: "private" },
	{ label: "Public", value: "public" },
];
const NO_USER = "__none__";

type ProjectEdit = {
	include: boolean;
	id: string;
	name: string;
	access: "public" | "private";
};

const ID_PROBLEMS: Record<string, string> = {
	invalid: "Use 2 to 5 letters or digits, starting with a letter.",
	taken: "This id is already in use. Choose another.",
	imported: "Already imported into this workspace. Leave it out.",
	duplicate: "Chosen for more than one project.",
};

function changedFrom<T>(now: Record<string, T>, base: Record<string, T>) {
	return Object.fromEntries(
		Object.entries(now).filter(([key, value]) => base[key] !== value),
	);
}

function seedFrom(next: JiraDryRun) {
	return {
		p: Object.fromEntries(
			next.projects.map((project) => [
				project.jiraKey,
				{
					include: project.include,
					id: project.id,
					name: project.name,
					access: project.access,
				},
			]),
		) as Record<string, ProjectEdit>,
		s: Object.fromEntries(
			next.statuses.map((status) => [status.name, status.target]),
		) as Record<string, StateTarget>,
		u: Object.fromEntries(
			next.users.map((user) => [user.key, user.userId]),
		) as Record<string, string | null>,
	};
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="text-xs font-medium text-muted-foreground">{children}</h3>
	);
}

function RouteComponent() {
	usePageTitle("Import from Jira");
	const { id: workspaceId } = Route.useParams();
	const queryClient = useQueryClient();
	const { canManage } = useWorkspaceAccess();
	const fileInput = useRef<HTMLInputElement>(null);

	const [csv, setCsv] = useState<string | null>(null);
	const [fileName, setFileName] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [plan, setPlan] = useState<JiraDryRun | null>(null);
	const [checked, setChecked] = useState("");
	const [projects, setProjects] = useState<Record<string, ProjectEdit>>({});
	const [statuses, setStatuses] = useState<Record<string, StateTarget>>({});
	const [users, setUsers] = useState<Record<string, string | null>>({});
	// What the server chose on its own, so only the importer's changes are sent back.
	const [baseline, setBaseline] = useState<{
		s: Record<string, StateTarget>;
		u: Record<string, string | null>;
	}>({ s: {}, u: {} });
	const [isWorking, setIsWorking] = useState(false);
	const [result, setResult] = useState<JiraImportResult | null>(null);

	if (!canManage) {
		return (
			<p className="text-sm text-muted-foreground">
				Only workspace admins can import data.
			</p>
		);
	}

	const buildMapping = (
		p = projects,
		s = statuses,
		u = users,
		base = baseline,
	): JiraImportMapping => ({
		projects: p,
		// Only what the importer changed: the rest is the server's own default.
		statuses: changedFrom(s, base.s),
		users: changedFrom(u, base.u),
		...(baseUrl.trim() ? { jiraBaseUrl: baseUrl.trim() } : {}),
	});
	const mappingKey = JSON.stringify(buildMapping());
	const isStale = plan !== null && mappingKey !== checked;

	// Takes a new dry run in. On a re-check the importer's choices stay, and only
	// what is new (say, a status of a project they just switched on) is filled in.
	const absorb = (next: JiraDryRun, keepEdits: boolean) => {
		const fresh = seedFrom(next);
		const p = keepEdits ? { ...fresh.p, ...projects } : fresh.p;
		const s = keepEdits ? { ...fresh.s, ...statuses } : fresh.s;
		const u = keepEdits ? { ...fresh.u, ...users } : fresh.u;
		const base = keepEdits
			? {
					s: { ...fresh.s, ...baseline.s },
					u: { ...fresh.u, ...baseline.u },
				}
			: { s: fresh.s, u: fresh.u };
		setPlan(next);
		setProjects(p);
		setStatuses(s);
		setUsers(u);
		setBaseline(base);
		setChecked(JSON.stringify(buildMapping(p, s, u, base)));
	};

	const check = async () => {
		if (csv === null) return;
		setIsWorking(true);
		try {
			absorb(
				await previewJiraImport({ workspaceId, csv, mapping: buildMapping() }),
				true,
			);
		} catch (e) {
			toastError(e);
		} finally {
			setIsWorking(false);
		}
	};

	const onFile = async (file: File | undefined) => {
		if (!file) return;
		if (file.size > MAX_FILE_BYTES) {
			toastError(
				new Error("too big"),
				"That file is too large. The limit is 10 MB.",
			);
			return;
		}
		setIsWorking(true);
		try {
			const text = await file.text();
			const next = await previewJiraImport({
				workspaceId,
				csv: text,
				...(baseUrl.trim() ? { mapping: { jiraBaseUrl: baseUrl.trim() } } : {}),
			});
			setCsv(text);
			setFileName(file.name);
			absorb(next, false);
		} catch (e) {
			setCsv(null);
			setPlan(null);
			toastError(e);
		} finally {
			setIsWorking(false);
			if (fileInput.current) fileInput.current.value = "";
		}
	};

	const reset = () => {
		setCsv(null);
		setPlan(null);
		setResult(null);
		setFileName("");
		setChecked("");
	};

	const runImport = async () => {
		if (csv === null) return;
		setIsWorking(true);
		try {
			const done = await applyJiraImport({
				workspaceId,
				csv,
				mapping: buildMapping(),
			});
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] }),
				queryClient.invalidateQueries({ queryKey: ["project-members"] }),
				queryClient.invalidateQueries({ queryKey: ["issues"] }),
				queryClient.invalidateQueries({
					queryKey: ["workspace-activity", workspaceId],
				}),
			]);
			setResult(done);
			setCsv(null);
			setPlan(null);
		} catch (e) {
			toastError(e);
		} finally {
			setIsWorking(false);
		}
	};

	if (result) {
		return (
			<div className="flex flex-col gap-4">
				<Alert>
					<AlertTitle>Import finished</AlertTitle>
					<AlertDescription>
						{result.totals.projects} project(s), {result.totals.workItems} work
						items, {result.totals.comments} comments and{" "}
						{result.totals.relations} relations were created. The projects are
						private unless you chose otherwise, and only the importer and the
						people matched to Jira users are members.
					</AlertDescription>
				</Alert>
				<div className="flex flex-col gap-1">
					{result.projects.map((project) => (
						<Link
							key={project.id}
							to="/$id/projects/$projectId"
							params={{ id: workspaceId, projectId: project.id }}
							className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted"
						>
							<span className="font-medium [overflow-wrap:anywhere]">
								{project.name}
							</span>
							<span className="text-xs text-muted-foreground">
								{project.id} · {project.workItems} work items
							</span>
						</Link>
					))}
				</div>
				{result.warnings.length > 0 && (
					<ul className="list-disc pl-5 text-xs text-muted-foreground">
						{result.warnings.map((warning) => (
							<li key={warning}>{warning}</li>
						))}
					</ul>
				)}
				<Button variant="outline" className="self-start" onClick={reset}>
					Import another file
				</Button>
			</div>
		);
	}

	if (!plan) {
		return (
			<div className="flex max-w-xl flex-col gap-4">
				<div>
					<h2 className="text-sm font-semibold">Import from Jira</h2>
					<p className="text-xs/relaxed text-muted-foreground">
						Upload a Jira CSV export ("Export Excel CSV (all fields)" in the
						issue search). Projects, work items, sub-tasks, assignees, story
						points, comments and issue links come across. Attachments don't.
						You'll see exactly what will be created before anything is saved.
					</p>
				</div>
				<label className="flex flex-col gap-1 text-xs font-medium">
					Jira site address (optional)
					<Input
						value={baseUrl}
						onChange={(e) => setBaseUrl(e.target.value)}
						placeholder="https://your-team.atlassian.net"
					/>
					<span className="font-normal text-muted-foreground">
						Adds a link back to Jira on every imported item.
					</span>
				</label>
				<div>
					<input
						ref={fileInput}
						type="file"
						accept=".csv,text/csv"
						className="hidden"
						onChange={(e) => onFile(e.target.files?.[0])}
					/>
					<Button
						disabled={isWorking}
						onClick={() => fileInput.current?.click()}
					>
						{isWorking ? <Spinner /> : null}
						Choose CSV file
					</Button>
				</div>
			</div>
		);
	}

	const included = plan.projects.filter((project) => project.include);

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h2 className="text-sm font-semibold">Review the import</h2>
					<p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
						{fileName}. Nothing has been saved yet.
					</p>
				</div>
				<Button variant="ghost" size="sm" onClick={reset}>
					Start over
				</Button>
			</div>

			{plan.errors.length > 0 && (
				<Alert variant="destructive">
					<AlertTitle>Fix these before importing</AlertTitle>
					<AlertDescription>
						<ul className="list-disc pl-4">
							{plan.errors.map((error) => (
								<li key={error}>{error}</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}
			{plan.warnings.length > 0 && (
				<Alert>
					<AlertTitle>Worth knowing</AlertTitle>
					<AlertDescription>
						<ul className="list-disc pl-4">
							{plan.warnings.map((warning) => (
								<li key={warning}>{warning}</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}

			<label className="flex flex-col gap-1 text-xs font-medium">
				Jira site address (optional)
				<Input
					value={baseUrl}
					onChange={(e) => setBaseUrl(e.target.value)}
					placeholder="https://your-team.atlassian.net"
				/>
			</label>

			<section className="flex flex-col gap-2">
				<SectionTitle>Projects</SectionTitle>
				{plan.projects.map((project) => {
					const edit = projects[project.jiraKey];
					if (!edit) return null;
					const patch = (change: Partial<ProjectEdit>) =>
						setProjects({
							...projects,
							[project.jiraKey]: { ...edit, ...change },
						});
					return (
						<div
							key={project.jiraKey}
							className="flex flex-col gap-2 rounded-md border p-3"
						>
							<div className="flex items-center gap-3">
								<Switch
									aria-label={`Import ${project.jiraName}`}
									checked={edit.include}
									onCheckedChange={(include) => patch({ include })}
								/>
								<span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
									{project.jiraName}{" "}
									<span className="font-normal text-muted-foreground">
										({project.jiraKey})
									</span>
								</span>
							</div>
							{edit.include && (
								<div className="flex flex-col gap-2 sm:flex-row">
									<Input
										aria-label={`Name for ${project.jiraKey}`}
										value={edit.name}
										maxLength={32}
										onChange={(e) => patch({ name: e.target.value })}
									/>
									<Input
										aria-label={`Id for ${project.jiraKey}`}
										className="sm:w-24 sm:shrink-0"
										value={edit.id}
										maxLength={5}
										aria-invalid={project.idProblem !== null}
										onChange={(e) =>
											patch({ id: e.target.value.toUpperCase() })
										}
									/>
									<Select
										items={ACCESS_ITEMS}
										value={edit.access}
										onValueChange={(access) =>
											access &&
											patch({ access: access as ProjectEdit["access"] })
										}
									>
										<SelectTrigger
											aria-label={`Access for ${project.jiraKey}`}
											className="sm:w-28 sm:shrink-0"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{ACCESS_ITEMS.map((item) => (
												<SelectItem key={item.value} value={item.value}>
													{item.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}
							{project.idProblem && edit.include && (
								<p className="text-xs text-destructive">
									{ID_PROBLEMS[project.idProblem]}
								</p>
							)}
							{project.alreadyImported && !edit.include && (
								<p className="text-xs text-muted-foreground">
									Already imported into this workspace, so it's left out. To
									import it again, delete the imported project first.
								</p>
							)}
							<p className="text-xs text-muted-foreground">
								{project.workItems} work items ({project.subItems} sub-items),{" "}
								{project.comments} comments, {project.relations} relations,{" "}
								{project.members} member(s) added
								{project.states.length > 0 &&
									`. States: ${project.states.join(", ")}`}
							</p>
						</div>
					);
				})}
			</section>

			<section className="flex flex-col gap-2">
				<SectionTitle>Jira statuses to smelp states</SectionTitle>
				{plan.statuses.map((status) => (
					<div key={status.name} className="flex items-center gap-3">
						<div className="flex min-w-0 flex-1 flex-col">
							<span className="text-sm [overflow-wrap:anywhere]">
								{status.name || "(no status)"}
							</span>
							<span className="text-xs text-muted-foreground">
								{status.count} item(s)
								{status.category && `, Jira category ${status.category}`}
							</span>
						</div>
						<Select
							items={TARGET_ITEMS}
							value={statuses[status.name] ?? status.target}
							onValueChange={(target) =>
								target &&
								setStatuses({
									...statuses,
									[status.name]: target as StateTarget,
								})
							}
						>
							<SelectTrigger
								aria-label={`State for ${status.name}`}
								className="w-32 shrink-0"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TARGET_ITEMS.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				))}
				<p className="text-xs text-muted-foreground">
					The original Jira status stays in each item's description.
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<SectionTitle>Jira users to people in this workspace</SectionTitle>
				{plan.users.length === 0 && (
					<p className="text-xs text-muted-foreground">
						No assignees or commenters in this file.
					</p>
				)}
				{plan.users.map((user) => {
					const items = [
						{ label: "Not matched (unassigned)", value: NO_USER },
						...plan.candidates.map((c) => ({
							label: `${c.displayName} (${c.email})`,
							value: c.id,
						})),
					];
					return (
						<div key={user.key} className="flex items-center gap-3">
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="text-sm [overflow-wrap:anywhere]">
									{user.name}
								</span>
								<span className="text-xs text-muted-foreground">
									{user.assigned} assigned, {user.comments} comments
								</span>
							</div>
							<Select
								items={items}
								value={users[user.key] ?? NO_USER}
								onValueChange={(value) =>
									value &&
									setUsers({
										...users,
										[user.key]: value === NO_USER ? null : value,
									})
								}
							>
								<SelectTrigger
									aria-label={`Person for ${user.name}`}
									className="w-56 shrink-0"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{items.map((item) => (
										<SelectItem key={item.value} value={item.value}>
											{item.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					);
				})}
				<p className="text-xs text-muted-foreground">
					Unmatched people's items are left unassigned, and their comments are
					kept with their Jira name in the text. People you match become members
					of the projects they appear in.
				</p>
			</section>

			<div className="flex flex-col gap-2 border-t pt-4">
				{isStale && (
					<p className="text-xs text-muted-foreground">
						You changed something. Check again to see the updated result before
						importing.
					</p>
				)}
				<div className="flex flex-wrap gap-2">
					<Button variant="outline" disabled={isWorking} onClick={check}>
						{isWorking && <Spinner />}
						Check again
					</Button>
					<AlertDialog pendingAnnouncement="Importing">
						<AlertDialogTrigger
							render={
								<Button
									disabled={
										isWorking ||
										isStale ||
										plan.errors.length > 0 ||
										included.length === 0
									}
								/>
							}
						>
							Import {plan.totals.workItems} work items
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Import into this workspace?</AlertDialogTitle>
								<AlertDialogDescription>
									This creates {plan.totals.projects} project(s) with{" "}
									{plan.totals.workItems} work items, {plan.totals.comments}{" "}
									comments and {plan.totals.relations} relations. It's all or
									nothing. To undo it, delete the projects.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction action={runImport}>Import</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div>
		</div>
	);
}
