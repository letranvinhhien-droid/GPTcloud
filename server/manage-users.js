#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { createStore } from "./store.js";
import {
  createLocalAccount,
  normalizeEmail,
  resetAccountPassword,
} from "./auth.js";

const usage = `Usage:
  node server/manage-users.js create-admin --name "Administrator name" --email admin@example.com [--password-stdin]
  node server/manage-users.js create-instructor --name "Instructor name" --email instructor@example.com [--password-stdin]
  node server/manage-users.js reset-password --email account@example.com [--password-stdin]

Passwords are read from a hidden terminal prompt, or from standard input when --password-stdin is supplied.
The database defaults to .data/lms.sqlite. LMS_DB can select another database.
No messages or password-reset emails are sent.`;

async function readPassword(fromStdin) {
  if (fromStdin) {
    let password = "";
    for await (const chunk of process.stdin) {
      password += chunk.toString();
      if (password.length > 1024)
        throw new Error("Password input is too long.");
    }
    return password.replace(/\r?\n$/, "");
  }
  if (!process.stdin.isTTY)
    throw new Error("Use --password-stdin when running without a terminal.");
  process.stderr.write("New password (12–128 characters): ");
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();
  return new Promise((resolvePromise, reject) => {
    let value = "";
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      process.stderr.write("\n");
    };
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\u0003" || char === "\u0004") {
          cleanup();
          reject(new Error("Cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          resolvePromise(value);
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
        if (value.length > 128) {
          cleanup();
          reject(new Error("Password is too long."));
          return;
        }
      }
    };
    stdin.on("data", onData);
  });
}

export async function main(args = process.argv.slice(2)) {
  const [command, ...options] = args;
  if (!command || command === "--help") {
    process.stdout.write(usage + "\n");
    return;
  }
  if (
    !["create-admin", "create-instructor", "reset-password"].includes(command)
  )
    throw new Error(usage);
  const parsed = {};
  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (option === "--password-stdin") parsed.passwordStdin = true;
    else if (
      ["--email", "--name"].includes(option) &&
      options[index + 1] &&
      !options[index + 1].startsWith("--")
    )
      parsed[option.slice(2)] = options[++index];
    else throw new Error("Unknown or incomplete argument.\n" + usage);
  }
  const email = normalizeEmail(parsed.email);
  const creating =
    command === "create-admin" || command === "create-instructor";
  const role = command === "create-admin" ? "admin" : "instructor";
  if (creating && !parsed.name?.trim())
    throw new Error("A staff name is required.");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const store = createStore(
    process.env.LMS_DB || resolve(root, ".data/lms.sqlite"),
  );
  try {
    const existing = store
      .all("users")
      .find((user) => user.email?.toLowerCase() === email);
    if (creating && existing)
      throw new Error("An account with that email already exists.");
    if (command === "reset-password" && !existing)
      throw new Error("Account not found.");
    const password = await readPassword(Boolean(parsed.passwordStdin));
    if (creating)
      await createLocalAccount(store, {
        name: parsed.name,
        email,
        password,
        role,
      });
    else await resetAccountPassword(store, existing, password);
    process.stdout.write(
      creating
        ? role === "admin"
          ? "Administrator account created.\n"
          : "Instructor account created.\n"
        : "Password updated. Existing sessions have been revoked.\n",
    );
  } finally {
    store.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  });
}
