import fs from 'fs';
import path from 'path';

/**
 * Configuration for the fake video capture.
 * If the specified video file exists, it returns the arguments to use it.
 * If not, it returns an empty array (or default args), ensuring the bot doesn't crash on other machines.
 */
export function getVideoLaunchArgs(): string[] {
    // We prefer .mjpeg because it is much smaller (compressed) than .y4m (uncompressed raw video).
    // Check for .mjpeg first.
    const mjpegPath = path.resolve(process.cwd(), 'assets', 'orb_loop.mjpeg');
    if (fs.existsSync(mjpegPath)) {
        console.log(`🎥 Found custom video file at: ${mjpegPath}`);
        return [
            `--use-file-for-fake-video-capture=${mjpegPath}`,
            "--use-fake-device-for-media-stream",
        ];
    }

    // Fallback to .y4m if present
    const y4mPath = path.resolve(process.cwd(), 'assets', 'orb_loop.y4m');
    if (fs.existsSync(y4mPath)) {
        console.log(`🎥 Found custom video file at: ${y4mPath}`);
        return [
            `--use-file-for-fake-video-capture=${y4mPath}`,
            "--use-fake-device-for-media-stream",
        ];
    }

    console.warn(`⚠️ Custom video file not found (checked .mjpeg and .y4m in assets/)`);
    console.warn("   Falling back to default fake video (spinning pattern).");

    return ["--use-fake-device-for-media-stream"];
}
