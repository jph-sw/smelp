export const attachmentUrl = (id: string) => `/api/attachments/${id}`;

// The page's CSP only loads images from its own origin, so only these can show.
export const isAttachmentUrl = (url: string) =>
	/^\/api\/attachments\/[\w-]+$/.test(url);
