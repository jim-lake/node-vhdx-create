'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.createFile = createFile;
exports.createBuffer = createBuffer;
const node_fs_1 = __importDefault(require('node:fs'));
const node_crypto_1 = __importDefault(require('node:crypto'));
const crc32c_1 = require('./crc32c');
exports.default = {
  createFile,
  createBuffer,
};
const CREATOR = 'vhdx-create';
const RANDOM_BYTES = 16 * 5;
const RAND_DISK_ID = 0;
const RAND_FILE_WRITE_GUID = 16;
const RAND_DATA_WRITE_GUID = 32;
var VhdxGuid;
(function (VhdxGuid) {
  VhdxGuid['SIZE'] = '2FA54224-CD1B-4876-B211-5DBED83BF4B8';
  VhdxGuid['DISK_ID'] = 'BECA12AB-B2E6-4523-93EF-C309E000C746';
  VhdxGuid['FILE_PARAMS'] = 'CAA16737-FA36-4D43-B3B6-33F0AA44E76B';
  VhdxGuid['LOGICAL_SECTOR'] = '8141BF1D-A96F-4709-BA47-F233A8FAAB5F';
  VhdxGuid['PHYSICAL_SECTOR'] = 'CDA348C7-445D-4471-9CC9-E9885251C556';
  VhdxGuid['BAT_REGION'] = '2DC27766-F623-4200-9D64-115E9BFD4A08';
  VhdxGuid['METADATA_REGION'] = '8B7CA206-4790-4B9A-B8FE-575F050F886E';
})(VhdxGuid || (VhdxGuid = {}));
const METADATA_LIST = [
  {
    guid: VhdxGuid.FILE_PARAMS,
    is_required: true,
    data: Buffer.from('0000000200000000', 'hex'),
  },
  { guid: VhdxGuid.SIZE, is_virtual_disk: true, is_required: true },
  {
    guid: VhdxGuid.LOGICAL_SECTOR,
    is_virtual_disk: true,
    is_required: true,
    data: Buffer.from('00020000', 'hex'),
  },
  {
    guid: VhdxGuid.PHYSICAL_SECTOR,
    is_virtual_disk: true,
    is_required: true,
    data: Buffer.from('00100000', 'hex'),
  },
  { guid: VhdxGuid.DISK_ID, is_virtual_disk: true, is_required: true },
];
const BAT_REGION_ENTRY = {
  index: 0,
  guid: VhdxGuid.BAT_REGION,
  file_offset: 2 * 1024 * 1024,
  length: 1024 * 1024,
};
const METADATA_REGION_ENTRY = {
  index: 1,
  guid: VhdxGuid.METADATA_REGION,
  file_offset: 3 * 1024 * 1024,
  length: 1024 * 1024,
};
function createFile(params, done) {
  createBuffer(params, (err, buffer) => {
    if (err) {
      done(err);
    } else {
      node_fs_1.default.writeFile(params.path, buffer, done);
    }
  });
}
function createBuffer(params, done) {
  const metadata_map = new Map();
  const creator = params.creator ?? CREATOR;
  const buffer = Buffer.alloc(4 * 1024 * 1024);
  node_crypto_1.default.randomBytes(RANDOM_BYTES, (err, random) => {
    const size_buf = Buffer.alloc(8);
    size_buf.writeBigInt64LE(params.size);
    metadata_map.set(VhdxGuid.SIZE, size_buf);
    if (params.disk_id_guid) {
      metadata_map.set(VhdxGuid.DISK_ID, _guidToBuffer(params.disk_id_guid));
    } else {
      metadata_map.set(
        VhdxGuid.DISK_ID,
        random.subarray(RAND_DISK_ID, RAND_DISK_ID + 16)
      );
    }
    buffer.write('vhdxfile', 0, 8);
    buffer.write(creator, 8, creator.length * 2, 'utf16le');
    const head1 = _subarray(buffer, 64 * 1024, 4 * 1024);
    const head2 = _subarray(buffer, 128 * 1024, 4 * 1024);
    _writeHeader(head1, 1n, random);
    _writeHeader(head2, 2n, random);
    const region1 = _subarray(buffer, 192 * 1024, 64 * 1024);
    const region2 = _subarray(buffer, 256 * 1024, 64 * 1024);
    _writeRegionTable(region1);
    _writeRegionTable(region2);
    const metadata = _subarray(
      buffer,
      METADATA_REGION_ENTRY.file_offset,
      METADATA_REGION_ENTRY.length
    );
    _writeMetadata(metadata, metadata_map);
    done(null, buffer);
  });
}
function _writeHeader(buffer, sequence_number, random) {
  buffer.write('head', 0, 4);
  _zero(buffer, 4, 4);
  buffer.writeBigInt64LE(sequence_number, 8);
  _writeRandomGuid(buffer, 16, random, RAND_FILE_WRITE_GUID);
  _writeRandomGuid(buffer, 32, random, RAND_DATA_WRITE_GUID);
  _zero(buffer, 48, 16);
  buffer.writeUint16LE(0, 64);
  buffer.writeUint16LE(1, 66);
  buffer.writeUint32LE(1024 * 1024, 68);
  buffer.writeBigInt64LE(0x100000n, 72);
  _zero(buffer, 80, 4016);
  _writeChecksum(buffer, 4);
}
function _writeRegionTable(buffer) {
  buffer.write('regi', 0, 4);
  _zero(buffer, 4, 4);
  buffer.writeUint32LE(2, 8);
  _zero(buffer, 12);
  _writeRegionTableEntry(buffer, BAT_REGION_ENTRY);
  _writeRegionTableEntry(buffer, METADATA_REGION_ENTRY);
  _writeChecksum(buffer, 4);
}
function _writeRegionTableEntry(buffer, entry) {
  const start = 16 + entry.index * 32;
  _writeGuid(buffer, entry.guid, start);
  buffer.writeBigInt64LE(BigInt(entry.file_offset), start + 16);
  buffer.writeUint32LE(entry.length, start + 24);
  buffer.writeUint32LE(0, start + 30);
}
function _writeMetadata(buffer, map) {
  buffer.write('metadata', 0, 8);
  _zero(buffer, 8, 2);
  buffer.writeUint32LE(METADATA_LIST.length, 10);
  _zero(buffer, 14);
  let offset = 0x10000;
  METADATA_LIST.forEach((metadata, i) => {
    const data = map.get(metadata.guid) ?? null;
    offset = _writeMetadataEntry(buffer, metadata, i, offset, data);
  });
}
function _writeMetadataEntry(buffer, metadata, index, offset, data) {
  if (!data) {
    data = metadata.data;
  }
  const start = 32 + index * 32;
  _writeGuid(buffer, metadata.guid, start);
  buffer.writeUint32LE(offset, start + 16);
  buffer.writeUint32LE(data.length, start + 20);
  let bits = 0;
  if (metadata.is_user) {
    bits |= 0x1;
  }
  if (metadata.is_virtual_disk) {
    bits |= 0x2;
  }
  if (metadata.is_required) {
    bits |= 0x4;
  }
  buffer.writeUint8(bits, start + 24);
  data.copy(buffer, offset);
  return offset + (data?.length ?? 0);
}
function _subarray(buffer, offset, size) {
  return buffer.subarray(offset, offset + size);
}
function _guidToBuffer(guid) {
  return Buffer.from(guid.replaceAll('-', ''), 'hex');
}
function _writeGuid(buffer, guid, offset) {
  const guid_buf = _guidToBuffer(guid);
  guid_buf.copy(buffer, offset + 3, 0, 1);
  guid_buf.copy(buffer, offset + 2, 1, 2);
  guid_buf.copy(buffer, offset + 1, 2, 3);
  guid_buf.copy(buffer, offset + 0, 3, 4);
  guid_buf.copy(buffer, offset + 5, 4, 5);
  guid_buf.copy(buffer, offset + 4, 5, 6);
  guid_buf.copy(buffer, offset + 7, 6, 7);
  guid_buf.copy(buffer, offset + 6, 7, 8);
  guid_buf.copy(buffer, offset + 8, 8, 16);
}
function _writeRandomGuid(buffer, offset, random, random_offset) {
  random.copy(buffer, offset, random_offset, random_offset + 16);
}
function _zero(buffer, start, length) {
  if (length) {
    buffer.fill(0, start, start + length);
  } else {
    buffer.fill(0, start);
  }
  return start + (length ?? 0);
}
function _writeChecksum(buffer, offset) {
  const crc = (0, crc32c_1.crc32c)(buffer);
  buffer.writeUint32LE(crc, offset);
}
//# sourceMappingURL=index.js.map
