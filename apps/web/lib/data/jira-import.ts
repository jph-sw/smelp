import { orpc } from "../orpc";

type Preview = Parameters<typeof orpc.jiraImport.preview>[0];

export type JiraImportMapping = NonNullable<Preview["mapping"]>;
export type JiraDryRun = Awaited<ReturnType<typeof orpc.jiraImport.preview>>;
export type JiraImportResult = Awaited<
	ReturnType<typeof orpc.jiraImport.apply>
>;
export type StateTarget = NonNullable<
	NonNullable<JiraImportMapping["statuses"]>[string]
>;

export const previewJiraImport = (input: Preview) =>
	orpc.jiraImport.preview(input);

export const applyJiraImport = (
	input: Omit<Preview, "mapping"> & { mapping: JiraImportMapping },
) => orpc.jiraImport.apply(input);
