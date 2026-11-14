import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  HttpError,
  requireValue,
  text,
  publicUser,
  uid,
  iso,
} from "./domain.js";

const deriveKey = promisify(scrypt);
const PASSWORD_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const tokenHash = (value) => createHash("sha256").update(value).digest("hex");

export function normalizeEmail(value) {
  requireValue(
    typeof value === "string" && value.length <= 254,
    "Enter a valid email address.",
  );
  const email = value.trim().toLowerCase();
  requireValue(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    "Enter a valid email address.",
  );
  return email;
}

export function validatePassword(value) {
  requireValue(
    typeof value === "string" && value.length >= 12 && value.length <= 128,
    "Use a password between 12 and 128 characters.",
  );
  return value;
}

export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt, 64, PASSWORD_OPTIONS);
  return `scrypt$32768$8$1$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password, encoded) {
  if (
    typeof password !== "string" ||
    password.length > 128 ||
    typeof encoded !== "string"
  )
    return false;
  const parts = encoded.split("$");
  if (
    parts.length !== 6 ||
    parts[0] !== "scrypt" ||
    parts[1] !== "32768" ||
    parts[2] !== "8" ||
    parts[3] !== "1" ||
    !/^[a-f0-9]{32}$/.test(parts[4]) ||
    !/^[a-f0-9]{128}$/.test(parts[5])
  )
    return false;
  const actual = await deriveKey(password, parts[4], 64, PASSWORD_OPTIONS);
  return timingSafeEqual(actual, Buffer.from(parts[5], "hex"));
}

function accountByEmail(store, email) {
  return store
    .all("users")
    .find((user) => user.email?.trim().toLowerCase() === email);
}

export async function createLocalAccount(
  store,
  { name, email, password, role = "learner" },
) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = text(name, "Name", 100).replace(/\s+/g, " ");
  requireValue(
    ["learner", "instructor", "admin"].includes(role),
    "Invalid account role.",
  );
  requireValue(
    !accountByEmail(store, normalizedEmail),
    "An account with that email already exists.",
    409,
  );
  const passwordHash = await hashPassword(password);
  // Recheck after asynchronous hashing so concurrent registration cannot create duplicate accounts.
  return store.transaction(() => {
    requireValue(
      !accountByEmail(store, normalizedEmail),
      "An account with that email already exists.",
      409,
    );
    return store.put("users", {
      id: uid(),
      name: normalizedName,
      email: normalizedEmail,
      role,
      passwordHash,
      createdAt: iso(),
      passwordChangedAt: iso(),
    });
  });
}

export async function resetAccountPassword(store, user, newPassword) {
  requireValue(
    user?.passwordHash,
    "This is a demo account. Demo accounts do not have passwords.",
    400,
  );
  const passwordHash = await hashPassword(newPassword);
  return store.transaction(() => {
    const current = store.get("users", user.id);
    requireValue(current, "Account not found.", 404);
    requireValue(
      current.passwordHash === user.passwordHash,
      "Your credentials changed. Sign in again before changing your password.",
      409,
    );
    const updated = store.put("users", {
      ...current,
      passwordHash,
      passwordChangedAt: iso(),
    });
    for (const session of store
      .all("sessions")
      .filter((item) => item.userId === user.id))
      store.remove("sessions", session.id);
    return updated;
  });
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure || process.env.LMS_COOKIE_SECURE === "true",
    path: "/",
  };
}

function issueSession(store, req, res, user) {
  const token = randomBytes(32).toString("hex");
  if (req.session) store.remove("sessions", req.session.id);
  const now = Date.now();
  for (const expired of store
    .all("sessions")
    .filter((session) => session.expiresAt <= now))
    store.remove("sessions", expired.id);
  store.put("sessions", {
    id: tokenHash(token),
    userId: user.id,
    expiresAt: now + SESSION_TTL,
  });
  res.cookie("meridian_session", token, {
    ...cookieOptions(req),
    maxAge: SESSION_TTL,
  });
}

// The default uses the socket address, never caller-controlled forwarding headers.
// A hosting adapter may provide a verified client identity from its trusted edge.
function createLimiter(limit, windowMs, clientAddress) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, bucket] of buckets)
      if (bucket.until <= now) buckets.delete(key);
    const verified = clientAddress?.(req);
    const key =
      typeof verified === "string" &&
      verified.length > 0 &&
      verified.length <= 128
        ? verified
        : req.socket?.remoteAddress || "local";
    const bucket = buckets.get(key) || { count: 0, until: now + windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > limit) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil((bucket.until - now) / 1000)),
      );
      return next(
        new HttpError(
          429,
          "Too many attempts. Please try again in a few minutes.",
        ),
      );
    }
    next();
  };
}

export function installAccountRoutes(
  app,
  { store, demo, auth, bootstrap = false, setupToken, clientAddress },
) {
  const loginLimit = createLimiter(15, 10 * 60 * 1000, clientAddress);
  const registrationLimit = createLimiter(10, 15 * 60 * 1000, clientAddress);
  const passwordLimit = createLimiter(10, 15 * 60 * 1000, clientAddress);
  const demoLimit = createLimiter(30, 10 * 60 * 1000, clientAddress);
  const setupLimit = createLimiter(5, 15 * 60 * 1000, clientAddress);
  const setupFinished = () =>
    Boolean(store.get("system", "admin-setup-complete")) ||
    store.all("users").some((user) => user.role === "admin");
  const setupRequired = () => bootstrap && !setupFinished();
  // A hosting platform can update secret bindings while reusing the app.
  // Resolve the current key for each request instead of caching its initial
  // value (or digest) when the workspace starts.
  const currentSetupConfiguration = () => {
    const value = typeof setupToken === "function" ? setupToken() : setupToken;
    const valid =
      typeof value === "string" && value.length >= 32 && value.length <= 512;
    return {
      key: valid ? value : null,
      issue: valid
        ? null
        : value == null || value === ""
          ? "missing_key"
          : "invalid_key",
    };
  };
  let dummyHash;
  const getDummyHash = () =>
    (dummyHash ||= hashPassword(randomBytes(24).toString("hex")));

  app.use("/api/auth", (req, res, next) => {
    if (
      ["/login", "/register", "/password", "/demo", "/setup"].includes(
        req.path,
      ) &&
      !["GET", "HEAD"].includes(req.method)
    ) {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
        return next(
          new HttpError(400, "Send account details as a JSON object."),
        );
    }
    next();
  });

  app.get("/api/auth/config", (req, res) => {
    const required = setupRequired();
    const configuration = required ? currentSetupConfiguration() : null;
    res.json({
      demoEnabled: demo,
      registrationEnabled: !required,
      ...(bootstrap
        ? {
            setupRequired: required,
            setupEnabled: required && Boolean(configuration.key),
            ...(configuration?.issue
              ? { setupIssue: configuration.issue }
              : {}),
          }
        : {}),
    });
  });

  app.post("/api/auth/setup", setupLimit, async (req, res) => {
    requireValue(bootstrap, "Administrator setup is unavailable.", 404);
    requireValue(
      !setupFinished(),
      "Administrator setup is already complete.",
      409,
    );
    const { key: configuredKey } = currentSetupConfiguration();
    requireValue(configuredKey, "Administrator setup is not configured.", 503);
    requireValue(
      typeof req.body.setupToken === "string" &&
        req.body.setupToken.length <= 512,
      "Invalid setup key.",
      403,
    );
    const suppliedHash = createHash("sha256")
      .update(req.body.setupToken)
      .digest();
    const expectedSetupHash = createHash("sha256")
      .update(configuredKey)
      .digest();
    requireValue(
      timingSafeEqual(suppliedHash, expectedSetupHash),
      "Invalid setup key.",
      403,
    );
    const email = normalizeEmail(req.body.email);
    const name = text(req.body.name, "Name", 100).replace(/\s+/g, " ");
    const passwordHash = await hashPassword(req.body.password);
    const user = store.transaction(() => {
      // Hashing yields; recheck inside the transaction so only one owner can win.
      requireValue(
        !setupFinished(),
        "Administrator setup is already complete.",
        409,
      );
      requireValue(
        !accountByEmail(store, email),
        "An account with that email already exists.",
        409,
      );
      const created = store.put("users", {
        id: uid(),
        name,
        email,
        role: "admin",
        passwordHash,
        createdAt: iso(),
        passwordChangedAt: iso(),
      });
      store.put("system", {
        id: "admin-setup-complete",
        adminId: created.id,
        createdAt: iso(),
      });
      return created;
    });
    issueSession(store, req, res, user);
    res.status(201).json({ user: publicUser(user) });
  });

  app.post("/api/auth/register", registrationLimit, async (req, res) => {
    requireValue(
      !setupRequired(),
      "An administrator must finish workspace setup before learner registration.",
      403,
    );
    requireValue(
      !req.body.role || req.body.role === "learner",
      "New accounts can only register as learners.",
    );
    const user = await createLocalAccount(store, {
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      role: "learner",
    });
    issueSession(store, req, res, user);
    res.status(201).json({ user: publicUser(user) });
  });

  app.post("/api/auth/login", loginLimit, async (req, res) => {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase().slice(0, 254)
        : "";
    const password =
      typeof req.body.password === "string" ? req.body.password : "";
    const user = accountByEmail(store, email);
    const credential = user?.passwordHash || (await getDummyHash());
    const verified = await verifyPassword(password, credential);
    requireValue(
      user?.passwordHash && verified,
      "Invalid email or password.",
      401,
    );
    const latest = store.get("users", user.id);
    requireValue(
      latest?.passwordHash === credential,
      "Invalid email or password.",
      401,
    );
    issueSession(store, req, res, latest);
    res.json({ user: publicUser(latest) });
  });

  app.post("/api/auth/logout", (req, res) => {
    if (req.session) store.remove("sessions", req.session.id);
    res.clearCookie("meridian_session", cookieOptions(req));
    res.json({ ok: true });
  });

  app.post("/api/auth/demo", demoLimit, (req, res) => {
    requireValue(demo, "Demo sign-in is disabled on this server.", 403);
    requireValue(
      ["admin", "instructor", "learner"].includes(req.body.role),
      "Choose admin, instructor, or learner.",
    );
    const user = store.get("users", req.body.role);
    requireValue(
      user && !user.passwordHash && user.role === req.body.role,
      "Demo account is unavailable.",
      503,
    );
    issueSession(store, req, res, user);
    res.json({ user: publicUser(user) });
  });

  app.patch("/api/auth/password", auth, passwordLimit, async (req, res) => {
    requireValue(
      req.user.passwordHash,
      "Demo accounts do not have passwords. Create an account to manage your password.",
    );
    requireValue(
      await verifyPassword(req.body.currentPassword, req.user.passwordHash),
      "Your current password is incorrect.",
      401,
    );
    const user = await resetAccountPassword(
      store,
      req.user,
      req.body.newPassword,
    );
    issueSession(store, req, res, user);
    res.json({ user: publicUser(user) });
  });
}
