export class TicketyMsgpackrDecoder {
  constructor(source) {
    this.data = source instanceof Uint8Array ? source : new Uint8Array(source);
    this.view = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
    this.pos = 0;
    this.structures = new Map();
    this.bundled = null;
    this.bundlePos0 = 0;
    this.bundlePos1 = 0;
    this.bundlePost = null;
  }

  unpack() {
    const value = this.read();
    if (this.bundled && this.bundlePost != null) {
      this.pos = this.bundlePost;
      this.bundled = null;
    }
    if (this.pos !== this.data.length) {
      const next = Buffer.from(this.data.subarray(this.pos, Math.min(this.pos + 16, this.data.length))).toString('hex');
      throw new Error(`Trailing MessagePack data at ${this.pos}/${this.data.length}; next=${next}`);
    }
    return value;
  }

  u8() {
    if (this.pos >= this.data.length) throw new Error('Unexpected end of MessagePack data');
    return this.data[this.pos++];
  }

  bytes(length) {
    const end = this.pos + length;
    if (end > this.data.length) throw new Error('Unexpected end of MessagePack data');
    const value = this.data.subarray(this.pos, end);
    this.pos = end;
    return value;
  }

  string(length) {
    return new TextDecoder().decode(this.bytes(length));
  }

  uint16() { const value = this.view.getUint16(this.pos); this.pos += 2; return value; }
  int16() { const value = this.view.getInt16(this.pos); this.pos += 2; return value; }
  uint32() { const value = this.view.getUint32(this.pos); this.pos += 4; return value; }
  int32() { const value = this.view.getInt32(this.pos); this.pos += 4; return value; }
  float32() { const value = this.view.getFloat32(this.pos); this.pos += 4; return value; }
  float64() { const value = this.view.getFloat64(this.pos); this.pos += 8; return value; }

  read() {
    if (this.pos >= this.data.length) throw new Error('Unexpected end of MessagePack data');

    // Tickety's current transcript payload uses msgpackr extension type 7 as a
    // one-byte wrapper around the following value. This shape was verified
    // against a real Tickety transcript HAR before the bulk path was enabled.
    if (this.data[this.pos] === 0xd4 && this.pos + 2 < this.data.length && this.data[this.pos + 1] === 0x07) {
      this.pos += 3;
      return this.read();
    }

    const token = this.u8();

    if (token < 0xa0) {
      if (token < 0x80) {
        if (token < 0x40) return token;
        const structureId = token & 0x3f;
        const structure = this.structures.get(structureId);
        if (!structure) return token;
        if (structure.highByte === 0) {
          const highByte = this.u8();
          if (highByte === 0) return this.readRecordValues(structure.keys);
          const id = structureId < 32 ? -(structureId + (highByte << 5)) : structureId + (highByte << 5);
          const resolved = this.structures.get(id);
          if (!resolved) throw new Error(`Undefined record id ${id}`);
          return this.readRecordValues(resolved.keys);
        }
        return this.readRecordValues(structure.keys);
      }
      if (token < 0x90) {
        const length = token - 0x80;
        const object = {};
        for (let i = 0; i < length; i += 1) {
          let key = this.read();
          if (key === '__proto__') key = '__proto_';
          object[String(key)] = this.read();
        }
        return object;
      }
      return Array.from({ length: token - 0x90 }, () => this.read());
    }

    if (token < 0xc0) return this.string(token - 0xa0);
    if (token >= 0xe0) return token - 0x100;

    switch (token) {
      case 0xc0: return null;
      case 0xc1: {
        if (this.bundled) {
          const length = Number(this.read());
          if (length > 0) {
            const value = this.bundled[1].slice(this.bundlePos1, this.bundlePos1 + length);
            this.bundlePos1 += length;
            return value;
          }
          const end = this.bundlePos0 - length;
          const value = this.bundled[0].slice(this.bundlePos0, end);
          this.bundlePos0 = end;
          return value;
        }
        return null;
      }
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: return this.binary(this.u8());
      case 0xc5: return this.binary(this.uint16());
      case 0xc6: return this.binary(this.uint32());
      case 0xc7: return this.readExt(this.u8());
      case 0xc8: return this.readExt(this.uint16());
      case 0xc9: return this.readExt(this.uint32());
      case 0xca: return this.float32();
      case 0xcb: return this.float64();
      case 0xcc: return this.u8();
      case 0xcd: return this.uint16();
      case 0xce: return this.uint32();
      case 0xcf: {
        const value = this.view.getBigUint64(this.pos); this.pos += 8;
        return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
      }
      case 0xd0: { const value = this.view.getInt8(this.pos); this.pos += 1; return value; }
      case 0xd1: return this.int16();
      case 0xd2: return this.int32();
      case 0xd3: {
        const value = this.view.getBigInt64(this.pos); this.pos += 8;
        return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
      }
      case 0xd4: {
        const type = this.u8();
        if (type === 0x72) return this.recordDefinition(this.u8() & 0x3f, null);
        return this.handleExt(type, this.bytes(1));
      }
      case 0xd5: {
        const type = this.data[this.pos];
        if (type === 0x72) {
          this.pos += 1;
          const id = this.u8() & 0x3f;
          const highByte = this.u8();
          return this.recordDefinition(id, highByte);
        }
        return this.readExt(2);
      }
      case 0xd6: return this.readExt(4);
      case 0xd7: return this.readExt(8);
      case 0xd8: return this.readExt(16);
      case 0xd9: return this.string(this.u8());
      case 0xda: return this.string(this.uint16());
      case 0xdb: return this.string(this.uint32());
      case 0xdc: return Array.from({ length: this.uint16() }, () => this.read());
      case 0xdd: return Array.from({ length: this.uint32() }, () => this.read());
      case 0xde: return this.readMap(this.uint16());
      case 0xdf: return this.readMap(this.uint32());
      default: throw new Error(`Unknown MessagePack token 0x${token.toString(16)} at ${this.pos - 1}`);
    }
  }

