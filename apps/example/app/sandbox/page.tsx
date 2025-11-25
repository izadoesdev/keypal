"use client";

import {
	CheckCircleIcon,
	ClockIcon,
	CopyIcon,
	KeyIcon,
	ListBulletsIcon,
	LockIcon,
	MagnifyingGlassIcon,
	ShieldCheckIcon,
	SparkleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
	createApiKey,
	disableApiKey,
	enableApiKey,
	getAuditLogs,
	listApiKeys,
	revokeApiKey,
	rotateApiKey,
	verifyApiKey,
	verifyApiKeyWithScopes,
} from "../actions";

type ApiKeyRecord = {
	id: string;
	metadata: {
		name?: string;
		scopes?: string[];
		resources?: Record<string, string[]>;
		enabled?: boolean;
		ownerId?: string;
		createdAt?: string;
		lastUsedAt?: string;
		revokedAt?: string | null;
		expiresAt?: string | null;
	};
};

const MILLISECONDS_PER_DAY = 86_400_000;
const DAYS_IN_WEEK = 7;
const SKELETON_COUNT = 3;
const REFETCH_INTERVAL_MS = 2000;
const KEY_ID_DISPLAY_LENGTH = 16;

const AVAILABLE_SCOPES = [
	{ value: "read", label: "Read", description: "Read-only access" },
	{
		value: "write",
		label: "Write",
		description: "Create and update resources",
	},
	{ value: "delete", label: "Delete", description: "Delete resources" },
	{ value: "admin", label: "Admin", description: "Full administrative access" },
] as const;

const PRESET_CONFIGS = [
	{
		name: "Read-only API",
		scopes: ["read"],
		description: "Safe read-only access for public integrations",
	},
	{
		name: "Full Access Key",
		scopes: ["read", "write", "delete"],
		description: "Complete control over resources",
	},
	{
		name: "Admin Key",
		scopes: ["read", "write", "delete", "admin"],
		description: "Full administrative privileges",
	},
	{
		name: "Upload Only",
		scopes: ["write"],
		description: "Can only create new resources",
	},
];

