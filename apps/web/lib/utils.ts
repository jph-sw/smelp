import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export class ApiError extends Error {
	constructor(
		public status: number,
		public body: unknown,
	) {
		super(`API error ${status}`);
	}
}
