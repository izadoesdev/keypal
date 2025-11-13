import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center px-4 py-32">
        <div className="max-w-5xl w-full text-center">
          <h1 className="text-7xl font-semibold mb-8 text-gray-900 leading-tight">
            keypal
          </h1>
          <p className="text-3xl text-gray-600 mb-6 leading-relaxed font-medium">
            Secure API key management for TypeScript
          </p>
          <p className="text-xl text-gray-500 mb-16 max-w-3xl mx-auto leading-relaxed">
            Cryptographic hashing, expiration, scopes, and pluggable storage adapters. 
            Built for production with zero configuration required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              to="/docs/$"
              params={{
                _splat: '',
              }}
              className="px-10 py-4 bg-gray-900 text-white font-medium text-lg border border-gray-900"
            >
              Get Started
            </Link>
            <a
              href="https://github.com/izadoesdev/keypal"
              target="_blank"
              rel="noopener noreferrer"
              className="px-10 py-4 bg-white text-gray-900 font-medium text-lg border border-gray-900"
            >
              GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Installation Section */}
      <section className="py-24 px-4 border-t border-gray-200">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-semibold text-center mb-4 text-gray-900">
            Installation
          </h2>
          <p className="text-lg text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            Install keypal with your preferred package manager
          </p>
          <div className="bg-gray-900 text-gray-100 p-6 overflow-x-auto">
            <pre className="text-base leading-relaxed">
              <code>{`npm install keypal
# or
bun add keypal
# or
pnpm add keypal`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-4 bg-gray-50 border-t border-gray-200">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-semibold mb-4 text-gray-900">
              Features
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Everything you need for secure API key management
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-12">
            <div className="border border-gray-200 p-6">
              <h3 className="text-2xl font-semibold mb-4 text-gray-900">Secure by Default</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                SHA-256/SHA-512 hashing with optional salt and timing-safe comparison
              </p>
            </div>
            <div className="border border-gray-200 p-6">
              <h3 className="text-2xl font-semibold mb-4 text-gray-900">Smart Detection</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                Automatically extracts keys from Authorization headers or custom headers
              </p>
            </div>
            <div className="border border-gray-200 p-6">
              <h3 className="text-2xl font-semibold mb-4 text-gray-900">Flexible Storage</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                Memory, Redis, Drizzle, Prisma, Kysely, and Convex adapters included
              </p>
            </div>
            <div className="border border-gray-200 p-6">
              <h3 className="text-2xl font-semibold mb-4 text-gray-900">Scope-based Permissions</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                Fine-grained access control with resource-specific scopes
              </p>
            </div>
            <div className="border border-gray-200 p-6">
              <h3 className="text-2xl font-semibold mb-4 text-gray-900">Built-in Caching</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                Optional in-memory or Redis caching for validated keys
              </p>
            </div>
            <div className="border border-gray-200 p-6">
              <h3 className="text-2xl font-semibold mb-4 text-gray-900">TypeScript</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                Full type safety with zero configuration required
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Code Example Section */}
      <section className="py-24 px-4 border-t border-gray-200">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-semibold mb-4 text-gray-900">
              Quick Start
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Get up and running in minutes with a simple example
            </p>
          </div>
          <div className="bg-gray-900 text-gray-100 p-10 overflow-x-auto">
            <pre className="text-base leading-relaxed">
              <code>{`import { createKeys } from 'keypal'

const keys = createKeys({
  prefix: 'sk_',
  cache: true,
})

// Create a key
const { key, record } = await keys.create({
  ownerId: 'user_123',
  scopes: ['read', 'write'],
})

// Verify from headers
const result = await keys.verify(request.headers)
if (result.valid) {
  console.log('Authenticated:', result.record.metadata.ownerId)
}`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Storage Adapters Section */}
      <section className="py-24 px-4 bg-gray-50 border-t border-gray-200">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-semibold mb-4 text-gray-900">
              Storage Adapters
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Choose the storage backend that fits your infrastructure
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="border border-gray-200 p-4">
              <h3 className="text-xl font-semibold mb-2 text-gray-900">Memory</h3>
              <p className="text-gray-600">In-memory storage for development</p>
            </div>
            <div className="border border-gray-200 p-4">
              <h3 className="text-xl font-semibold mb-2 text-gray-900">Redis</h3>
              <p className="text-gray-600">Distributed storage for production</p>
            </div>
            <div className="border border-gray-200 p-4">
              <h3 className="text-xl font-semibold mb-2 text-gray-900">Drizzle</h3>
              <p className="text-gray-600">PostgreSQL, MySQL, SQLite</p>
            </div>
            <div className="border border-gray-200 p-4">
              <h3 className="text-xl font-semibold mb-2 text-gray-900">Prisma</h3>
              <p className="text-gray-600">Works with any Prisma database</p>
            </div>
            <div className="border border-gray-200 p-4">
              <h3 className="text-xl font-semibold mb-2 text-gray-900">Kysely</h3>
              <p className="text-gray-600">Type-safe SQL query builder</p>
            </div>
            <div className="border border-gray-200 p-4">
              <h3 className="text-xl font-semibold mb-2 text-gray-900">Convex</h3>
              <p className="text-gray-600">Real-time backend storage</p>
            </div>
            <div className="border border-gray-200 p-4">
              <h3 className="text-xl font-semibold mb-2 text-gray-900">Custom</h3>
              <p className="text-gray-600">Implement your own adapter</p>
            </div>
            <div className="border border-gray-200 p-4">
              <h3 className="text-xl font-semibold mb-2 text-gray-900">More</h3>
              <p className="text-gray-600">See all adapters in the docs</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-4 border-t border-gray-200">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-5xl font-semibold mb-6 text-gray-900">
            Ready to get started?
          </h2>
          <p className="text-xl text-gray-600 mb-12 leading-relaxed">
            Install keypal and start managing API keys in minutes. 
            Full documentation available with examples and guides.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              to="/docs/$"
              params={{
                _splat: '',
              }}
              className="px-10 py-4 bg-gray-900 text-white font-medium text-lg border border-gray-900"
            >
              View Documentation
            </Link>
            <a
              href="https://github.com/izadoesdev/keypal"
              target="_blank"
              rel="noopener noreferrer"
              className="px-10 py-4 bg-white text-gray-900 font-medium text-lg border border-gray-900"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
