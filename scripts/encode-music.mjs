/**
 * WAV -> MP3 music encoder (pure JS — no ffmpeg/LAME install needed).
 *
 * Usage: node scripts/encode-music.mjs "<input.wav>" "public/sounds/<out>.mp3"
 * Expects 16-bit signed PCM WAV (mono or stereo); encodes 160 kbps MP3.
 * Used to compress the xDeviruchi music pack (assets/music, CC-BY 4.0)
 * down from ~22 MB WAVs to web-shippable beds.
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as lamejs from "@breezystack/lamejs";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node scripts/encode-music.mjs "<in.wav>" "<out.mp3>"');
  process.exit(1);
}

const buf = readFileSync(inPath);
if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
  console.error("not a RIFF/WAVE file");
  process.exit(1);
}

// walk the chunks for fmt + data
let pos = 12;
let fmt = null;
let data = null;
while (pos + 8 <= buf.length) {
  const id = buf.toString("ascii", pos, pos + 4);
  const size = buf.readUInt32LE(pos + 4);
  if (id === "fmt ") fmt = { channels: buf.readUInt16LE(pos + 10), rate: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22) };
  else if (id === "data") data = buf.subarray(pos + 8, pos + 8 + size);
  pos += 8 + size + (size & 1); // chunks are word-aligned
}
if (!fmt || !data) {
  console.error("missing fmt/data chunk");
  process.exit(1);
}
if (fmt.bits !== 16) {
  console.error(`expected 16-bit PCM, got ${fmt.bits}-bit`);
  process.exit(1);
}

const samples = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2));
const frames = Math.floor(samples.length / fmt.channels);
const left = new Int16Array(frames);
const right = fmt.channels === 2 ? new Int16Array(frames) : left;
for (let i = 0; i < frames; i++) {
  left[i] = samples[i * fmt.channels];
  if (fmt.channels === 2) right[i] = samples[i * 2 + 1];
}

const KBPS = 160;
const enc = new lamejs.Mp3Encoder(fmt.channels, fmt.rate, KBPS);
const BLOCK = 1152;
const parts = [];
for (let i = 0; i < frames; i += BLOCK) {
  const l = left.subarray(i, i + BLOCK);
  const r = right.subarray(i, i + BLOCK);
  const out = fmt.channels === 2 ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l);
  if (out.length) parts.push(Buffer.from(out));
}
const tail = enc.flush();
if (tail.length) parts.push(Buffer.from(tail));

writeFileSync(outPath, Buffer.concat(parts));
const mb = (n) => (n / 1048576).toFixed(2);
console.log(`${inPath}\n  -> ${outPath}  (${mb(buf.length)} MB -> ${mb(parts.reduce((s, p) => s + p.length, 0))} MB, ${KBPS} kbps, ${fmt.channels}ch ${fmt.rate} Hz)`);