  binary(length) {
    return { $binaryBase64: Buffer.from(this.bytes(length)).toString('base64') };
  }

  readMap(length) {
    const object = {};
    for (let i = 0; i < length; i += 1) {
      let key = this.read();
      if (key === '__proto__') key = '__proto_';
      object[String(key)] = this.read();
    }
    return object;
  }

  readRecordValues(keys) {
    const object = {};
    for (const key of keys) object[key] = this.read();
    return object;
  }

  recordDefinition(id, highByte) {
    const keysValue = this.read();
    if (!Array.isArray(keysValue)) throw new Error('Msgpackr record definition keys are not an array');
    const keys = keysValue.map((key) => String(key));
    let recordId = id;
    const structure = { keys };
    if (highByte != null) {
      recordId = id < 32 ? -((highByte << 5) + id) : ((highByte << 5) + id);
      structure.highByte = highByte;
    }
    this.structures.set(recordId, structure);
    return this.readRecordValues(keys);
  }

  readExt(length) {
    const type = this.u8();
    return this.handleExt(type, this.bytes(length));
  }

  handleExt(type, data) {
    if (type === 0x00) return null;

    if (type === 0x42) {
      if (data.length === 0) return 0;
      let value = BigInt(data[0] & 0x80 ? data[0] - 0x100 : data[0]);
      for (let i = 1; i < data.length; i += 1) value = (value << 8n) + BigInt(data[i]);
      return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
    }

    if (type === 0xff) return this.decodeTimestamp(data);

    if (type === 0x62) {
      if (data.length < 4) return { $extension: type, data: Buffer.from(data).toString('base64') };
      const dataSize = ((data[0] << 24) >>> 0) + (data[1] << 16) + (data[2] << 8) + data[3];
      const dataPosition = this.pos;
      this.pos += dataSize - data.length;
      const string0 = this.readOnlyString();
      const string1 = this.readOnlyString();
      this.bundled = [string0, string1];
      this.bundlePos0 = 0;
      this.bundlePos1 = 0;
      this.bundlePost = this.pos;
      this.pos = dataPosition;
      return this.read();
    }

    if (type === 0x73) return { $set: this.read() };
    if (type === 0x78) return { $regexp: this.read() };
    if (type === 0x74) return { $typedArrayBase64: Buffer.from(data).toString('base64') };

    return { $extension: type, data: Buffer.from(data).toString('base64') };
  }

  decodeTimestamp(data) {
    try {
      let seconds;
      let nanoseconds = 0n;
      if (data.length === 4) {
        seconds = BigInt(new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0));
      } else if (data.length === 8) {
        const value = new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(0);
        nanoseconds = value >> 34n;
        seconds = value & ((1n << 34n) - 1n);
      } else if (data.length === 12) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        nanoseconds = BigInt(view.getUint32(0));
        seconds = view.getBigInt64(4);
      } else {
        return { $timestampBase64: Buffer.from(data).toString('base64') };
      }
      const millis = Number(seconds * 1000n + nanoseconds / 1000000n);
      return new Date(millis).toISOString();
    } catch {
      return { $timestampBase64: Buffer.from(data).toString('base64') };
    }
  }

  readOnlyString() {
    const token = this.u8();
    let length;
    if (token < 0xc0) length = token - 0xa0;
    else if (token === 0xd9) length = this.u8();
    else if (token === 0xda) length = this.uint16();
    else if (token === 0xdb) length = this.uint32();
    else throw new Error(`Expected bundled string, got 0x${token.toString(16)}`);
    return this.string(length);
  }
}

export function decodeTicketyMsgpackr(source) {
  return new TicketyMsgpackrDecoder(source).unpack();
}
