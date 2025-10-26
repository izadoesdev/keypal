export default function Home() {
	return (
		<div className="min-h-screen bg-linear-to-br from-zinc-50 via-zinc-50 to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
			<div className="container mx-auto max-w-6xl px-4 py-16">
				<div className="rounded-2xl border border-zinc-200 bg-white p-12 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
					<div className="mb-8">
						<h1 className="mb-3 font-bold text-4xl text-zinc-900 tracking-tight dark:text-zinc-50">
							Keypal Example App
						</h1>
						<p className="text-lg text-zinc-600 dark:text-zinc-400">
							A comprehensive example demonstrating keypal - a TypeScript
							library for secure API key management.
						</p>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<a
							className="group rounded-xl border border-zinc-200 bg-zinc-50 p-6 transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-800/50 dark:hover:border-zinc-700"
							href="/sandbox"
						>
							<h2 className="mb-2 font-semibold text-xl text-zinc-900 dark:text-zinc-50">
								Interactive Sandbox
							</h2>
							<p className="text-sm text-zinc-600 dark:text-zinc-400">
								Try out keypal features with a live demonstration
							</p>
						</a>

						<a
							className="group rounded-xl border border-zinc-200 bg-zinc-50 p-6 transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-800/50 dark:hover:border-zinc-700"
							href="https://github.com/izadoesdev/keypal"
							rel="noopener noreferrer"
							target="_blank"
						>
							<h2 className="mb-2 font-semibold text-xl text-zinc-900 dark:text-zinc-50">
								Documentation
							</h2>
							<p className="text-sm text-zinc-600 dark:text-zinc-400">
								Read the full API documentation and guides
							</p>
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}
