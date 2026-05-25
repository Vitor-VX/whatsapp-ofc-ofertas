export function isYouTubeUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return (
            parsed.hostname.includes("youtube.com") ||
            parsed.hostname.includes("youtu.be")
        );
    } catch {
        return false;
    }
}