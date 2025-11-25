import type { AuditLog, AuditLogStats } from "../types/audit-log-types";

/** Default query limit for paginated results */
export const DEFAULT_QUERY_LIMIT = 100;

/**
 * Calculate statistics from an array of audit logs
 */
export function calculateLogStats(logs: AuditLog[]): AuditLogStats {
	const byAction: Partial<Record<string, number>> = {};
	let lastActivity: string | null = null;

	for (const log of logs) {
		byAction[log.action] = (byAction[log.action] || 0) + 1;
		if (!lastActivity || log.timestamp > lastActivity) {
			lastActivity = log.timestamp;
		}
	}

	return { total: logs.length, byAction, lastActivity };
}

