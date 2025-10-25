export type LogLevel = "debug" | "info" | "warn" | "error";

export type LoggerOptions = {
	level?: LogLevel;
	prefix?: string;
	silent?: boolean;
};

class Logger {
	private readonly level: LogLevel;
	private readonly prefix: string;
	private readonly silent: boolean;

	constructor(options: LoggerOptions = {}) {
		this.level = options.level ?? "info";
		this.prefix = options.prefix ?? "";
		this.silent = options.silent ?? false;
	}

	private shouldLog(level: LogLevel): boolean {
		if (this.silent) {
			return false;
		}

		const levels: LogLevel[] = ["debug", "info", "warn", "error"];
		const currentLevelIndex = levels.indexOf(this.level);
		const messageLevelIndex = levels.indexOf(level);

		return messageLevelIndex >= currentLevelIndex;
	}

	private formatMessage(level: LogLevel, message: string): string {
		const prefix = this.prefix ? `[${this.prefix}]` : "";
		const levelTag = level.toUpperCase();
		return `${prefix} ${levelTag}: ${message}`;
	}

	debug(message: string, ...args: unknown[]): void {
		if (this.shouldLog("debug")) {
			// biome-ignore lint: Console logging is intentional for logger
			console.debug(this.formatMessage("debug", message), ...args);
		}
	}

	info(message: string, ...args: unknown[]): void {
		if (this.shouldLog("info")) {
			// biome-ignore lint: Console logging is intentional for logger
			console.info(this.formatMessage("info", message), ...args);
		}
	}

	warn(message: string, ...args: unknown[]): void {
		if (this.shouldLog("warn")) {
			// biome-ignore lint: Console logging is intentional for logger
			console.warn(this.formatMessage("warn", message), ...args);
		}
	}

	error(message: string, ...args: unknown[]): void {
		if (this.shouldLog("error")) {
			// biome-ignore lint: Console logging is intentional for logger
			console.error(this.formatMessage("error", message), ...args);
		}
	}
}

export function createLogger(options: LoggerOptions): Logger {
	return new Logger(options);
}

export const logger = createLogger({ prefix: "keypal" });
