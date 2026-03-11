import { config } from '../config/index.js';
export const loggerOptions = {
    level: config.LOG_LEVEL,
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    formatters: {
        level(label) {
            return { level: label };
        },
    },
    serializers: {
        req(request) {
            return {
                method: request.method,
                url: request.url,
                request_id: request.id,
            };
        },
        res(reply) {
            return {
                status_code: reply.statusCode,
            };
        },
    },
};
