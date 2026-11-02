import type { IconSvgElement } from "@hugeicons/react";
import { useEffect, useState } from "react";

type IconCollection = Record<string, IconSvgElement>;

let collection: IconCollection | null = null;
let loading: Promise<IconCollection> | null = null;

// The full set is about 6 MB, so it loads on its own, only once a page needs an icon
// chosen by name. Components that know their icon import it directly instead.
function loadIconCollection() {
	// The query makes this a separate copy of the package's index. Without it, the
	// icons imported by name elsewhere would pull the whole set into the first load.
	loading ??= import("@hugeicons/core-free-icons?all")
		.then((icons) => {
			collection = icons as unknown as IconCollection;
			return collection;
		})
		.catch((error) => {
			// Lets the next component try again.
			loading = null;
			throw error;
		});
	return loading;
}

export function useIconCollection() {
	const [icons, setIcons] = useState(collection);

	useEffect(() => {
		if (icons) return;
		let isCurrent = true;
		loadIconCollection()
			.then((loaded) => {
				if (isCurrent) setIcons(loaded);
			})
			.catch((error) => console.error(error));
		return () => {
			isCurrent = false;
		};
	}, [icons]);

	return icons;
}
