export type ImageInfo = {
  height: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
};

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpegStartOfFrameMarkers = new Set([
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf
]);

export function inspectImage(buffer: Buffer): ImageInfo | null {
  const detected = inspectPng(buffer) ?? inspectJpeg(buffer) ?? inspectWebp(buffer);

  if (!detected || detected.width <= 0 || detected.height <= 0) {
    return null;
  }

  return detected;
}

function inspectPng(buffer: Buffer): ImageInfo | null {
  if (
    buffer.length < 24 ||
    !buffer.subarray(0, pngSignature.length).equals(pngSignature) ||
    buffer.readUInt32BE(8) !== 13 ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    return null;
  }

  return {
    height: buffer.readUInt32BE(20),
    mimeType: "image/png",
    width: buffer.readUInt32BE(16)
  };
}

function inspectJpeg(buffer: Buffer): ImageInfo | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }

    if (offset >= buffer.length) {
      return null;
    }

    const marker = buffer[offset];
    offset += 1;

    if (marker === undefined || marker === 0x00) {
      continue;
    }

    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      continue;
    }

    if (offset + 2 > buffer.length) {
      return null;
    }

    const segmentLength = buffer.readUInt16BE(offset);

    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      return null;
    }

    if (jpegStartOfFrameMarkers.has(marker)) {
      if (segmentLength < 8) {
        return null;
      }

      return {
        height: buffer.readUInt16BE(offset + 3),
        mimeType: "image/jpeg",
        width: buffer.readUInt16BE(offset + 5)
      };
    }

    offset += segmentLength;
  }

  return null;
}

function inspectWebp(buffer: Buffer): ImageInfo | null {
  if (
    buffer.length < 20 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }

  const riffEnd = 8 + buffer.readUInt32LE(4);

  if (riffEnd < 20 || riffEnd > buffer.length) {
    return null;
  }

  let offset = 12;

  while (offset + 8 <= riffEnd) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const chunkEnd = dataOffset + chunkSize;

    if (chunkEnd > riffEnd) {
      return null;
    }

    const dimensions = inspectWebpChunk(buffer, chunkType, dataOffset, chunkSize);

    if (dimensions) {
      return {
        ...dimensions,
        mimeType: "image/webp"
      };
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  return null;
}

function inspectWebpChunk(
  buffer: Buffer,
  chunkType: string,
  dataOffset: number,
  chunkSize: number
): Pick<ImageInfo, "height" | "width"> | null {
  if (chunkType === "VP8 " && chunkSize >= 10) {
    if (
      buffer[dataOffset + 3] !== 0x9d ||
      buffer[dataOffset + 4] !== 0x01 ||
      buffer[dataOffset + 5] !== 0x2a
    ) {
      return null;
    }

    return {
      height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
      width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff
    };
  }

  if (chunkType === "VP8L" && chunkSize >= 5) {
    if (buffer[dataOffset] !== 0x2f) {
      return null;
    }

    const dimensions = buffer.readUInt32LE(dataOffset + 1);
    return {
      height: ((dimensions >>> 14) & 0x3fff) + 1,
      width: (dimensions & 0x3fff) + 1
    };
  }

  if (chunkType === "VP8X" && chunkSize >= 10) {
    return {
      height: readUInt24LE(buffer, dataOffset + 7) + 1,
      width: readUInt24LE(buffer, dataOffset + 4) + 1
    };
  }

  return null;
}

function readUInt24LE(buffer: Buffer, offset: number) {
  return buffer[offset]! | (buffer[offset + 1]! << 8) | (buffer[offset + 2]! << 16);
}
