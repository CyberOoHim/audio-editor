/**
 * Lightweight, fast, standards-compliant ISOBMFF / MP4 Audio (M4A / M4R) Muxer.
 * Encapsulates raw AAC Access Units from WebCodecs into universally playable .m4a / .m4r containers.
 */

export interface AacChunk {
  data: Uint8Array;
  durationFrames?: number;
}

const SAMPLE_RATE_TABLE = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350
];

function getSampleRateIndex(rate: number): number {
  const idx = SAMPLE_RATE_TABLE.indexOf(rate);
  return idx !== -1 ? idx : 4; // default 44100
}

class ByteWriter {
  private buffers: Uint8Array[] = [];
  private current: Uint8Array;
  private offset = 0;
  private view: DataView;

  constructor(chunkSize = 65536) {
    this.current = new Uint8Array(chunkSize);
    this.view = new DataView(this.current.buffer);
  }

  private ensure(bytes: number) {
    if (this.offset + bytes > this.current.length) {
      this.buffers.push(this.current.subarray(0, this.offset));
      this.current = new Uint8Array(Math.max(65536, bytes * 2));
      this.view = new DataView(this.current.buffer);
      this.offset = 0;
    }
  }

  writeUint8(val: number) {
    this.ensure(1);
    this.view.setUint8(this.offset++, val);
  }

  writeUint16(val: number) {
    this.ensure(2);
    this.view.setUint16(this.offset, val, false);
    this.offset += 2;
  }

  writeUint32(val: number) {
    this.ensure(4);
    this.view.setUint32(this.offset, val, false);
    this.offset += 4;
  }

  writeFourCC(str: string) {
    this.ensure(4);
    for (let i = 0; i < 4; i++) {
      this.view.setUint8(this.offset++, str.charCodeAt(i));
    }
  }

  writeBytes(bytes: Uint8Array) {
    let srcOffset = 0;
    while (srcOffset < bytes.length) {
      const available = this.current.length - this.offset;
      if (available <= 0) {
        this.buffers.push(this.current.subarray(0, this.offset));
        this.current = new Uint8Array(Math.max(65536, (bytes.length - srcOffset) * 2));
        this.view = new DataView(this.current.buffer);
        this.offset = 0;
      }
      const toWrite = Math.min(bytes.length - srcOffset, this.current.length - this.offset);
      this.current.set(bytes.subarray(srcOffset, srcOffset + toWrite), this.offset);
      this.offset += toWrite;
      srcOffset += toWrite;
    }
  }

  toUint8Array(): Uint8Array {
    if (this.offset > 0) {
      this.buffers.push(this.current.subarray(0, this.offset));
      this.offset = 0;
    }
    const totalLength = this.buffers.reduce((sum, b) => sum + b.length, 0);
    const result = new Uint8Array(totalLength);
    let cur = 0;
    for (const b of this.buffers) {
      result.set(b, cur);
      cur += b.length;
    }
    return result;
  }
}

/**
 * Creates an ISO MP4 Box wrapper
 */
function makeBox(type: string, payload: Uint8Array): Uint8Array {
  const size = 8 + payload.length;
  const box = new Uint8Array(size);
  const view = new DataView(box.buffer);
  view.setUint32(0, size, false);
  for (let i = 0; i < 4; i++) {
    view.setUint8(4 + i, type.charCodeAt(i));
  }
  box.set(payload, 8);
  return box;
}

/**
 * Concatenates multiple Uint8Arrays
 */
