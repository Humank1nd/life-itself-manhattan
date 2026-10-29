#!/usr/bin/env node
// Assemble the adapter's clean RGB MP4 from verified frame PNGs and probe
// the result against the plan. Pure encoding (ffmpeg), no model, no
// weights. Usage:
//   node scripts/assemble-matrix-video.mjs <frames-dir> <plan.json> <out.mp4>
// The frames dir holds pose-{00,01,02}-rgb.png; SHAs must match the plan.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const [framesDir, planPath, outPath] = process.argv.slice(2);
if (!framesDir || !planPath || !outPath) {
  console.error('usage: node scripts/assemble-matrix-video.mjs <frames-dir> <plan.json> <out.mp4>');
  process.exit(2);
}
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
if (plan.schemaVersion !== 'life-itself-matrix-plan/1.0.0') throw new Error('plan schema mismatch');
const files = plan.video.inputFrameFiles;
const perFrameSec = plan.video.repeatsPerFrame / plan.video.fps;
const work = mkdtempSync(join(tmpdir(), 'matrix-frames-'));
const lines = [];
for (const f of files) {
  const p = resolve(framesDir, f);
  if (!existsSync(p)) throw new Error('missing input frame: ' + f);
  const sha = createHash('sha256').update(readFileSync(p)).digest('hex');
  if (sha !== plan.basedOn.frameShas[files.indexOf(f)]) throw new Error('input frame hash drift: ' + f);
  lines.push(`file '${p}'`, `duration ${perFrameSec}`);
}
lines.push(`file '${resolve(framesDir, files[files.length - 1])}'`);
const listPath = join(work, 'concat.txt');
writeFileSync(listPath, lines.join('\n') + '\n');
// Bilinear upscale + center crop to the released 864x480 contract.
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'concat', '-safe', '0', '-i', listPath,
  '-vf', `scale=${plan.video.width}:${plan.video.height}:force_original_aspect_ratio=increase,crop=${plan.video.width}:${plan.video.height},setsar=1`,
  '-r', String(plan.video.fps), '-frames:v', String(plan.video.outputFrames),
  '-c:v', plan.video.codec, '-pix_fmt', plan.video.pixFmt,
  '-crf', String(plan.video.crf), '-preset', plan.video.preset, '-an', outPath]);
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames',
  '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_read_frames,codec_name,pix_fmt',
  '-of', 'json', outPath]).toString());
const s = probe.streams[0];
const want = { width: plan.video.width, height: plan.video.height, frames: plan.video.outputFrames };
if (s.width !== want.width || s.height !== want.height || Number(s.nb_read_frames) !== want.frames)
  throw new Error(`assembled video mismatch: got ${s.width}x${s.height}x${s.nb_read_frames}, want ${want.width}x${want.height}x${want.frames}`);
if (s.codec_name !== 'h264' || s.pix_fmt !== plan.video.pixFmt) throw new Error('codec/pixfmt drift');
console.log(`matrix video: ${outPath} ${s.width}x${s.height} ${s.nb_read_frames}f ${s.codec_name}/${s.pix_fmt} sha=${createHash('sha256').update(readFileSync(outPath)).digest('hex').slice(0, 12)}…`);
