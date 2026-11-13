import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip";

// Every component in its states on one page, for design work. Admin only.
export const Route = createFileRoute("/ceo/ui")({
	component: Gallery,
});

const VARIANTS = [
	"default",
	"outline",
	"secondary",
	"ghost",
	"destructive",
	"link",
] as const;
const SIZES = ["sm", "default", "lg"] as const;
const STATES = [
	{ label: "Backlog", value: "backlog" },
	{ label: "Todo", value: "todo" },
	{ label: "In Progress", value: "progress" },
	{ label: "Done", value: "done" },
];
const COLORS = [
	"background",
	"foreground",
	"muted",
	"muted-foreground",
	"border",
	"input",
	"primary",
	"primary-foreground",
	"accent",
	"destructive",
	"sidebar",
	"ring",
];

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-3 border-t pt-4">
			<h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
			{children}
		</section>
	);
}

function Gallery() {
	const [state, setState] = useState<string | null>("todo");
	return (
		<div className="flex flex-col gap-8">
			<h1 className="text-lg font-semibold">Components</h1>

			<Section title="Type">
				<div className="flex flex-col gap-1">
					<p className="text-xl font-semibold">Work item title, text-xl</p>
					<p className="text-lg font-semibold">Page title, text-lg</p>
					<p className="text-sm font-medium">Section heading, text-sm</p>
					<p className="text-sm">Body, text-sm</p>
					<p className="text-xs text-muted-foreground">
						Metadata, text-xs muted
					</p>
				</div>
			</Section>

			<Section title="Colors">
				<div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
					{COLORS.map((name) => (
						<div key={name} className="flex flex-col gap-1">
							<div
								className="h-10 rounded-md border"
								style={{ background: `var(--${name})` }}
							/>
							<span className="text-xs text-muted-foreground">{name}</span>
						</div>
					))}
				</div>
			</Section>

			<Section title="Buttons">
				{SIZES.map((size) => (
					<div key={size} className="flex flex-wrap items-center gap-2">
						{VARIANTS.map((variant) => (
							<Button key={variant} variant={variant} size={size}>
								{variant}
							</Button>
						))}
						<Button size={size} disabled>
							disabled
						</Button>
					</div>
				))}
			</Section>

			<Section title="Fields">
				<div className="grid gap-4 sm:grid-cols-2">
					<Field>
						<FieldLabel>Title</FieldLabel>
						<Input placeholder="What needs doing?" />
					</Field>
					<Field invalid>
						<FieldLabel>With an error</FieldLabel>
						<Input defaultValue="x" />
						<FieldError errors={[{ message: "Use at least 2 characters." }]} />
					</Field>
					<Field>
						<FieldLabel>State</FieldLabel>
						<Select items={STATES} value={state} onValueChange={setState}>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{STATES.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel>Disabled</FieldLabel>
						<Input disabled defaultValue="Can't change this" />
					</Field>
					<Field className="sm:col-span-2">
						<FieldLabel>Description</FieldLabel>
						<Textarea placeholder="Add a description" />
					</Field>
					<label className="flex items-center gap-2 text-sm">
						<Switch defaultChecked /> Email me about new notifications
					</label>
				</div>
			</Section>

			<Section title="Popups">
				<div className="flex flex-wrap items-center gap-2">
					<Dialog>
						<DialogTrigger render={<Button variant="outline" />}>
							Dialog
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>New work item</DialogTitle>
								<DialogDescription>In Website</DialogDescription>
							</DialogHeader>
							<Input placeholder="Title" />
							<DialogFooter>
								<Button>Create work item</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
					<AlertDialog>
						<AlertDialogTrigger render={<Button variant="destructive" />}>
							Alert dialog
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Delete this work item?</AlertDialogTitle>
								<AlertDialogDescription>
									This action cannot be undone.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction variant="destructive">
									Delete
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
					<DropdownMenu>
						<DropdownMenuTrigger render={<Button variant="outline" />}>
							Menu
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuGroup>
								<DropdownMenuLabel>ada</DropdownMenuLabel>
								<DropdownMenuItem>Account</DropdownMenuItem>
								<DropdownMenuItem>Settings</DropdownMenuItem>
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
							<DropdownMenuItem>Sign out</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<Popover>
						<PopoverTrigger render={<Button variant="outline" />}>
							Popover
						</PopoverTrigger>
						<PopoverContent>
							<p className="text-sm">Pick an icon or a color.</p>
						</PopoverContent>
					</Popover>
					<Tooltip>
						<TooltipTrigger render={<Button variant="ghost" />}>
							Tooltip
						</TooltipTrigger>
						<TooltipContent>Copy link</TooltipContent>
					</Tooltip>
					<Button
						variant="outline"
						onClick={() =>
							toast({ type: "success", description: "Work item created." })
						}
					>
						Toast
					</Button>
				</div>
			</Section>

			<Section title="Surfaces">
				<div className="grid gap-4 sm:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle>Card</CardTitle>
							<CardDescription>A grouped block of settings.</CardDescription>
						</CardHeader>
						<CardContent className="text-sm">Content goes here.</CardContent>
					</Card>
					<div className="flex flex-col gap-2">
						<Alert>
							<AlertTitle>This project is archived</AlertTitle>
							<AlertDescription>It is read-only.</AlertDescription>
						</Alert>
						<Alert variant="destructive">
							<AlertTitle>Something went wrong</AlertTitle>
						</Alert>
					</div>
				</div>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Key</TableHead>
							<TableHead>Title</TableHead>
							<TableHead>State</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						<TableRow>
							<TableCell>WEB-1</TableCell>
							<TableCell>Launch landing page</TableCell>
							<TableCell>Todo</TableCell>
						</TableRow>
						<TableRow>
							<TableCell>WEB-2</TableCell>
							<TableCell>Fix login redirect</TableCell>
							<TableCell>Done</TableCell>
						</TableRow>
					</TableBody>
				</Table>
				<div className="flex items-center gap-3">
					<Avatar size="sm">
						<AvatarFallback>A</AvatarFallback>
					</Avatar>
					<Avatar>
						<AvatarFallback>M</AvatarFallback>
					</Avatar>
					<Avatar size="lg">
						<AvatarFallback>G</AvatarFallback>
					</Avatar>
					<Spinner />
					<Skeleton className="h-4 w-40" />
				</div>
			</Section>
		</div>
	);
}
