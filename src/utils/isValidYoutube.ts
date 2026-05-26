export function isYouTubeUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.replace("www.", "");

        return (
            hostname === "youtube.com" ||
            hostname === "youtu.be"
        );
    } catch {
        return false;
    }
}