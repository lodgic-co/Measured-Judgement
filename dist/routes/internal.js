export async function internalRoutes(app) {
    app.get('/internal/ping', async (_request, reply) => {
        reply.code(200).send({ ok: true });
    });
}
