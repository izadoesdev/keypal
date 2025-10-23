Perfect. Let's write a clear **PRD (Product Requirements Document)** for your `keypal` package.
This will outline what it is, who it's for, and exactly what features should be built in the **MVP**, what can come later, and what's purely optional polish.

---

## 🧩 Product Requirements Document (PRD)

### **Product Name**

**keypal**

### **Summary**

A zero-bloat, TypeScript-native library for generating, hashing, validating, and managing API keys in modern apps.
It’s built to be **simple**, **secure**, and **framework-agnostic**, working seamlessly in Node, Bun, and Deno.

---

## 🎯 **Goals**

* Make it dead simple for developers to generate and verify API keys.
* Be small enough to drop into any backend with no dependencies.
* Avoid vendor lock-in. The library should support plug-and-play storage (memory, Redis, Postgres, etc.).
* Make it type-safe with strong schema validation via **TypeBox**.
* Have zero unnecessary dependencies, focusing on built-in Node crypto.

---

## 🧠 **Core Concepts**

An **API key** = a unique secret string identifying a client or integration.
It can be **generated**, **hashed**, **validated**, and optionally **stored** with metadata like permissions or expiration.

---

## 💪 **Core User Stories**

| ID  | Story                                                                               |
| --- | ----------------------------------------------------------------------------------- |
| US1 | As a developer, I can initialize the API key manager once with my configuration and reuse it throughout my app. |
| US2 | As a developer, I can generate a secure random API key using the configured settings. |
| US3 | As a developer, I can hash and store the key securely in my database.               |
| US4 | As a backend service, I can validate a provided key safely against stored hashes.   |
| US5 | As a user, I can optionally attach metadata to each key (scopes, owner ID, expiry). |
| US6 | As a developer, I can plug in my own storage backend easily.                        |

---

## 🏗️ **Feature Breakdown**

### **MUST-HAVE (MVP)**

**Goal:** Lightweight core that handles generation, hashing, and validation.

| Feature                                  | Description                                                        | Status |
| ---------------------------------------- | ------------------------------------------------------------------ | ------ |
| **Key generation**                       | Create cryptographically secure keys (configurable length).        | ✅ Core |
| **Key hashing**                          | Hash keys using SHA-256 or configurable algorithms.                | ✅ Core |
| **Key validation**                       | Compare provided key safely (using `timingSafeEqual`).             | ✅ Core |
| **Config schema (TypeBox)**              | Validate config and options via JSON-schema-compatible validation. | ✅ Core |
| **Pluggable storage interface**          | Simple abstract interface for saving and retrieving API keys.      | ✅ Core |
| **Memory store**                         | Default in-memory implementation for testing or lightweight use.   | ✅ Core |
| **TypeScript-first API**                 | Full type definitions and generics for safety and DX.              | ✅ Core |
| **Zero external deps (besides TypeBox)** | No external crypto, uuid, or runtime frameworks.                   | ✅ Core |

---

### **SHOULD-HAVE (Next Iteration)**

**Goal:** Make it usable in production-scale systems.

| Feature                             | Description                                                          | Status     |
| ----------------------------------- | -------------------------------------------------------------------- | ---------- |
| **Redis adapter**                   | Redis-backed key storage (for rate limits or key revocation).        | 🚧 Planned |
| **Expiration support**              | Auto-expiring keys after a given time.                               | 🚧 Planned |
| **Scopes and roles**                | Support metadata fields like `scope: ["read", "write"]`.             | 🚧 Planned |
| **Key prefixing**                   | Optional prefixes (e.g. `sk_live_...`) for identifying environments. | 🚧 Planned |
| **Configurable hashing algorithms** | Support SHA512, bcrypt (optionally), or user-defined.                | 🚧 Planned |
| **Custom key formatters**           | Define how keys are formatted (segments, casing, prefix).            | 🚧 Planned |

---

### **NICE-TO-HAVE (Future)**

**Goal:** Convenience, integrations, and developer experience polish.

| Feature                       | Description                                                       | Status  |
| ----------------------------- | ----------------------------------------------------------------- | ------- |
| **CLI tool**                  | Command-line tool for generating and managing keys.               | 🧠 Idea |
| **Web dashboard integration** | Small React widget or dashboard UI for managing keys visually.    | 🧠 Idea |
| **JWT-style keys**            | Optional signed keys using `jose` for validation without storage. | 🧠 Idea |
| **Analytics hooks**           | Log or emit events when keys are created or validated.            | 🧠 Idea |
| **Rate limiting integration** | Optional middleware hooks to connect with rate limiters.          | 🧠 Idea |
| **Audit logs**                | Track key creation and validation attempts.                       | 🧠 Idea |

---

## 🧩 **Technical Stack**

| Component       | Choice                            |
| --------------- | --------------------------------- |
| Language        | TypeScript                        |
| Runtime Targets | Node 18+, Bun, Deno               |
| Validation      | TypeBox                           |
| Build Tool      | tsup or Bun build                 |
| Testing         | Vitest                            |
| Crypto          | Node built-in `crypto` module     |
| Storage         | Memory (default), Redis (planned) |

---

## 📦 **Example API**

```ts
import { createApiKeyManager } from "keypal"

// Initialize once with your configuration
const apiKeys = createApiKeyManager({
  prefix: "sk_live",
  length: 32,
  storage: new MemoryStore(), // or RedisStore, PostgresStore, etc.
})

// Generate a key (uses configured prefix and length)
const key = apiKeys.generateKey()

// Hash the key
const hash = apiKeys.hashKey(key)

// Validate a key
const isValid = apiKeys.validateKey(key, hash)

// Store with metadata
await apiKeys.store(key, {
  ownerId: "user_123",
  scopes: ["read", "write"],
  expiresAt: new Date("2025-12-31"),
})
```

---

## 🧠 **Design Principles**

1. **Configuration-First API**
   Initialize once with all settings, then use methods on the instance. No repeated config.

2. **Simplicity > Abstraction**
   Developers should understand every part of the process.

3. **No magic**
   Explicit imports and clear naming. No hidden runtime behavior.

4. **Security-first**
   Use modern cryptographic standards. Avoid insecure hashing.

5. **Portability**
   Runs anywhere JS runs. No dependencies that limit environments.

6. **Extensibility**
   Easy for users to extend storage or validation logic.

---

## 🚀 **Milestones**

| Phase      | Deliverable                                         | ETA    |
| ---------- | --------------------------------------------------- | ------ |
| **MVP**    | Key generation, hashing, validation, TypeBox schema | Week 1 |
| **v0.2.0** | Pluggable storage + Redis adapter                   | Week 2 |
| **v0.3.0** | Expiration and metadata support                     | Week 3 |
| **v0.4.0** | CLI + key prefixing                                 | Week 4 |
| **v1.0.0** | Production-ready with docs and full test coverage   | Week 5 |

---

You want me to expand this into a **technical spec** (like directory structure, interfaces, and config schema examples for TypeBox) next? That’ll make it ready to actually start building.
