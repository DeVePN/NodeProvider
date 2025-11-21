import winston from 'winston';
import config from '../config.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack }) => {
    if (stack) {
        return `[${timestamp}] ${level}: ${message}\n${stack}`;
    }
    return `[${timestamp}] ${level}: ${message}`;
});

// Create logger instance
const logger = winston.createLogger({
    level: config.service.logLevel,
    format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports: [
        // Console output
        new winston.transports.Console({
            format: combine(
                colorize(),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                logFormat
            )
        }),
        // File output - errors
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // File output - combined
        new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ],
    exitOnError: false
});

// Helper methods for structured logging
export const log = {
    debug: (message, meta = {}) => logger.debug(message, meta),
    info: (message, meta = {}) => logger.info(message, meta),
    warn: (message, meta = {}) => logger.warn(message, meta),
    error: (message, error = null) => {
        if (error instanceof Error) {
            logger.error(message, { stack: error.stack });
        } else {
            logger.error(message, error);
        }
    },

    // Specialized logging methods
    registration: (message) => logger.info(`[REGISTRATION] ${message}`),
    blockchain: (message) => logger.debug(`[BLOCKCHAIN] ${message}`),
    session: (message) => logger.info(`[SESSION] ${message}`),
    wireguard: (message) => logger.debug(`[WIREGUARD] ${message}`),
    http: (message) => logger.debug(`[HTTP] ${message}`),
    heartbeat: (message) => logger.debug(`[HEARTBEAT] ${message}`)
};

export default logger;
