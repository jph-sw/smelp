import rootPackage from "../../../../package.json" with { type: "json" };

// The repo root's version is the release's. Docker copies that file into the image too.
export const version: string = rootPackage.version;
