export function isYouTubeUrl(url: string): boolean {
    if (!url.startsWith("http")) return false;

    try {
        const parsed = new URL(url);
        console.log(parsed);
        
        const hostname = parsed.hostname.replace("www.", "");

        return (
            hostname === "youtube.com" ||
            hostname === "youtu.be"
        );
    } catch {
        return false;
    }
}