export default function SandboxPage() {
	const [ownerId, setOwnerId] = useState("dev_team_alpha");
	const [newKeyName, setNewKeyName] = useState("");
	const [selectedScopes, setSelectedScopes] = useState<string[]>(["read"]);
	const [expirationDays, setExpirationDays] = useState<number | "">("");
	const [verifyKey, setVerifyKey] = useState("");
	const [requiredScopes, setRequiredScopes] = useState<string[]>([]);
	const [createdKey, setCreatedKey] = useState<string | null>(null);
	const [showAuditLogs, setShowAuditLogs] = useState(false);
	const queryClient = useQueryClient();

	const { data: keys = [], isLoading: isLoadingKeys } = useQuery({
		queryKey: ["apiKeys", ownerId],
		queryFn: async () => {
			const result = await listApiKeys(ownerId);
			return result.success ? (result.keys as ApiKeyRecord[]) : [];
		},
		refetchInterval: REFETCH_INTERVAL_MS,
	});

	const { data: auditLogs = [] } = useQuery({
		queryKey: ["auditLogs", ownerId],
		queryFn: async () => {
			const result = await getAuditLogs(undefined, ownerId);
			return result.success ? result.logs : [];
		},
		refetchInterval: REFETCH_INTERVAL_MS,
	});

	const invalidateKeys = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: ["apiKeys", ownerId] });
	}, [queryClient, ownerId]);

	const createMutation = useMutation({
		mutationFn: () => {
			const expiresAt =
				expirationDays && typeof expirationDays === "number"
					? new Date(
							Date.now() + expirationDays * MILLISECONDS_PER_DAY
						).toISOString()
					: undefined;
			return createApiKey({
				ownerId,
				name: newKeyName,
				scopes: selectedScopes,
				expiresAt,
			});
		},
		onSuccess: (result) => {
			if (result.success && result.key && result.record) {
				setCreatedKey(result.key);
				setNewKeyName("");
				setSelectedScopes(["read"]);
				setExpirationDays("");
				toast.success("API key created successfully!");
				invalidateKeys();
			}
		},
	});

	const verifyMutation = useMutation({
		mutationFn: () => verifyApiKey(verifyKey),
		onSuccess: (result) => {
			if (result.valid && result.record) {
				toast.success("Valid API key!");
				invalidateKeys();
			} else {
				toast.error(result.error || "Invalid API key");
			}
		},
	});

	const verifyWithScopesMutation = useMutation({
		mutationFn: () =>
			verifyApiKeyWithScopes(
				verifyKey,
				requiredScopes.length > 0 ? requiredScopes : undefined
			),
		onSuccess: (result) => {
			if (result.valid && "record" in result && result.record) {
				toast.success(`Key has required scopes: ${requiredScopes.join(", ")}`);
			} else {
				toast.error(
					"error" in result
						? result.error
						: "Invalid or insufficient permissions"
				);
			}
		},
	});

	const revokeMutation = useMutation({
		mutationFn: (id: string) => revokeApiKey(id),
		onSuccess: () => {
			toast.success("API key revoked");
			invalidateKeys();
		},
	});

	const enableMutation = useMutation({
		mutationFn: (id: string) => enableApiKey(id),
		onSuccess: () => {
			toast.success("API key enabled");
			invalidateKeys();
		},
	});

	const disableMutation = useMutation({
		mutationFn: (id: string) => disableApiKey(id),
		onSuccess: () => {
			toast.success("API key disabled");
			invalidateKeys();
		},
	});

	const rotateMutation = useMutation({
		mutationFn: (id: string) => rotateApiKey(id),
		onSuccess: (result) => {
			if (
				result.success &&
				"key" in result &&
				result.key &&
				"record" in result &&
				result.record
			) {
				setCreatedKey(result.key);
				toast.success("Key rotated successfully!");
				invalidateKeys();
			}
		},
	});

	const copyToClipboard = useCallback((text: string, label: string) => {
		navigator.clipboard.writeText(text);
		toast.success(`${label} copied`);
	}, []);

	const toggleScope = useCallback((scope: string) => {
		setSelectedScopes((prev) =>
			prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
		);
	}, []);

	const toggleRequiredScope = useCallback((scope: string) => {
		setRequiredScopes((prev) =>
			prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
		);
	}, []);

	const applyPreset = useCallback((scopes: string[]) => {
		setSelectedScopes(scopes);
	}, []);

	const formatDate = useCallback((dateString?: string | null) => {
		if (!dateString) {
			return "Never";
		}
		try {
			return format(parseISO(dateString), "MMM d, yyyy HH:mm");
		} catch {
			return "Invalid date";
		}
	}, []);

	const isExpired = useCallback((expiresAt?: string | null) => {
		if (!expiresAt) {
			return false;
		}
		return new Date(expiresAt) < new Date();
	}, []);

	const isCloseToExpiry = useCallback(
		(expiresAt?: string | null, days = DAYS_IN_WEEK) => {
			if (!expiresAt) {
				return false;
			}
			const expires = new Date(expiresAt);
			const now = new Date();
			const diffDays =
				(expires.getTime() - now.getTime()) / MILLISECONDS_PER_DAY;
			return diffDays > 0 && diffDays <= days;
		},
		[]
	);

	return (
		<div className="min-h-screen bg-gradient-to-br from-zinc-50 via-zinc-50 to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
			<div className="flex h-screen">
				{/* Sidebar */}
				<div className="w-64 border-zinc-200 border-r bg-white dark:border-zinc-800 dark:bg-zinc-900">
					<div className="flex h-full flex-col">
						{/* Sidebar Header */}
						<div className="border-zinc-200 border-b p-3 dark:border-zinc-800">
							<h1 className="flex items-center gap-2 font-semibold text-lg text-zinc-900 dark:text-zinc-50">
								<KeyIcon className="h-5 w-5" weight="duotone" />
								Keys
							</h1>
							<p className="text-xs text-zinc-500 dark:text-zinc-400">
								{keys.length} key{keys.length !== 1 ? "s" : ""}
							</p>
						</div>

						{/* Keys List */}
						<div className="flex-1 overflow-y-auto p-2">
							{isLoadingKeys ? (
								<div className="space-y-2">
									{[...new Array(SKELETON_COUNT)].map((_, i) => (
										<div
											className="animate-pulse rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800"
											key={`skeleton-${i.toString()}`}
										>
											<div className="h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-700" />
											<div className="mt-2 h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-700" />
										</div>
									))}
								</div>
							) : keys.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-12 text-center">
									<KeyIcon
										className="h-12 w-12 text-zinc-300 dark:text-zinc-600"
										weight="duotone"
									/>
									<p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
										No API keys yet
									</p>
								</div>
							) : (
								<div className="space-y-1">
									{keys.map((keyRecord: ApiKeyRecord) => {
										const isExp = isExpired(keyRecord.metadata.expiresAt);
										const isCloseExp = isCloseToExpiry(
											keyRecord.metadata.expiresAt
										);
										return (
											<div
												className="rounded-lg border border-zinc-200 bg-white p-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
												key={keyRecord.id}
											>
												<div className="flex items-start gap-3">
													<div className="shrink-0">
														{keyRecord.metadata.revokedAt ? (
															<div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
																<XCircleIcon
																	className="h-4 w-4 text-red-600 dark:text-red-400"
																	weight="duotone"
																/>
															</div>
														) : keyRecord.metadata.enabled === false ? (
															<div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
																<LockIcon
																	className="h-4 w-4 text-zinc-400 dark:text-zinc-500"
																	weight="duotone"
																/>
															</div>
														) : (
															<div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
																<CheckCircleIcon
																	className="h-4 w-4 text-green-600 dark:text-green-400"
																	weight="duotone"
																/>
															</div>
														)}
													</div>
													<div className="min-w-0 flex-1">
														<div className="flex items-center gap-2">
															<p className="truncate font-medium text-sm text-zinc-900 dark:text-zinc-50">
																{keyRecord.metadata.name || "Unnamed Key"}
															</p>
															{keyRecord.metadata.revokedAt && (
																<span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 text-xs dark:bg-red-900 dark:text-red-300">
																	Revoked
																</span>
															)}
															{isExp && (
																<span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 text-xs dark:bg-red-900 dark:text-red-300">
																	Expired
																</span>
															)}
															{isCloseExp && !isExp && (
																<span className="shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 font-medium text-xs text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
																	Expiring Soon
																</span>
															)}
														</div>
														<p className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
															{keyRecord.id}
														</p>
														<div className="mt-1 flex flex-wrap gap-1">
															{keyRecord.metadata.scopes?.map((scope) => (
																<span
																	className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
																	key={scope}
																>
																	{scope}
																</span>
															))}
														</div>
														{keyRecord.metadata.expiresAt && (
															<p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
																Expires:{" "}
																{formatDate(keyRecord.metadata.expiresAt)}
															</p>
														)}
													</div>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>

						{/* Owner ID Section */}
						<div className="border-zinc-200 border-t p-3 dark:border-zinc-800">
							<label
								className="mb-1 block font-medium text-xs text-zinc-700 dark:text-zinc-300"
								htmlFor="sidebar-owner-id"
							>
								Owner
							</label>
							<input
								className="mb-2 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 placeholder-zinc-400 transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
								id="sidebar-owner-id"
								onChange={(e) => setOwnerId(e.target.value)}
								placeholder="dev_team_alpha"
								type="text"
								value={ownerId}
							/>
							<div className="flex gap-2">
								<button
									className="flex-1 rounded bg-zinc-900 px-2 py-1.5 font-medium text-white text-xs transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-100"
									disabled={isLoadingKeys}
									onClick={invalidateKeys}
									type="button"
								>
									Refresh
								</button>
								<button
									className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 font-medium text-xs text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
									onClick={() => setShowAuditLogs(!showAuditLogs)}
									type="button"
								>
									Logs
								</button>
							</div>
						</div>

						{/* Audit Logs Section */}
						{showAuditLogs && (
							<div className="border-zinc-200 border-t p-3 dark:border-zinc-800">
								<h3 className="mb-2 flex items-center gap-2 font-semibold text-xs text-zinc-900 dark:text-zinc-50">
									<ListBulletsIcon className="h-3 w-3" weight="duotone" />
									Audit Logs
								</h3>
								<div className="max-h-64 space-y-2 overflow-y-auto">
									{auditLogs.length === 0 ? (
										<p className="text-xs text-zinc-500 dark:text-zinc-400">
											No audit logs yet
										</p>
									) : (
										auditLogs.map(
											(log: {
												id: string;
												action: string;
												timestamp: string;
												keyId: string;
											}) => (
												<div
													className="rounded border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
													key={log.id}
												>
													<div className="flex items-center justify-between">
														<span className="font-medium text-zinc-900 dark:text-zinc-50">
															{log.action}
														</span>
														<span className="text-zinc-500 dark:text-zinc-400">
															{formatDate(log.timestamp)}
														</span>
													</div>
													<p className="mt-1 font-mono text-zinc-600 dark:text-zinc-300">
														{log.keyId.slice(0, KEY_ID_DISPLAY_LENGTH)}...
													</p>
												</div>
											)
										)
									)}
								</div>
							</div>
						)}
					</div>
				</div>

				{/* Main Content */}
				<div className="flex-1 overflow-y-auto">
					<div className="mx-auto max-w-7xl p-6">
						<div className="mb-6">
							<h1 className="mb-1 flex items-center gap-2 font-bold text-2xl text-zinc-900 dark:text-zinc-50">
								<ShieldCheckIcon className="h-6 w-6" weight="duotone" />
								API Key Manager
							</h1>
							<p className="text-sm text-zinc-600 dark:text-zinc-400">
								Create, verify, and manage API keys with scopes and expiration
							</p>
						</div>

						<div className="grid gap-4 lg:grid-cols-2">
							{/* Create Key Section */}
							<div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
								<h2 className="mb-4 flex items-center gap-2 font-semibold text-lg text-zinc-900 dark:text-zinc-50">
									<SparkleIcon className="h-5 w-5" weight="duotone" />
									Create Key
								</h2>
								<div className="space-y-3">
									<div>
										<label
											className="mb-2 block font-medium text-sm text-zinc-700 dark:text-zinc-300"
											htmlFor="key-name"
										>
											Key Name
										</label>
										<input
											className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
											id="key-name"
											onChange={(e) => setNewKeyName(e.target.value)}
											placeholder="Production API Key"
											type="text"
											value={newKeyName}
										/>
									</div>

									{/* Preset Configurations */}
									<div>
										<div className="mb-2 font-medium text-sm text-zinc-700 dark:text-zinc-300">
											Quick Presets
										</div>
										<div className="grid grid-cols-2 gap-2">
											{PRESET_CONFIGS.map((preset) => (
												<button
													className="rounded-lg border border-zinc-200 bg-white p-2 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
													key={preset.name}
													onClick={() => applyPreset(preset.scopes)}
													type="button"
												>
													<div className="font-medium text-xs text-zinc-900 dark:text-zinc-50">
														{preset.name}
													</div>
													<div className="text-xs text-zinc-500 dark:text-zinc-400">
														{preset.description}
													</div>
												</button>
											))}
										</div>
									</div>

									{/* Scopes Selection */}
									<div>
										<div className="mb-2 font-medium text-sm text-zinc-700 dark:text-zinc-300">
											Scopes
										</div>
										<div className="space-y-2">
											{AVAILABLE_SCOPES.map((scope) => (
												<label
													className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
													key={scope.value}
												>
													<input
														checked={selectedScopes.includes(scope.value)}
														className="h-4 w-4 rounded border-zinc-300 text-zinc-600 focus:ring-2 focus:ring-zinc-500 dark:border-zinc-600"
														onChange={() => toggleScope(scope.value)}
														type="checkbox"
													/>
													<div className="flex-1">
														<div className="font-medium text-sm text-zinc-900 dark:text-zinc-50">
															{scope.label}
														</div>
														<div className="text-xs text-zinc-500 dark:text-zinc-400">
															{scope.description}
														</div>
													</div>
												</label>
											))}
										</div>
									</div>

									{/* Expiration */}
									<div>
										<label
											className="mb-2 block font-medium text-sm text-zinc-700 dark:text-zinc-300"
											htmlFor="expiration"
										>
											Expiration (days, optional)
										</label>
										<input
											className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
											id="expiration"
											min="1"
											onChange={(e) =>
												setExpirationDays(
													e.target.value ? Number(e.target.value) : ""
												)
											}
											placeholder="30"
											type="number"
											value={expirationDays}
										/>
									</div>

									<button
										className="w-full rounded-lg bg-zinc-900 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-100"
										disabled={
											createMutation.isPending || selectedScopes.length === 0
										}
										onClick={() => createMutation.mutate()}
										type="button"
									>
										{createMutation.isPending ? "Creating..." : "Create Key"}
									</button>

									{/* Created Key Display */}
									{createdKey && (
										<div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
											<div className="mb-2 flex items-center justify-between">
												<p className="flex items-center gap-2 font-medium text-green-900 text-sm dark:text-green-100">
													<CheckCircleIcon
														className="h-4 w-4"
														weight="duotone"
													/>
													Key Created
												</p>
												<button
													className="text-green-600 hover:text-green-700 dark:text-green-400"
													onClick={() => setCreatedKey(null)}
													type="button"
												>
													<XCircleIcon className="h-4 w-4" weight="duotone" />
												</button>
											</div>
											<p className="mb-2 text-green-700 text-xs dark:text-green-300">
												Copy this key now - you won't be able to see it again!
											</p>
											<div className="flex gap-2">
												<code className="flex-1 break-all rounded bg-green-100 px-3 py-2 font-mono text-green-900 text-xs dark:bg-green-900/50 dark:text-green-100">
													{createdKey}
												</code>
												<button
													className="shrink-0 rounded-lg bg-green-600 px-3 py-2 font-medium text-white text-xs transition-colors hover:bg-green-700"
													onClick={() => copyToClipboard(createdKey, "API key")}
													type="button"
												>
													<CopyIcon className="h-4 w-4" />
												</button>
											</div>
										</div>
									)}
								</div>
							</div>

							{/* Verify Key Section */}
							<div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
								<h2 className="mb-4 flex items-center gap-2 font-semibold text-lg text-zinc-900 dark:text-zinc-50">
									<MagnifyingGlassIcon className="h-5 w-5" weight="duotone" />
									Verify Key
								</h2>
								<div className="space-y-3">
									<div>
										<label
											className="mb-2 block font-medium text-sm text-zinc-700 dark:text-zinc-300"
											htmlFor="api-key"
										>
											API Key
										</label>
										<input
											className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
											id="api-key"
											onChange={(e) => setVerifyKey(e.target.value)}
											placeholder="sk_mem_..."
											type="text"
											value={verifyKey}
										/>
									</div>

									{/* Required Scopes */}
									<div>
										<div className="mb-2 font-medium text-sm text-zinc-700 dark:text-zinc-300">
											Required Scopes (optional)
										</div>
										<div className="flex flex-wrap gap-2">
											{AVAILABLE_SCOPES.map((scope) => (
												<button
													className={`rounded-full px-3 py-1 font-medium text-xs transition-colors ${
														requiredScopes.includes(scope.value)
															? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
															: "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
													}`}
													key={scope.value}
													onClick={() => toggleRequiredScope(scope.value)}
													type="button"
												>
													{scope.label}
												</button>
											))}
										</div>
									</div>

									<div className="flex gap-2">
										<button
											className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-100"
											disabled={verifyMutation.isPending || !verifyKey}
											onClick={() => {
												verifyWithScopesMutation.reset();
												verifyMutation.mutate();
											}}
											type="button"
										>
											{verifyMutation.isPending ? "Verifying..." : "Verify"}
										</button>
										{requiredScopes.length > 0 && (
											<button
												className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 font-medium text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
												disabled={
													verifyWithScopesMutation.isPending || !verifyKey
												}
												onClick={() => {
													verifyMutation.reset();
													verifyWithScopesMutation.mutate();
												}}
												type="button"
											>
												{verifyWithScopesMutation.isPending
													? "Checking..."
													: "Check Scopes"}
											</button>
										)}
									</div>

									{(verifyMutation.data || verifyWithScopesMutation.data) && (
										<div
											className={`rounded-lg border p-3 ${(() => {
												const result =
													verifyWithScopesMutation.data || verifyMutation.data;
												return result?.valid
													? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
													: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950";
											})()}`}
										>
											<p
												className={`flex items-center gap-2 font-medium text-sm ${(() => {
													const result =
														verifyWithScopesMutation.data ||
														verifyMutation.data;
													return result?.valid
														? "text-green-900 dark:text-green-100"
														: "text-red-900 dark:text-red-100";
												})()}`}
											>
												{(() => {
													const result =
														verifyWithScopesMutation.data ||
														verifyMutation.data;
													return result?.valid ? (
														<>
															<CheckCircleIcon
																className="h-4 w-4"
																weight="duotone"
															/>
															{verifyWithScopesMutation.data
																? `Valid Key - Has Required Scopes: ${requiredScopes.join(", ")}`
																: "Valid Key"}
														</>
													) : (
														<>
															<XCircleIcon
																className="h-4 w-4"
																weight="duotone"
															/>
															{result?.error || "Invalid key"}
														</>
													);
												})()}
											</p>
											{(() => {
												const result =
													verifyWithScopesMutation.data || verifyMutation.data;
												return result?.valid &&
													"record" in result &&
													result.record ? (
													<div className="mt-2 space-y-1">
														<p className="text-green-800 text-xs dark:text-green-200">
															Owner: {result.record.metadata.ownerId}
														</p>
														{result.record.metadata.scopes && (
															<p className="text-green-800 text-xs dark:text-green-200">
																Scopes:{" "}
																{result.record.metadata.scopes.join(", ")}
															</p>
														)}
													</div>
												) : null;
											})()}
										</div>
									)}
								</div>
							</div>
						</div>

						{/* Key Management Actions */}
						<div className="mt-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
							<h2 className="mb-3 flex items-center gap-2 font-semibold text-lg text-zinc-900 dark:text-zinc-50">
								<ClockIcon className="h-5 w-5" weight="duotone" />
								Management
							</h2>
							<div className="grid gap-3 md:grid-cols-3">
								<div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
									<h3 className="mb-2 font-semibold text-xs text-zinc-900 dark:text-zinc-50">
										Enable/Disable
									</h3>
									<div className="flex gap-2">
										<button
											className="flex-1 rounded bg-green-100 px-3 py-1.5 font-medium text-green-700 text-xs transition-colors hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-900/70"
											disabled={enableMutation.isPending}
											onClick={() => {
												const enabledKey = keys.find(
													(k) =>
														k.metadata.enabled === false &&
														!k.metadata.revokedAt
												);
												if (enabledKey) {
													enableMutation.mutate(enabledKey.id);
												} else {
													toast.info("No disabled keys found");
												}
											}}
											type="button"
										>
											Enable
										</button>
										<button
											className="flex-1 rounded bg-zinc-100 px-3 py-1.5 font-medium text-xs text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
											disabled={disableMutation.isPending}
											onClick={() => {
												const disabledKey = keys.find(
													(k) => k.metadata.enabled && !k.metadata.revokedAt
												);
												if (disabledKey) {
													disableMutation.mutate(disabledKey.id);
												} else {
													toast.info("No enabled keys found");
												}
											}}
											type="button"
										>
											Disable
										</button>
									</div>
								</div>

								<div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
									<h3 className="mb-2 font-semibold text-xs text-zinc-900 dark:text-zinc-50">
										Rotation
									</h3>
									<button
										className="w-full rounded bg-blue-100 px-3 py-1.5 font-medium text-blue-700 text-xs transition-colors hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-900/70"
										disabled={rotateMutation.isPending}
										onClick={() => {
											const rotatableKey = keys.find(
												(k) => k.metadata.enabled && !k.metadata.revokedAt
											);
											if (rotatableKey) {
												rotateMutation.mutate(rotatableKey.id);
											} else {
												toast.info("No keys available to rotate");
											}
										}}
										type="button"
									>
										{rotateMutation.isPending ? "Rotating..." : "Rotate Key"}
									</button>
								</div>

								<div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
									<h3 className="mb-2 font-semibold text-xs text-zinc-900 dark:text-zinc-50">
										Revoke
									</h3>
									<button
										className="w-full rounded bg-red-100 px-3 py-1.5 font-medium text-red-700 text-xs transition-colors hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900/70"
										disabled={revokeMutation.isPending}
										onClick={() => {
											const revokableKey = keys.find(
												(k) => !k.metadata.revokedAt
											);
											if (revokableKey) {
												revokeMutation.mutate(revokableKey.id);
											} else {
												toast.info("No keys available to revoke");
											}
										}}
										type="button"
									>
										{revokeMutation.isPending ? "Revoking..." : "Revoke Key"}
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
