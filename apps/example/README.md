# Keypal Example App

A comprehensive Next.js example application demonstrating [keypal](https://github.com/izadoesdev/keypal) - a TypeScript library for secure API key management.

## Features Demonstrated

This example showcases all major features of keypal:

- **API Key Management**: Create, list, enable/disable, rotate, and revoke API keys
- **Key Verification**: Automatic key extraction from headers and verification
- **Scope-based Permissions**: Fine-grained access control with scopes
- **Usage Tracking**: Monitor when and how keys are used
- **Audit Logging**: Track all key operations with full context
- **Multiple Storage Backends**: Memory, Redis, and Drizzle ORM adapters
- **Resource-level Permissions**: Granular permissions for specific resources

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (recommended) or Node.js 18+
- Redis (optional, for Redis storage example)
- PostgreSQL (optional, for Drizzle ORM example)

### Installation

```bash
# Install dependencies
bun install

# Run the development server
bun dev
```

Open [http://localhost:3000](http://localhost:3000) to see the example app.

## Pages

- **Home** (`/`) - Overview and getting started
- **API Keys** (`/api-keys`) - Manage API keys
- **Create Key** (`/api-keys/create`) - Create new API keys
- **Key Details** (`/api-keys/[id]`) - View and manage individual keys
- **Verify Keys** (`/verify`) - Test key verification
- **Scopes** (`/scopes`) - Demonstrate scope-based permissions
- **Audit Logs** (`/audit-logs`) - View audit trail
- **Storage Examples** (`/storage`) - Compare different storage backends

## Learn More

- [Keypal Documentation](../README.md) - Full API documentation
- [Keypal GitHub](https://github.com/izadoesdev/keypal) - Source code and issues
- [Next.js Documentation](https://nextjs.org/docs) - Next.js features and API
