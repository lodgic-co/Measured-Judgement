import { config, emitDeprecationWarnings } from './config/index.js';
import { shutdownOtel } from './observability/otel.js';
import { createApp } from './http/app.js';
import { setReady, setDbPool } from './routes/health.js';
import { pool, closePool } from './db/pool.js';
const app = createApp();
const start = async () => {
    try {
        emitDeprecationWarnings(app.log);
        await app.listen({ port: config.PORT, host: '0.0.0.0' });
        setDbPool(pool);
        setReady(true);
        app.log.info(`Server listening on port ${config.PORT}`);
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};
const shutdown = async (signal) => {
    app.log.info({ signal }, 'Shutting down');
    setReady(false);
    await app.close();
    await closePool();
    await shutdownOtel();
    process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
start();
