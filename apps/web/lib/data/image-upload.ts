// Its message is written for the user, unlike other errors.
export class ImageFileError extends Error {}

const AVATAR_SIZE = 256;
const MAX_BACKGROUND_WIDTH = 1920;
const MAX_BACKGROUND_HEIGHT = 1080;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const UNREADABLE = "That file couldn't be read as an image.";

async function decode(file: File) {
	if (file.size > MAX_FILE_BYTES) {
		throw new ImageFileError("That image is too large. Use one under 20 MB.");
	}
	try {
		return await createImageBitmap(file);
	} catch {
		throw new ImageFileError(UNREADABLE);
	}
}

function canvasOf(width: number, height: number) {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) throw new ImageFileError(UNREADABLE);
	return { canvas, context };
}

const encode = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
	new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

async function asBase64(blob: Blob | null) {
	if (!blob) throw new ImageFileError(UNREADABLE);
	const bytes = new Uint8Array(await blob.arrayBuffer());
	return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

// Both re-encode the image, which also drops metadata like the location a phone
// camera stores in a photo.

// Crops to a centered square.
export async function avatarAsBase64(file: File) {
	const bitmap = await decode(file);
	const side = Math.min(bitmap.width, bitmap.height);
	const { canvas, context } = canvasOf(AVATAR_SIZE, AVATAR_SIZE);
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
	return asBase64(await encode(canvas, "image/webp", 0.85));
}

// Shrinks to fit a full HD screen, keeping the whole image.
export async function backgroundAsBase64(file: File) {
	const bitmap = await decode(file);
	const scale = Math.min(
		1,
		MAX_BACKGROUND_WIDTH / bitmap.width,
		MAX_BACKGROUND_HEIGHT / bitmap.height,
	);
	const { canvas, context } = canvasOf(
		Math.max(1, Math.round(bitmap.width * scale)),
		Math.max(1, Math.round(bitmap.height * scale)),
	);
	context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();

	const webp = await encode(canvas, "image/webp", 0.8);
	// Browsers that can't encode WebP return a PNG, which for a photo can pass the
	// limit, so JPEG is used instead.
	if (webp?.type === "image/webp") return asBase64(webp);
	return asBase64(await encode(canvas, "image/jpeg", 0.85));
}
