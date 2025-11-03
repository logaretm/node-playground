# Node.js Test Application

This is a test application demonstrating a tracing channel issue with Fastify, Sentry, and custom storage instrumentation.

## 🐛 Bug Reproductions

This repository contains minimal reproductions for a **Node.js `tracePromise` context propagation bug**.

All reproductions and documentation are in the **[`repro/`](repro/)** directory.

### 🚀 Quick Start

```bash
cd repro/bare
node index.js
```

Look for `CONTEXT LOST!` → Bug confirmed!

### 📚 Documentation

The [`repro/`](repro/) directory contains:
- **Two minimal reproductions** (bare Node.js and OpenTelemetry)
- **Complete documentation** with diagrams and examples
- **Bug report template** for Node.js
- **Test scripts** to run all reproductions

**Start here**: [`repro/QUICK_START.md`](repro/QUICK_START.md) or [`repro/README.md`](repro/README.md)

---

## 💻 Original Application

The original application files remain in the root directory:
- `index.ts` - Main Fastify server with Sentry
- `storage.ts` - Custom storage with tracing channels (shows the bug)
- `instrument.ts` - Sentry initialization

### Run the Application

```bash
pnpm install
pnpm dev
```

Then visit: http://localhost:3000/

This demonstrates the bug in a real-world context with Sentry tracing.
