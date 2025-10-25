/**
 * Audit log action types
 */
export type AuditAction =
	| "created"
	| "revoked"
	| "rotated"
	| "enabled"
	| "disabled";

/**
 * Context for who performed an action
 */
export type ActionContext = {
	/** User ID who performed the action */
	userId?: string;

	/** IP address of the requester */
	ip?: string;

	/** User agent of the requester */
	userAgent?: string;

	/** Custom metadata about the action */
	metadata?: Record<string, unknown>;
};

/**
 * Audit log entry
 */
export type AuditLog = {
	/** Unique identifier for this log entry */
	id: string;

	/** The action that was performed */
	action: AuditAction;

	/** ID of the API key */
	keyId: string;

	/** ID of the key owner */
	ownerId: string;

	/** ISO timestamp when the action occurred */
	timestamp: string;

	/** Optional additional data about the action */
	data?: Record<string, unknown>;
};

/**
 * Options for querying audit logs
 */
export type AuditLogQuery = {
	/** Filter by key ID */
	keyId?: string;

	/** Filter by owner ID */
	ownerId?: string;

	/** Filter by action */
	action?: AuditAction;

	/** Filter by start date (ISO timestamp) */
	startDate?: string;

	/** Filter by end date (ISO timestamp) */
	endDate?: string;

	/** Maximum number of results to return (default: 100) */
	limit?: number;

	/** Offset for pagination (default: 0) */
	offset?: number;
};

/**
 * Statistics about audit logs
 */
export type AuditLogStats = {
	/** Total number of logs */
	total: number;

	/** Count by action type */
	byAction: Partial<Record<AuditAction, number>>;

	/** ISO timestamp of last activity */
	lastActivity: string | null;
};
