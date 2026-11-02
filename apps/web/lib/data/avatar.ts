// Its message is written for the user, unlike other errors.
export class AvatarFileError extends Error {}

const AVATAR_SIZE = 256;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const UNREADABLE = "That file couldn't be read as an image.";

const encode = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
	new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

// Crops to a centered square and re-encodes, which also drops metadata like the
// location a phone camera stores in a photo.
export async function avatarAsBase64(file: File) {
	if (file.size > MAX_FILE_BYTES) {
		throw new AvatarFileError("That image is too large. Use one under 20 MB.");
	}

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		throw new AvatarFileError(UNREADABLE);
	}

	const side = Math.min(bitmap.width, bitmap.height);
	const canvas = document.createElement("canvas");
	canvas.width = AVATAR_SIZE;
	canvas.height = AVATAR_SIZE;
	const context = canvas.getContext("2d");
	if (!context) throw new AvatarFileError(UNREADABLE);
	context.drawImage(
		bitmap,
		(bitmap.width - side) / 2,
		(bitmap.height - side) / 2,
		side,
		side,
		0,
		0,
		AVATAR_SIZE,
		AVATAR_SIZE,
	);
	bitmap.close();

	// Browsers that can't encode WebP return a PNG, which still fits the limit.
	const blob = await encode(canvas, "image/webp", 0.85);
	if (!blob) throw new AvatarFileError(UNREADABLE);

	const bytes = new Uint8Array(await blob.arrayBuffer());
	return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}
