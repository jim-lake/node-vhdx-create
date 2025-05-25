declare const _default: {
  createFile: typeof createFile;
  createBuffer: typeof createBuffer;
};
export default _default;
export type CreateParams = {
  size: bigint;
  creator?: string;
  disk_id_guid?: string;
};
export type CreateFileParams = CreateParams & {
  path: string;
};
export declare function createFile(
  params: CreateFileParams,
  done: (err?: Error) => void
): void;
export declare function createBuffer(
  params: CreateParams,
  done: (err?: Error, buffer?: Buffer) => void
): void;
