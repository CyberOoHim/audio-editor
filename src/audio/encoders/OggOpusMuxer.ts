/**
 * Fast, lightweight Ogg Opus Muxer.
 * Packages raw Opus frames from WebCodecs into valid, streamable Ogg Opus (.opus / .ogg) containers.
 */

// CRC table for Ogg polynomial 0x04c11db7
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let r = i << 24;
  for (let j = 0; j < 8; j++) {
    if (r & 0x80000000) {
      r = (r << 1) ^ 0x04c11db7;
    } else {
      r <<= 1;
    }
  }
  CRC_TABLE[i] = r >>> 0;
}

function updateOggCrc(crc: number, data: Uint8Array): number {
  for (let i = 0; i < data.length; i++) {
    crc = (crc << 8) ^ CRC_TABLE[((crc >>> 24) & 0xff) ^ data[i]];
  }
  return crc >>> 0;
}

export interface OpusFrame {
  data: Uint8Array;
  sampleCount: number; // usually 960 samples for 20ms at 48kHz
}

/**
 * Creates an Ogg page (OggS)
 */
function makeOggPage(
  headerType: number, // 0x02: BOS, 0x04: EOS, 0x00: normal
  granulePos: bigint,
  serial: number,
  pageSeq: number,
  packets: Uint8Array[]
): Uint8Array {
  // Lacing values
  const segmentTable: number[] = [];
  for (const pkt of packets) {
    let len = pkt.length;
    while (len >= 255) {
      segmentTable.push(255);
      len -= 255;
    }
    segmentTable.push(len);
  }

  const numSegments = segmentTable.length;
  const payloadSize = packets.reduce((s, p) => s + p.length, 0);
  const pageSize = 27 + numSegments + payloadSize;

  const page = new Uint8Array(pageSize);
  const view = new DataView(page.buffer);

  // 1. capture_pattern 'OggS'
  page[0] = 0x4f; // 'O'
  page[1] = 0x67; // 'g'
  page[2] = 0x67; // 'g'
  page[3] = 0x53; // 'S'

  // 2. stream_structure_version = 0
  page[4] = 0;
  // 3. header_type_flag
  page[5] = headerType;
  // 4. absolute granule position (64-bit uint LE)
  view.setBigUint64(6, granulePos, true);
  // 5. stream serial number
  view.setUint32(14, serial, true);
  // 6. page sequence number
  view.setUint32(18, pageSeq, true);
  // 7. page checksum (initially 0)
  view.setUint32(22, 0, true);
  // 8. number of page segments
  page[26] = numSegments;

  // 9. segment table
  for (let i = 0; i < numSegments; i++) {
    page[27 + i] = segmentTable[i];
  }

  // 10. packet data
  let offset = 27 + numSegments;
  for (const pkt of packets) {
    page.set(pkt, offset);
    offset += pkt.length;
  }

  // 11. Calculate and set checksum
  const crc = updateOggCrc(0, page);
  view.setUint32(22, crc, true);

  return page;
}

/**
 * Creates OpusHead identification header packet
 */
function createOpusHead(channels: number, inputSampleRate: number): Uint8Array {
  const head = new Uint8Array(19);
  const view = new DataView(head.buffer);

  // 'OpusHead' (8 bytes)
  const magic = 'OpusHead';
  for (let i = 0; i < 8; i++) head[i] = magic.charCodeAt(i);

  head[8] = 1; // version
  head[9] = channels; // channel count
  view.setUint16(10, 384, true); // pre-skip (384 samples ~8ms)
  view.setUint32(12, inputSampleRate, true); // input sample rate
  view.setInt16(16, 0, true); // output gain (0 dB)
  head[18] = 0; // channel mapping family (0 = mono/stereo)

  return head;
}

/**
 * Creates OpusTags comment header packet
 */
function createOpusTags(): Uint8Array {
  const vendor = 'AudioCraft WebCodecs';
  const vendorBytes = new TextEncoder().encode(vendor);
  const size = 8 + 4 + vendorBytes.length + 4; // magic (8) + vendor_len (4) + vendor + user_comment_list_len (4)
  const tags = new Uint8Array(size);
  const view = new DataView(tags.buffer);

  const magic = 'OpusTags';
  for (let i = 0; i < 8; i++) tags[i] = magic.charCodeAt(i);

  view.setUint32(8, vendorBytes.length, true);
  tags.set(vendorBytes, 12);
  view.setUint32(12 + vendorBytes.length, 0, true); // 0 user comments

  return tags;
}

/**
 * Muxes encoded Opus frames into a valid Ogg Opus container Blob.
 */
export function muxOpusToOgg(
  frames: OpusFrame[],
  channels: number,
  sampleRate = 48000
): Blob {
  const serial = (Math.random() * 0xffffffff) >>> 0;
  const pages: Uint8Array[] = [];
  let pageSeq = 0;

  // Page 0: OpusHead (BOS: 0x02)
  const opusHead = createOpusHead(channels, sampleRate);
  pages.push(makeOggPage(0x02, 0n, serial, pageSeq++, [opusHead]));

  // Page 1: OpusTags
  const opusTags = createOpusTags();
  pages.push(makeOggPage(0x00, 0n, serial, pageSeq++, [opusTags]));

  // Data Pages
  // Pack up to 50 packets per page (~1s of audio) for efficient streaming
  let granulePos = 0n;
  const PACKETS_PER_PAGE = 50;

  for (let i = 0; i < frames.length; i += PACKETS_PER_PAGE) {
    const slice = frames.slice(i, i + PACKETS_PER_PAGE);
    const packets = slice.map((f) => f.data);
    const addedSamples = slice.reduce((sum, f) => sum + f.sampleCount, 0);
    granulePos += BigInt(addedSamples);

    const isLast = i + PACKETS_PER_PAGE >= frames.length;
    const headerType = isLast ? 0x04 : 0x00; // EOS on final page

    pages.push(makeOggPage(headerType, granulePos, serial, pageSeq++, packets));
  }

  return new Blob(pages as unknown as BlobPart[], { type: 'audio/ogg; codecs=opus' });
}
