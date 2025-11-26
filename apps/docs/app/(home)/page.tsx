import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-landing-bg">
      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center px-4 py-32">
        <div className="max-w-5xl w-full text-center">
          <h1 className="text-7xl font-semibold mb-8 leading-tight text-landing-text">
            keypal
          </h1>
          <p className="text-3xl mb-6 leading-relaxed font-medium text-landing-text-muted">
            Secure API key management for TypeScript
          </p>
          <p className="text-xl mb-16 max-w-3xl mx-auto leading-relaxed text-landing-text-subtle">
            Cryptographic hashing, expiration, scopes, and pluggable storage adapters. 
            Built for production with zero configuration required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/docs"
              className="px-10 py-4 font-medium text-lg transition-opacity hover:opacity-90 bg-landing-btn-primary-bg text-landing-btn-primary-text border border-landing-btn-border"
            >
              Get Started
            </Link>
            <a
              href="https://github.com/izadoesdev/keypal"
              target="_blank"
              rel="noopener noreferrer"
              className="px-10 py-4 font-medium text-lg transition-opacity hover:opacity-80 bg-landing-btn-secondary-bg text-landing-btn-secondary-text border border-landing-btn-border"
            >
              GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Installation Section */}
      <section className="py-24 px-4 border-t border-landing-border">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-semibold text-center mb-4 text-landing-text">
            Installation
          </h2>
          <p className="text-lg text-center mb-12 max-w-2xl mx-auto text-landing-text-muted">
            Install keypal with your preferred package manager
          </p>
          <div className="p-6 overflow-x-auto rounded-lg bg-landing-code-bg text-landing-code-text">
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
      <section className="py-24 px-4 bg-landing-bg-muted border-t border-landing-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-semibold mb-4 text-landing-text">
              Features
            </h2>
            <p className="text-lg max-w-2xl mx-auto text-landing-text-muted">
              Everything you need for secure API key management
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                title: 'Secure by Default',
                description: 'SHA-256/SHA-512 hashing with optional salt and timing-safe comparison'
              },
              {
                title: 'Smart Detection',
                description: 'Automatically extracts keys from Authorization headers or custom headers'
              },
              {
                title: 'Flexible Storage',
                description: 'Memory, Redis, Drizzle, Prisma, Kysely, and Convex adapters included'
              },
              {
                title: 'Scope-based Permissions',
                description: 'Fine-grained access control with resource-specific scopes'
              },
              {
                title: 'Built-in Caching',
                description: 'Optional in-memory or Redis caching for validated keys'
              },
              {
                title: 'TypeScript',
                description: 'Full type safety with zero configuration required'
              }
            ].map((feature) => (
              <div 
                key={feature.title}
                className="p-6 rounded-lg bg-landing-bg border border-landing-border"
              >
                <h3 className="text-xl font-semibold mb-3 text-landing-text">
                  {feature.title}
                </h3>
                <p className="text-base leading-relaxed text-landing-text-muted">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code Example Section */}
      <section className="py-24 px-4 border-t border-landing-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-semibold mb-4 text-landing-text">
              Quick Start
            </h2>
            <p className="text-lg max-w-2xl mx-auto text-landing-text-muted">
              Get up and running in minutes with a simple example
            </p>
          </div>
          <div className="p-8 overflow-x-auto rounded-lg bg-landing-code-bg text-landing-code-text">
            <pre className="text-sm leading-relaxed">
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
      <section className="py-24 px-4 bg-landing-bg-muted border-t border-landing-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-semibold mb-4 text-landing-text">
              Storage Adapters
            </h2>
            <p className="text-lg max-w-2xl mx-auto text-landing-text-muted">
              Choose the storage backend that fits your infrastructure
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: 'Memory', description: 'In-memory storage for development' },
              { title: 'Redis', description: 'Distributed storage for production' },
              { title: 'Drizzle', description: 'PostgreSQL, MySQL, SQLite' },
              { title: 'Prisma', description: 'Works with any Prisma database' },
              { title: 'Kysely', description: 'Type-safe SQL query builder' },
              { title: 'Convex', description: 'Real-time backend storage' },
              { title: 'Custom', description: 'Implement your own adapter' },
              { title: 'More', description: 'See all adapters in the docs' }
            ].map((adapter) => (
              <div 
                key={adapter.title}
                className="p-4 rounded-lg bg-landing-bg border border-landing-border"
              >
                <h3 className="text-lg font-semibold mb-2 text-landing-text">
                  {adapter.title}
                </h3>
                <p className="text-landing-text-muted">
                  {adapter.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-4 border-t border-landing-border">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-5xl font-semibold mb-6 text-landing-text">
            Ready to get started?
          </h2>
          <p className="text-xl mb-12 leading-relaxed text-landing-text-muted">
            Install keypal and start managing API keys in minutes. 
            Full documentation available with examples and guides.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/docs"
              className="px-10 py-4 font-medium text-lg transition-opacity hover:opacity-90 bg-landing-btn-primary-bg text-landing-btn-primary-text border border-landing-btn-border"
            >
              View Documentation
            </Link>
            <a
              href="https://github.com/izadoesdev/keypal"
              target="_blank"
              rel="noopener noreferrer"
              className="px-10 py-4 font-medium text-lg transition-opacity hover:opacity-80 bg-landing-btn-secondary-bg text-landing-btn-secondary-text border border-landing-btn-border"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
