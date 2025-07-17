import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

const allowedOrigin =
	process.env.NODE_ENV === "production"
		? "https://clippa.in"
		: "http://localhost:3000";

const corsOptions: cors.CorsOptions = {
	origin: allowedOrigin,
	credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
	fs.mkdirSync(uploadsDir);
}

const jobsDir = path.join(__dirname, "../jobs");
if (!fs.existsSync(jobsDir)) {
	fs.mkdirSync(jobsDir);
}

interface Job {
	id: string;
	status: "processing" | "ready" | "error";
	filePath?: string;
	storagePath?: string;
	publicUrl?: string;
	error?: string;
	user_id?: string;
	created_at?: string;
}

// In-memory job store
const jobStore = new Map<string, Job>();

function createJobId() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function timeToSeconds(timeStr: string): number {
	const parts = timeStr.split(":");
	return (
		parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])
	);
}

function secondsToTime(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	return `${hours.toString().padStart(2, "0")}:${minutes
		.toString()
		.padStart(2, "0")}:${secs.toFixed(3).padStart(6, "0")}`;
}

async function adjustSubtitleTimestamps(
	inputPath: string,
	outputPath: string,
	startTime: string
): Promise<void> {
	const startSeconds = timeToSeconds(startTime);
	const content = await fs.promises.readFile(inputPath, "utf-8");

	// Regex to match VTT timestamp lines (e.g., "00:01:30.000 --> 00:01:35.000")
	const timestampRegex =
		/(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/g;

	const adjustedContent = content.replace(
		timestampRegex,
		(match, start, end) => {
			const startSec = timeToSeconds(start) - startSeconds;
			const endSec = timeToSeconds(end) - startSeconds;

			// Skip negative timestamps (before clip start)
			if (startSec < 0) return match; // Keep original, will be filtered out by video duration

			return `${secondsToTime(startSec)} --> ${secondsToTime(endSec)}`;
		}
	);

	await fs.promises.writeFile(outputPath, adjustedContent, "utf-8");
}

app.post("/api/clip", async (req, res) => {
	const { url, startTime, endTime, subtitles, formatId, userId } =
		req.body || {};
	if (!url || !startTime || !endTime) {
		return res
			.status(400)
			.json({ error: "url, startTime, and endTime are required" });
	}

	const id = createJobId();
	const outputPath = path.join(uploadsDir, `clip-${id}.mp4`);

	const initialJobData = {
		id,
		user_id: userId || "anonymous",
		status: "processing" as const,
		created_at: new Date().toISOString(),
	};

	// Store job in memory
	jobStore.set(id, initialJobData);
	console.log(`[job ${id}] created and saved to memory.`);

	(async () => {
		let finalJobStatus: { [key: string]: any } = {};
		let tempCookiesPath: string | null = null;
		try {
			const section = `*${startTime}-${endTime}`;

			const prodCookiesPath = "/etc/secrets/cookies.txt";
			if (fs.existsSync(prodCookiesPath)) {
				const cookiesContent = fs.readFileSync(prodCookiesPath, "utf-8");
				tempCookiesPath = path.join(uploadsDir, `cookies-${id}.txt`);
				fs.writeFileSync(tempCookiesPath, cookiesContent);
			}

			const ytArgs = [url];
			if (formatId) {
				ytArgs.push("-f", formatId);
			} else {
				ytArgs.push(
					"-f",
					"bv[ext=mp4][vcodec^=avc1][height<=?1080][fps<=?60]+ba[ext=m4a]/best[ext=mp4][vcodec^=avc1][height<=?1080]"
				);
			}
			ytArgs.push(
				"--download-sections",
				section,
				"-o",
				outputPath,
				"--merge-output-format",
				"mp4",
				"--no-check-certificates",
				"--no-warnings",
				"--add-header",
				"referer:youtube.com",
				"--add-header",
				"user-agent:Mozilla/5.0",
				"--verbose"
			);
			if (subtitles) {
				ytArgs.push(
					"--write-subs",
					"--write-auto-subs",
					"--sub-lang",
					"en",
					"--sub-format",
					"vtt"
				);
			}
			if (tempCookiesPath) {
				ytArgs.push("--cookies", tempCookiesPath);
			} else {
				const localCookiesPath = path.join(__dirname, "cookies.txt");
				if (fs.existsSync(localCookiesPath)) {
					ytArgs.push("--cookies", localCookiesPath);
				}
			}

			console.log(`[job ${id}] starting yt-dlp`);
			const yt = spawn(path.resolve(__dirname, "../bin/yt-dlp"), ytArgs);
			yt.stderr.on("data", (d) =>
				console.error(`[job ${id}]`, d.toString())
			);

			await new Promise<void>((resolve, reject) => {
				yt.on("close", (code, signal) => {
					if (code === 0) {
						resolve();
					} else if (code === null) {
						reject(
							new Error(
								`yt-dlp process was killed by signal: ${
									signal || "unknown"
								}`
							)
						);
					} else {
						reject(new Error(`yt-dlp exited with code ${code}`));
					}
				});
				yt.on("error", reject);
			});

			const fastPath = path.join(uploadsDir, `clip-${id}-fast.mp4`);
			const subPath = outputPath.replace(/\.mp4$/, ".en.vtt");
			const subtitlesExist = fs.existsSync(subPath);

			// Adjust subtitle timestamps if subtitles exist
			if (subtitles && subtitlesExist) {
				const adjustedSubPath = path.join(
					uploadsDir,
					`clip-${id}-adjusted.vtt`
				);
				await adjustSubtitleTimestamps(subPath, adjustedSubPath, startTime);
				// Replace the original subtitle file with the adjusted one
				await fs.promises.rename(adjustedSubPath, subPath);
			}

			await new Promise<void>((resolve, reject) => {
				const ffmpegArgs = ["-y", "-i", outputPath];

				if (subtitles && subtitlesExist) {
					console.log(`[job ${id}] burning subtitles from ${subPath}`);
					ffmpegArgs.push(
						"-vf",
						`subtitles=${subPath}`,
						"-c:v",
						"libx264",
						"-c:a",
						"aac",
						"-b:a",
						"128k",
						"-preset",
						"ultrafast", // Faster encoding, less CPU
						"-crf",
						"28", // Lower quality but much smaller file
						"-maxrate",
						"2M", // Limit bitrate
						"-bufsize",
						"4M" // Limit buffer size
					);
				} else {
					// No subtitles to burn – copy video but transcode audio to AAC to ensure MP4 compatibility
					ffmpegArgs.push(
						"-c:v",
						"copy", // keep original video
						"-c:a",
						"aac",
						"-b:a",
						"128k"
					);
				}

				// Move the `faststart` flag and output path outside the conditional so it applies to both modes
				ffmpegArgs.push("-movflags", "+faststart", fastPath);

				console.log(`[job ${id}] running ffmpeg`, ffmpegArgs.join(" "));
				const ff = spawn("ffmpeg", ffmpegArgs);

				// Add timeout for ffmpeg process
				const ffmpegTimeout = setTimeout(() => {
					console.log(
						`[job ${id}] ffmpeg timeout reached, killing process`
					);
					ff.kill("SIGKILL");
				}, 300000); // 5 minutes timeout

				ff.stderr.on("data", (d) =>
					console.error(`[job ${id}] ffmpeg`, d.toString())
				);
				ff.on("close", (code, signal) => {
					clearTimeout(ffmpegTimeout);
					if (code === 0) {
						resolve();
					} else if (code === null) {
						reject(
							new Error(
								`ffmpeg process was killed by signal: ${
									signal || "unknown"
								} - likely due to memory limits on Render`
							)
						);
					} else {
						reject(new Error(`ffmpeg exited with code ${code}`));
					}
				});
				ff.on("error", reject);
			});

			await fs.promises.unlink(outputPath).catch(() => {});
			await fs.promises.rename(fastPath, outputPath);

			if (subtitlesExist) {
				await fs.promises.unlink(subPath).catch(() => {});
			}

			// ---- Skip Supabase upload, keep file locally ----
			const objectPath = `clip-${id}.mp4`;
			console.log(`[job ${id}] keeping file locally: ${objectPath}`);

			// Generate local file URL for direct download
			const localUrl = `${
				process.env.PUBLIC_BACKEND_URL || "http://localhost:3001"
			}/api/clip/${id}/file`;

			finalJobStatus = {
				storage_path: objectPath,
				public_url: localUrl,
				status: "ready" as const,
			};

			// Update in-memory store
			const jobData = jobStore.get(id) || initialJobData;
			jobStore.set(id, { ...jobData, ...finalJobStatus });

			console.log(
				`[job ${id}] ready - storagePath: ${finalJobStatus.storage_path}, publicUrl: ${finalJobStatus.public_url}`
			);
		} catch (err: unknown) {
			console.error(`[job ${id}] failed`, err);
			const message = err instanceof Error ? err.message : String(err);
			finalJobStatus = {
				status: "error" as const,
				error: message,
			};

			// Update in-memory store
			const jobData = jobStore.get(id) || initialJobData;
			jobStore.set(id, { ...jobData, ...finalJobStatus });
		} finally {
			if (tempCookiesPath && fs.existsSync(tempCookiesPath)) {
				fs.unlinkSync(tempCookiesPath);
			}
		}
	})();

	return res.status(202).json({ id });
});

app.get("/api/clip/:id", async (req, res) => {
	const { id } = req.params;

	// Check in-memory store
	const memoryJob = jobStore.get(id);
	if (memoryJob) {
		return res.json({
			status: memoryJob.status,
			error: memoryJob.error,
			url: memoryJob.publicUrl,
			storagePath: memoryJob.storagePath,
		});
	}

	console.log(`[job ${id}] not found in memory`);
	return res.status(404).json({ error: "job not found" });
});

// Cleanup endpoint for frontend to delete files after download
app.delete("/api/clip/:id/cleanup", async (req, res) => {
	const { id } = req.params;

	// Remove local file
	const localFilePath = path.join(uploadsDir, `clip-${id}.mp4`);
	try {
		await fs.promises.unlink(localFilePath);
		console.log(`[job ${id}] local file deleted: ${localFilePath}`);
	} catch (fileError) {
		console.warn(`[job ${id}] failed to delete local file:`, fileError);
	}

	// Remove from in-memory store
	jobStore.delete(id);
	console.log(`[job ${id}] removed from in-memory store`);

	return res.json({ success: true });
});

// Stream or download the generated clip directly from the backend
app.get("/api/clip/:id/file", (req, res) => {
	const { id } = req.params;
	const filePath = path.join(uploadsDir, `clip-${id}.mp4`);

	if (!fs.existsSync(filePath)) {
		return res.status(404).json({ error: "file not found" });
	}

	const stat = fs.statSync(filePath);
	const fileSize = stat.size;
	const range = req.headers.range;

	if (range) {
		// Parse the Range header to support partial requests
		const parts = range.replace(/bytes=/, "").split("-");
		const start = parseInt(parts[0], 10);
		const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
		const chunkSize = end - start + 1;

		res.writeHead(206, {
			"Content-Range": `bytes ${start}-${end}/${fileSize}`,
			"Accept-Ranges": "bytes",
			"Content-Length": chunkSize,
			"Content-Type": "video/mp4",
			"Content-Disposition": 'attachment; filename="clip.mp4"',
		});

		const stream = fs.createReadStream(filePath, { start, end });
		stream.pipe(res);
	} else {
		res.writeHead(200, {
			"Content-Length": fileSize,
			"Content-Type": "video/mp4",
			"Content-Disposition": 'attachment; filename="clip.mp4"',
		});
		fs.createReadStream(filePath).pipe(res);
	}
});

app.get("/api/formats", async (req, res) => {
	const { url } = req.query;
	if (!url || typeof url !== "string") {
		return res.status(400).json({ error: "url is required" });
	}

	let tempCookiesPath: string | null = null;
	try {
		const ytDlpPath = path.resolve(__dirname, "../bin/yt-dlp");

		const prodCookiesPath = "/etc/secrets/cookies.txt";
		if (fs.existsSync(prodCookiesPath)) {
			const cookiesContent = fs.readFileSync(prodCookiesPath, "utf-8");
			const jobId = createJobId();
			tempCookiesPath = path.join(uploadsDir, `cookies-${jobId}.txt`);
			fs.writeFileSync(tempCookiesPath, cookiesContent);
		}

		const ytArgs = [
			"-j",
			"--no-warnings",
			"--no-check-certificates",
			"--add-header",
			"referer:youtube.com",
			"--add-header",
			"user-agent:Mozilla/5.0",
			url as string,
		];

		if (tempCookiesPath) {
			ytArgs.push("--cookies", tempCookiesPath);
		} else {
			const localCookiesPath = path.join(__dirname, "cookies.txt");
			if (fs.existsSync(localCookiesPath)) {
				ytArgs.push("--cookies", localCookiesPath);
			}
		}

		console.log(`[formats] fetching formats for URL: ${url}`);
		const yt = spawn(ytDlpPath, ytArgs);

		// Add timeout for yt-dlp process
		const timeout = setTimeout(() => {
			console.log(`[formats] timeout reached, killing yt-dlp process`);
			yt.kill("SIGKILL");
		}, 30000); // 30 second timeout

		let jsonData = "";
		yt.stdout.on("data", (data) => {
			jsonData += data.toString();
		});

		let errorData = "";
		yt.stderr.on("data", (data) => {
			errorData += data.toString();
		});

		yt.on("close", (code, signal) => {
			clearTimeout(timeout);
			if (tempCookiesPath && fs.existsSync(tempCookiesPath)) {
				fs.unlinkSync(tempCookiesPath);
			}
			if (signal === "SIGKILL") {
				console.error(
					`[formats] yt-dlp process timed out after 30 seconds`
				);
				return res.status(500).json({
					error: "Request timed out - video may be too long or unavailable",
				});
			}
			if (code !== 0) {
				console.error(
					`[formats] yt-dlp exited with code ${code}`,
					errorData
				);
				return res
					.status(500)
					.json({ error: `yt-dlp exited with code ${code}` });
			}

			try {
				const info = JSON.parse(jsonData);

				const MAX_PIXELS = 1920 * 1080;

				const videoFormats = info.formats
					.filter(
						(f: any) =>
							f.vcodec !== "none" &&
							f.height &&
							f.width &&
							f.width * f.height <= MAX_PIXELS &&
							(f.ext === "mp4" || f.ext === "webm")
					)
					.map((f: any) => ({
						format_id: f.format_id,
						label: `${f.height}p${f.fps > 30 ? f.fps : ""}`,
						height: f.height,
						hasAudio: f.acodec !== "none",
						ext: f.ext,
					}))
					.sort((a: any, b: any) => b.height - a.height);

				// Remove duplicates based on height and keep the best format for each resolution
				const uniqueFormats = videoFormats.reduce(
					(acc: any[], current: any) => {
						const existing = acc.find(
							(item) => item.label === current.label
						);
						if (!existing) {
							acc.push(current);
						} else if (current.hasAudio && !existing.hasAudio) {
							// Prefer formats with audio if available
							const index = acc.findIndex(
								(item) => item.label === current.label
							);
							acc[index] = current;
						}
						return acc;
					},
					[]
				);

				// If we need to use video-only formats, we'll use format selection that combines with best audio
				const formatsForUser = uniqueFormats.map((f: any) => ({
					format_id: f.hasAudio ? f.format_id : `${f.format_id}+bestaudio`,
					label: f.label,
				}));

				return res.json({ formats: formatsForUser });
			} catch (e) {
				console.error("[formats] JSON parse error", e);
				return res
					.status(500)
					.json({ error: "Failed to parse yt-dlp output" });
			}
		});

		yt.on("error", (err) => {
			clearTimeout(timeout);
			if (tempCookiesPath && fs.existsSync(tempCookiesPath)) {
				fs.unlinkSync(tempCookiesPath);
			}
			console.error("[formats] yt-dlp spawn error", err);
			return res
				.status(500)
				.json({ error: "Failed to start yt-dlp process" });
		});
	} catch (err: unknown) {
		if (tempCookiesPath && fs.existsSync(tempCookiesPath)) {
			fs.unlinkSync(tempCookiesPath);
		}
		console.error(`[formats] failed`, err);
		const message = err instanceof Error ? err.message : String(err);
		return res.status(500).json({ error: message });
	}
});

app.get("/api/ping", (_req, res) => {
	return res.json({ success: true });
});

app.get("/", (req, res) => res.send("Server is alive!"));


// Clean up old job files on startup
function cleanupOldJobs() {
	console.log("Cleaning up old jobs from memory...");
	const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
	
	for (const [id, job] of jobStore.entries()) {
		if (job.created_at && new Date(job.created_at).getTime() < twentyFourHoursAgo) {
			jobStore.delete(id);
			console.log(`[job ${id}] cleaned up from memory`);
		}
	}
}

app.listen(port, () => {
	console.log(`Server is running on port ${port}`);
	console.log(`Environment: ${process.env.NODE_ENV}`);
	console.log(`CORS origin: ${allowedOrigin}`);
	console.log(`Database: disabled (using in-memory storage)`);
	cleanupOldJobs();
});