function concatBuffers(buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((sum, b) => sum + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

/**
 * Creates an AudioSpecificConfig (2 bytes for AAC-LC)
 */
export function createAudioSpecificConfig(sampleRate: number, channels: number): Uint8Array {
  const audioObjectType = 2; // AAC LC
  const samplingFreqIndex = getSampleRateIndex(sampleRate);
  const channelConfig = channels;

  const asc = new Uint8Array(2);
  asc[0] = (audioObjectType << 3) | ((samplingFreqIndex >> 1) & 0x07);
  asc[1] = ((samplingFreqIndex & 0x01) << 7) | (channelConfig << 3);
  return asc;
}

/**
 * Builds a valid standalone M4A (MPEG-4 Audio / AAC) file Blob from encoded chunks.
 */
export function muxAacToM4a(
  chunks: AacChunk[],
  sampleRate: number,
  channels: number,
  totalSamples: number,
  brand: 'M4A ' | 'M4R ' = 'M4A '
): Blob {
  // 1. ftyp box
  const ftypPayload = new ByteWriter(32);
  ftypPayload.writeFourCC(brand === 'M4R ' ? 'M4A ' : 'M4A '); // major brand
  ftypPayload.writeUint32(0); // minor version
  ftypPayload.writeFourCC('M4A ');
  ftypPayload.writeFourCC('mp42');
  ftypPayload.writeFourCC('isom');
  const ftypBox = makeBox('ftyp', ftypPayload.toUint8Array());

  // Compute mdat total size
  const mdatDataSize = chunks.reduce((sum, c) => sum + c.data.length, 0);
  const mdatHeaderSize = 8;
  const mdatBoxSize = mdatHeaderSize + mdatDataSize;

  // We need to calculate moov box size to compute correct chunk offsets (stco)
  // Let's create esds descriptor payload
  const asc = createAudioSpecificConfig(sampleRate, channels);
  
  // esds box payload
  const esdsPayload = new ByteWriter(64);
  esdsPayload.writeUint32(0); // version (0) + flags (0)
  // ES_Descriptor tag (0x03)
  esdsPayload.writeUint8(0x03);
  esdsPayload.writeUint8(23 + asc.length); // size
  esdsPayload.writeUint16(0x0001); // ES_ID
  esdsPayload.writeUint8(0x00); // streamPriority
  // DecoderConfigDescriptor tag (0x04)
  esdsPayload.writeUint8(0x04);
  esdsPayload.writeUint8(15 + asc.length); // size
  esdsPayload.writeUint8(0x40); // objectTypeIndication = Audio ISO/IEC 14496-3 (AAC)
  esdsPayload.writeUint8(0x15); // streamType = AudioStream (5 << 2) | 1
  esdsPayload.writeUint8(0x00); // bufferSizeDB (24-bit)
  esdsPayload.writeUint16(0x0000);
  esdsPayload.writeUint32(192000); // maxBitrate
  esdsPayload.writeUint32(128000); // avgBitrate
  // DecoderSpecificInfo tag (0x05)
  esdsPayload.writeUint8(0x05);
  esdsPayload.writeUint8(asc.length); // size
  esdsPayload.writeBytes(asc);
  // SLConfigDescriptor tag (0x06)
  esdsPayload.writeUint8(0x06);
  esdsPayload.writeUint8(0x01); // size
  esdsPayload.writeUint8(0x02); // predefined = 2 (reserved for MP4)

  const esdsBox = makeBox('esds', esdsPayload.toUint8Array());

  // mp4a sample entry box
  const mp4aPayload = new ByteWriter(128);
  mp4aPayload.writeBytes(new Uint8Array(6)); // reserved
  mp4aPayload.writeUint16(1); // data_reference_index = 1
  mp4aPayload.writeUint16(0); // sound version = 0
  mp4aPayload.writeUint16(0); // reserved
  mp4aPayload.writeUint32(0); // reserved
  mp4aPayload.writeUint16(channels); // channelcount
  mp4aPayload.writeUint16(16); // samplesize = 16 bit
  mp4aPayload.writeUint16(0); // pre_defined
  mp4aPayload.writeUint16(0); // reserved
  mp4aPayload.writeUint16(sampleRate); // samplerate (16.16 float high 16 bits)
  mp4aPayload.writeUint16(0); // samplerate low 16 bits
  mp4aPayload.writeBytes(esdsBox);
  const mp4aBox = makeBox('mp4a', mp4aPayload.toUint8Array());

  // stsd box
  const stsdPayload = new ByteWriter(160);
  stsdPayload.writeUint32(0); // version (0) + flags (0)
  stsdPayload.writeUint32(1); // entry_count = 1
  stsdPayload.writeBytes(mp4aBox);
  const stsdBox = makeBox('stsd', stsdPayload.toUint8Array());

  // stts box (time-to-sample)
  const sttsPayload = new ByteWriter(32);
  sttsPayload.writeUint32(0); // version + flags
  sttsPayload.writeUint32(1); // entry_count = 1
  sttsPayload.writeUint32(chunks.length); // sample_count
  sttsPayload.writeUint32(1024); // sample_delta = 1024 frames per AAC chunk
  const sttsBox = makeBox('stts', sttsPayload.toUint8Array());

  // stsc box (sample-to-chunk)
  const stscPayload = new ByteWriter(32);
  stscPayload.writeUint32(0);
  stscPayload.writeUint32(1); // 1 entry
  stscPayload.writeUint32(1); // first_chunk = 1
  stscPayload.writeUint32(1); // samples_per_chunk = 1
  stscPayload.writeUint32(1); // sample_description_index = 1
  const stscBox = makeBox('stsc', stscPayload.toUint8Array());

  // stsz box (sample sizes)
  const stszPayload = new ByteWriter(chunks.length * 4 + 32);
  stszPayload.writeUint32(0);
  stszPayload.writeUint32(0); // sample_size = 0 (variable)
  stszPayload.writeUint32(chunks.length); // sample_count
  for (const chunk of chunks) {
    stszPayload.writeUint32(chunk.data.length);
  }
  const stszBox = makeBox('stsz', stszPayload.toUint8Array());

  // Helper to build moov box with a given stco
  function buildMoov(offsets: number[]): Uint8Array {
    const stcoPayload = new ByteWriter(offsets.length * 4 + 32);
    stcoPayload.writeUint32(0);
    stcoPayload.writeUint32(offsets.length);
    for (const off of offsets) {
      stcoPayload.writeUint32(off);
    }
    const stcoBox = makeBox('stco', stcoPayload.toUint8Array());

    const stblBox = makeBox('stbl', concatBuffers([stsdBox, sttsBox, stscBox, stszBox, stcoBox]));

    // dinf & dref
    const urlBox = makeBox('url ', new Uint8Array([0, 0, 0, 1])); // flag = 1 self-contained
    const drefPayload = new ByteWriter(32);
    drefPayload.writeUint32(0);
    drefPayload.writeUint32(1); // 1 entry
    drefPayload.writeBytes(urlBox);
    const drefBox = makeBox('dref', drefPayload.toUint8Array());
    const dinfBox = makeBox('dinf', drefBox);

    // smhd box
    const smhdBox = makeBox('smhd', new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0])); // 8 bytes version+flags+balance+reserved

    // minf box
    const minfBox = makeBox('minf', concatBuffers([smhdBox, dinfBox, stblBox]));

    // hdlr box
    const hdlrPayload = new ByteWriter(64);
    hdlrPayload.writeUint32(0); // version + flags
    hdlrPayload.writeUint32(0); // pre_defined
    hdlrPayload.writeFourCC('soun'); // handler_type
    hdlrPayload.writeBytes(new Uint8Array(12)); // reserved 3 * 32-bit
    hdlrPayload.writeBytes(new TextEncoder().encode('SoundHandler\0'));
    const hdlrBox = makeBox('hdlr', hdlrPayload.toUint8Array());

    // mdhd box
    const mdhdPayload = new ByteWriter(32);
    mdhdPayload.writeUint32(0); // version + flags
    mdhdPayload.writeUint32(0); // creation_time
    mdhdPayload.writeUint32(0); // modification_time
    mdhdPayload.writeUint32(sampleRate); // timescale
    mdhdPayload.writeUint32(totalSamples); // duration
    mdhdPayload.writeUint16(0x15c7); // language 'und' (undetermined)
    mdhdPayload.writeUint16(0); // pre_defined
    const mdhdBox = makeBox('mdhd', mdhdPayload.toUint8Array());

    // mdia box
    const mdiaBox = makeBox('mdia', concatBuffers([mdhdBox, hdlrBox, minfBox]));

    // tkhd box
    const tkhdPayload = new ByteWriter(128);
    tkhdPayload.writeUint32(0x00000007); // version (0) + flags (0x000007: enabled, in_movie, in_preview)
    tkhdPayload.writeUint32(0); // creation_time
    tkhdPayload.writeUint32(0); // modification_time
    tkhdPayload.writeUint32(1); // track_ID = 1
    tkhdPayload.writeUint32(0); // reserved
    tkhdPayload.writeUint32(Math.round((totalSamples / sampleRate) * 1000)); // duration in movie timescale
    tkhdPayload.writeBytes(new Uint8Array(8)); // reserved
    tkhdPayload.writeUint16(0); // layer
    tkhdPayload.writeUint16(0); // alternate_group
    tkhdPayload.writeUint16(0x0100); // volume = 1.0 (8.8 fixed point)
    tkhdPayload.writeUint16(0); // reserved
    // Unity matrix (36 bytes: 0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000)
    const matrix = new Uint32Array([0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000]);
    // write matrix big endian
    for (let i = 0; i < matrix.length; i++) {
      tkhdPayload.writeUint32(matrix[i]);
    }
    tkhdPayload.writeUint32(0); // width
    tkhdPayload.writeUint32(0); // height
    const tkhdBox = makeBox('tkhd', tkhdPayload.toUint8Array());

    // trak box
    const trakBox = makeBox('trak', concatBuffers([tkhdBox, mdiaBox]));

    // mvhd box
    const mvhdPayload = new ByteWriter(128);
    mvhdPayload.writeUint32(0); // version + flags
    mvhdPayload.writeUint32(0); // creation_time
    mvhdPayload.writeUint32(0); // modification_time
    mvhdPayload.writeUint32(1000); // timescale (1000 units/sec)
    mvhdPayload.writeUint32(Math.round((totalSamples / sampleRate) * 1000)); // duration
    mvhdPayload.writeUint32(0x00010000); // rate = 1.0 (16.16)
    mvhdPayload.writeUint16(0x0100); // volume = 1.0 (8.8)
    mvhdPayload.writeBytes(new Uint8Array(10)); // reserved
    for (let i = 0; i < matrix.length; i++) {
      mvhdPayload.writeUint32(matrix[i]);
    }
    mvhdPayload.writeBytes(new Uint8Array(24)); // pre_defined
    mvhdPayload.writeUint32(2); // next_track_ID = 2
    const mvhdBox = makeBox('mvhd', mvhdPayload.toUint8Array());

    // moov box
    return makeBox('moov', concatBuffers([mvhdBox, trakBox]));
  }

  // First pass: compute exact moov length
  const dummyOffsets = new Array(chunks.length).fill(0);
  const initialMoov = buildMoov(dummyOffsets);
  const moovSize = initialMoov.length;
  const ftypSize = ftypBox.length;

  // Real chunk offsets in the file (after ftyp + moov + mdat header)
  let currentOffset = ftypSize + moovSize + mdatHeaderSize;
  const realOffsets: number[] = [];
  for (const chunk of chunks) {
    realOffsets.push(currentOffset);
    currentOffset += chunk.data.length;
  }

  const finalMoovBox = buildMoov(realOffsets);

  // Build mdat box header
  const mdatHeader = new Uint8Array(8);
  const mdatView = new DataView(mdatHeader.buffer);
  mdatView.setUint32(0, mdatBoxSize, false);
  mdatView.setUint8(4, 'm'.charCodeAt(0));
  mdatView.setUint8(5, 'd'.charCodeAt(0));
  mdatView.setUint8(6, 'a'.charCodeAt(0));
  mdatView.setUint8(7, 't'.charCodeAt(0));

  // Assemble the Blob from chunked parts directly to minimize memory!
  const blobParts: BlobPart[] = [
    ftypBox as unknown as BlobPart,
    finalMoovBox as unknown as BlobPart,
    mdatHeader as unknown as BlobPart
  ];
  for (const chunk of chunks) {
    blobParts.push(chunk.data as unknown as BlobPart);
  }

  const mimeType = brand === 'M4R ' ? 'audio/x-m4r' : 'audio/mp4';
  return new Blob(blobParts, { type: mimeType });
}
