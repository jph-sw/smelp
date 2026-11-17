export const attachmentUrl = (id: string) => `/api/attachments/${id}`;

// The page's CSP only loads images from its own origin, so only these can show.
export const isAttachmentUrl = (url: string) =>
	/^\/api\/attachments\/[\w-]+$/.test(url);

// Must match the API's INLINE_TYPES: it sends every other type as a download.
const PREVIEWABLE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export const isPreviewableImage = (contentType: string) =>
	PREVIEWABLE_TYPES.has(contentType);
