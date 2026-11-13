import {
	MenuContent,
	MenuGroup,
	MenuGroupLabel,
	MenuItem,
	MenuItemIndicator,
	Menu as MenuPrimitive,
	MenuRadioGroup,
	MenuRadioItem,
	MenuSeparator,
	MenuTrigger,
} from "@ui-sdk/react/menu";
import type * as React from "react";

function DropdownMenu(props: React.ComponentProps<typeof MenuPrimitive>) {
	return <MenuPrimitive {...props} />;
}

function DropdownMenuContent(props: React.ComponentProps<typeof MenuContent>) {
	return <MenuContent sideOffset={4} {...props} />;
}

function DropdownMenuRadioItem({
	children,
	...props
}: Omit<React.ComponentProps<typeof MenuRadioItem>, "children"> & {
	children?: React.ReactNode;
}) {
	return (
		<MenuRadioItem {...props}>
			{children}
			<MenuItemIndicator />
		</MenuRadioItem>
	);
}

export {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioItem,
	MenuGroup as DropdownMenuGroup,
	MenuGroupLabel as DropdownMenuLabel,
	MenuItem as DropdownMenuItem,
	MenuRadioGroup as DropdownMenuRadioGroup,
	MenuSeparator as DropdownMenuSeparator,
	MenuTrigger as DropdownMenuTrigger,
};
