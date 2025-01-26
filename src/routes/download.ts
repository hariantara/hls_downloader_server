import { Router, Request, Response, NextFunction } from "express";
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import axios from "axios";

const router = Router();

// Function to get a unique file name if the file exists
function getUniqueFileName(directory: string, baseName: string, extension: string): string {
    let counter = 0;
    let fileName = `${baseName}${extension}`;
    let filePath = path.join(directory, fileName);

    // Check if the file exists, and increment the counter until a unique name is found
    while (fs.existsSync(filePath)) {
        counter++;
        fileName = `${baseName}${counter}${extension}`;
        filePath = path.join(directory, fileName);
    }

    return filePath;
}

// Function to calculate total video duration from the .m3u8 file
async function getTotalDuration(m3u8Url: string): Promise<number> {
    try {
        const response = await axios.get(m3u8Url);
        const lines = response.data.split('\n');
        let totalDuration = 0;

        for (const line of lines) {
            if (line.startsWith('#EXTINF:')) {
                const duration = parseFloat(line.replace('#EXTINF:', '').split(',')[0]);
                totalDuration += duration;
            }
        }

        return totalDuration; // Total duration in seconds
    } catch (error) {
        console.error('Error fetching total duration:', error);
        throw new Error('Failed to fetch total duration from .m3u8 file.');
    }
}

// Helper function to convert seconds to hh:mm:ss format
function secondsToHMS(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// POST route to download video
router.post('/download', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { m3u8Url } = req.body;

    if (!m3u8Url || typeof m3u8Url !== 'string') {
        res.status(400).json({ error: 'm3u8Url is required and must be a string.' });
        return;
    }

    try {
        // Get the total duration of the video
        const totalDuration = await getTotalDuration(m3u8Url);

        // Define the output directory and base file name
        const outputDirectory = path.join(__dirname, '../../downloads');
        const baseFileName = 'output';
        const extension = '.mp4';

        // Get a unique file name
        const outputFile = getUniqueFileName(outputDirectory, baseFileName, extension);

        // Create the output directory if it doesn't exist
        exec(`mkdir -p ${path.dirname(outputFile)}`, (err) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to create output directory.' });
            }

            // Construct the ffmpeg command with -progress pipe:2
            // const ffmpegCommand = `ffmpeg -i "${m3u8Url}" -c copy -progress pipe:2 -nostats "${outputFile}"`;
            const ffmpegCommand = `ffmpeg -i "${m3u8Url}" -c copy -http_persistent -http_multiple -buffer_size 4M -progress pipe:2 -nostats "${outputFile}"`;

            // Execute the command
            const ffmpegProcess = exec(ffmpegCommand);

            ffmpegProcess.stderr?.on('data', (data: string) => {
                const progressData = data.toString();

                // Extract the time field from the progress output
                const timeMatch = progressData.match(/out_time_ms=(\d+)/);

                if (timeMatch) {
                    const timeMs = parseInt(timeMatch[1], 10);
                    const timeSeconds = timeMs / 1000000; // Convert microseconds to seconds
                    
                    // Calculate and log the progress
                    const progressPercentage = ((timeSeconds / totalDuration) * 100).toFixed(2);

                    // Convert totalDuration to hh:mm:ss format
                    const totalDurationHMS = secondsToHMS(totalDuration);
                    console.log(
                        `Download progress: ${timeSeconds.toFixed(2)}s / ${totalDuration.toFixed(2)}s (${totalDurationHMS}) (${progressPercentage}%)`
                    );
                }
            });

            // Handle the completion of the ffmpeg process
            ffmpegProcess.on('close', (code) => {
                if (code !== 0) {
                    console.error('Error during video download:', code);
                    return res.status(500).json({ error: 'Failed to download video.' });
                }
                if (fs.existsSync(outputFile)) {
                    // Send a success response
                    console.log('Video downloaded successfully');
                    res.status(200).json({ message: 'Video downloaded successfully. Starting file transfer.' });
                } else {
                    console.error('File not found:', outputFile);
                    res.status(404).json({ error: 'File not found' });
                }
            });

            // Error handling for the process
            ffmpegProcess.on('error', (err) => {
                console.error('Error during ffmpeg execution:', err);
                res.status(500).json({ error: 'Failed to start ffmpeg process.' });
            });
        });
    } catch (error) {
        console.error('Error:', (error as Error).message);
        res.status(500).json({ error: 'Failed to process the request.' });
    }
});

export default router;











