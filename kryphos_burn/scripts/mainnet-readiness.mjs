import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const EXPECTED =
  "AiAyabtePcmbsA8VSsq4JCvR2qdotL4szqbNggHYvjwS";

const RECEIVER =
  new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

const SOL_FEED =
  "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

const USDC_FEED =
  "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a";

const RPC =
  process.env.SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const programKeypair =
  path.join(ROOT, "target/deploy/kryphos_burn-keypair.json");

const programSo =
  path.join(ROOT, "target/deploy/kryphos_burn.so");

const idlFile =
  path.join(ROOT, "target/idl/kryphos_burn.json");

const deployerFile =
  path.join(ROOT, ".secrets/deployer.json");

const lockFile =
  path.join(ROOT, "Cargo.lock");

const required = [
  lockFile,
  programKeypair,
  programSo,
  idlFile,
  deployerFile,
];

let failed = false;

function ok(name, value = "OK") {
  console.log(`✓ ${name}: ${value}`);
}

function fail(name, value) {
  failed = true;
  console.log(`✗ ${name}: ${value}`);
}

function lockedVersion(lockText, name, version) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(
    `name = "${escaped}"\\nversion = "${version.replace(/\./g, "\\.")}"`,
    "m"
  );
  return block.test(lockText);
}

console.log("KRYPHOS MAINNET READINESS");
console.log("=========================");
console.log("READ ONLY — no transaction is sent.");
console.log("");

for (const f of required) {
  if (!fs.existsSync(f)) fail("Missing file", path.relative(ROOT, f));
}

if (failed) process.exit(1);

const programId = execFileSync(
  "solana-keygen",
  ["pubkey", programKeypair],
  { encoding: "utf8" }
).trim();

programId === EXPECTED
  ? ok("Program ID", programId)
  : fail("Program ID", `${programId} != ${EXPECTED}`);

const source = fs.readFileSync(
  path.join(ROOT, "programs/kryphos_burn/src/lib.rs"),
  "utf8"
);

source.includes(`declare_id!("${EXPECTED}")`)
  ? ok("declare_id")
  : fail("declare_id", "mismatch");

const anchorToml =
  fs.readFileSync(path.join(ROOT, "Anchor.toml"), "utf8");

const anchorMatches =
  anchorToml.split(`kryphos_burn = "${EXPECTED}"`).length - 1;

anchorMatches >= 2
  ? ok("Anchor IDs", "devnet + mainnet")
  : fail("Anchor IDs", "mismatch");

const idl = JSON.parse(fs.readFileSync(idlFile, "utf8"));

if (idl.address) {
  idl.address === EXPECTED
    ? ok("IDL address", idl.address)
    : fail("IDL address", `${idl.address} != ${EXPECTED}`);
}

const instructionNames = new Set((idl.instructions || []).map(x => x.name));
for (const name of ["initialize_vault", "bind_canonical_pool", "burn_next"]) {
  instructionNames.has(name)
    ? ok(`IDL instruction ${name}`)
    : fail(`IDL instruction ${name}`, "missing");
}

const withdrawLike = [...instructionNames].filter(
  n => /withdraw|unlock|release|recover/i.test(n)
);

withdrawLike.length === 0
  ? ok("IDL withdraw path", "NONE")
  : fail("IDL withdraw path", withdrawLike.join(", "));

const lockText = fs.readFileSync(lockFile, "utf8");
for (const [name, version] of [
  ["base64ct", "1.6.0"],
  ["zeroize", "1.8.1"],
  ["zeroize_derive", "1.4.3"],
  ["proc-macro-crate", "3.1.0"],
  ["indexmap", "2.11.4"],
]) {
  lockedVersion(lockText, name, version)
    ? ok(`Cargo ${name}`, version)
    : fail(`Cargo ${name}`, `expected ${version}`);
}

const so = fs.readFileSync(programSo);
const digest =
  crypto.createHash("sha256").update(so).digest("hex");

ok("SBF size", `${so.length.toLocaleString()} bytes`);
ok("SBF SHA256", digest);

const deployerBytes =
  JSON.parse(fs.readFileSync(deployerFile, "utf8"));

const deployer =
  Keypair.fromSecretKey(Uint8Array.from(deployerBytes));

ok("Deploy wallet", deployer.publicKey.toBase58());

try {
  execFileSync("git", ["check-ignore", "-q", ".secrets/deployer.json"], {
    cwd: ROOT,
    stdio: "ignore"
  });
  ok("Deployer key gitignore");
} catch {
  fail("Deployer key gitignore", ".secrets/deployer.json is not ignored");
}

const connection = new Connection(RPC, "confirmed");

const balance =
  await connection.getBalance(deployer.publicKey, "confirmed");

ok("Deploy balance", `${balance / 1e9} SOL`);

const programAccount =
  await connection.getAccountInfo(new PublicKey(EXPECTED), "confirmed");

if (programAccount) {
  ok("Mainnet program", "already deployed");
} else {
  ok("Mainnet program", "NOT DEPLOYED — expected before funding");
}

const wallet = new anchor.Wallet(deployer);
const receiver = new PythSolanaReceiver({ connection, wallet });

for (const [name, feed] of [
  ["Pyth SOL/USD", SOL_FEED],
  ["Pyth USDC/USD", USDC_FEED],
]) {
  const address =
    receiver.getPriceFeedAccountAddress(0, feed);

  const info =
    await connection.getAccountInfo(address, "confirmed");

  if (!info) {
    fail(name, `missing ${address.toBase58()}`);
    continue;
  }

  if (!info.owner.equals(RECEIVER)) {
    fail(
      name,
      `unexpected owner ${info.owner.toBase58()}`
    );
    continue;
  }

  ok(name, address.toBase58());
}

console.log("");
console.log("=========================");

if (failed) {
  console.log("RESULT: NOT READY");
  process.exit(1);
}

console.log("RESULT: CODE READY");
console.log("PAYMENT / DEPLOY STILL PENDING");
