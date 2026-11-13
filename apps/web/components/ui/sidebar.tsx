import { SidebarLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Drawer,
	DrawerBackdrop,
	DrawerContent,
	DrawerTitle,
} from "@ui-sdk/react/drawer";
import * as React from "react";

import { Button } from "#/components/ui/button";
import { useIsMobile } from "#/hooks/use-mobile";
import { cn } from "#/lib/utils";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContextProps = {
	open: boolean;
	setOpen: (open: boolean) => void;
	openMobile: boolean;
	setOpenMobile: (open: boolean) => void;
	isMobile: boolean;
	toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
	const context = React.useContext(SidebarContext);
	if (!context) {
		throw new Error("useSidebar must be used within a SidebarProvider.");
	}
	return context;
}

function SidebarProvider({
	defaultOpen = true,
	className,
	children,
	...props
}: React.ComponentProps<"div"> & { defaultOpen?: boolean }) {
	const isMobile = useIsMobile();
	const [openMobile, setOpenMobile] = React.useState(false);
	const [open, setOpenState] = React.useState(defaultOpen);

	const setOpen = React.useCallback((value: boolean) => {
		setOpenState(value);
		// biome-ignore lint/suspicious/noDocumentCookie: remembers the sidebar between visits
		document.cookie = `${SIDEBAR_COOKIE_NAME}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
	}, []);

	const toggleSidebar = React.useCallback(() => {
		if (isMobile) setOpenMobile((value) => !value);
		else setOpen(!open);
	}, [isMobile, open, setOpen]);

	React.useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
				(event.metaKey || event.ctrlKey)
			) {
				event.preventDefault();
				toggleSidebar();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [toggleSidebar]);

	const value = React.useMemo(
		() => ({
			open,
			setOpen,
			openMobile,
			setOpenMobile,
			isMobile,
			toggleSidebar,
		}),
		[open, setOpen, openMobile, isMobile, toggleSidebar],
	);

	return (
		<SidebarContext.Provider value={value}>
			<div className={cn("flex min-h-svh w-full", className)} {...props}>
				{children}
			</div>
		</SidebarContext.Provider>
	);
}

function Sidebar({
	className,
	children,
	variant: _variant,
	...props
}: React.ComponentProps<"div"> & { variant?: string }) {
	const { isMobile, open, openMobile, setOpenMobile } = useSidebar();

	if (isMobile) {
		return (
			<Drawer side="left" open={openMobile} onOpenChange={setOpenMobile}>
				<DrawerBackdrop />
				<DrawerContent className="flex h-full w-72 flex-col bg-sidebar pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-sidebar-foreground">
					<DrawerTitle className="sr-only">Sidebar</DrawerTitle>
					{children}
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<div
			data-state={open ? "expanded" : "collapsed"}
			className={cn(
				"hidden w-64 shrink-0 flex-col text-sidebar-foreground data-[state=collapsed]:hidden md:flex",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

function SidebarTrigger({
	onClick,
	...props
}: React.ComponentProps<typeof Button>) {
	const { toggleSidebar } = useSidebar();
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label="Toggle sidebar"
			onClick={(event, details) => {
				onClick?.(event, details);
				toggleSidebar();
			}}
			{...props}
		>
			<HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={2} />
		</Button>
	);
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
	return (
		<main
			className={cn("relative flex w-full flex-1 flex-col", className)}
			{...props}
		/>
	);
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("flex min-h-0 flex-1 flex-col overflow-auto", className)}
			{...props}
		/>
	);
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"relative flex w-full min-w-0 flex-col px-2 py-1",
				className,
			)}
			{...props}
		/>
	);
}

function SidebarGroupLabel({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex h-8 shrink-0 items-center px-2 text-xs text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function SidebarGroupContent({
	className,
	...props
}: React.ComponentProps<"div">) {
	return <div className={cn("w-full text-sm", className)} {...props} />;
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
	return (
		<ul
			className={cn("flex w-full min-w-0 flex-col gap-px", className)}
			{...props}
		/>
	);
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
	return (
		<li className={cn("group/menu-item relative", className)} {...props} />
	);
}

// `render` swaps the <button> for another element, like a router Link.
function SidebarMenuButton({
	className,
	isActive = false,
	render,
	...props
}: React.ComponentProps<"button"> & {
	isActive?: boolean;
	render?: React.ReactElement<Record<string, unknown>>;
}) {
	const merged = {
		"data-active": isActive || undefined,
		className: cn(
			"flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-sidebar-accent data-active:bg-sidebar-accent data-active:font-medium [&>svg]:size-4 [&>svg]:shrink-0 [&>span:last-child]:truncate group-has-[[data-sidebar=menu-action]]/menu-item:pr-8",
			className,
		),
		...props,
	};
	if (render) {
		return React.cloneElement(render, {
			...merged,
			className: cn(merged.className, render.props.className as string),
		});
	}
	return <button type="button" {...merged} />;
}

function SidebarMenuAction({
	className,
	showOnHover = false,
	...props
}: React.ComponentProps<"button"> & { showOnHover?: boolean }) {
	return (
		<button
			type="button"
			data-sidebar="menu-action"
			className={cn(
				"absolute top-1 right-1 flex size-6 items-center justify-center rounded-md hover:bg-sidebar-accent [&>svg]:size-4",
				showOnHover &&
					"group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 aria-expanded:opacity-100 md:pointer-fine:opacity-0",
				className,
			)}
			{...props}
		/>
	);
}

function SidebarMenuBadge({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"pointer-events-none absolute top-1.5 right-1 flex h-5 min-w-5 items-center justify-center px-1 text-xs font-medium tabular-nums",
				className,
			)}
			{...props}
		/>
	);
}

export {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarInset,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
	useSidebar,
};
