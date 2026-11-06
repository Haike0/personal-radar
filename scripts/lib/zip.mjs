// Minimal .zip reader (no dependencies): enough to pull the chat .txt / .json out of an export archive,
// e.g. WhatsApp's "WhatsApp Chat - Alex.zip" with "_chat.txt" inside. Supports stored and deflated entries.
import zlib from "node:zlib";

export const isZip = (buf) => buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;

/** List entries: [{ name, size, read(): Buffer }] */
export function readZip(buf) {
  // find the end-of-central-directory record (last 64 KB)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("zip 文件损坏（找不到目录）");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip 文件损坏（目录项不对）");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    out.push({
      name, size,
      read() {
        const ln = buf.readUInt16LE(local + 26), le = buf.readUInt16LE(local + 28);
        const data = buf.subarray(local + 30 + ln + le, local + 30 + ln + le + csize);
        if (method === 0) return Buffer.from(data);
        if (method === 8) return zlib.inflateRawSync(data);
        throw new Error(`zip 里的 ${name} 用了不支持的压缩方式（${method}）`);
      },
    });
  }
  return out;
}
