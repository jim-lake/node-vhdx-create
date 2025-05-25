const { createFile } = require('../dist');

const path = process.argv[2];
const size = BigInt(process.argv[3]);

if (!path || !size) {
  console.log("create-vhdx <path> <size>");
  process.exit(-1);
}
console.log("create", path, "size:", size);
createFile({ path, size }, (err) => {
  if (err) {
    console.error("create failed:", err);
    process.exit(1);
  } else {
    console.log("file created!");
  }
});
