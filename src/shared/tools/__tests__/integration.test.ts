import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';

import { unifiedRegistry } from '../registry.js';
import { registerAsApiEndpoint, createToolRoutes, executeApiTool, getApiToolsList } from '../adapters/api.js';
import { registerAsMcpTool, executeMcpTool, toMcpTool } from '../adapters/mcp.js';

describe('Unified Tools Integration', () => {
    beforeEach(() => {
        unifiedRegistry.clear();
    });

    afterEach(() => {
        unifiedRegistry.clear();
    });

    it('should register a tool and expose it via API endpoint', async () => {
        const app = express();
        app.use(express.json());

        const echoTool = {
            name: 'integration.echo',
            description: 'Echo tool',
            category: 'system',
            inputSchema: z.object({ msg: z.string() }),
            handler: async (input: { msg: string }) => ({ success: true, data: { echo: input.msg } }),
        };

        // register as API endpoint
        registerAsApiEndpoint(echoTool as any, app, { path: `/tools/${echoTool.name}`, method: 'post' });

        // register routes for listing/stats
        createToolRoutes(app);

        // call the endpoint
        const res = await request(app).post(`/tools/${echoTool.name}`).send({ msg: 'hello' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toEqual({ echo: 'hello' });

        // list tools
        const listRes = await request(app).get('/tools');
        expect(listRes.status).toBe(200);
        expect(listRes.body.data.tools.some((t: any) => t.name === echoTool.name)).toBe(true);

        // stats endpoint
        const statsRes = await request(app).get('/tools/stats');
        expect(statsRes.status).toBe(200);
        const stats = statsRes.body.data;
        expect(stats['integration.echo']).toBeDefined();
    });

    it('should register a tool for MCP and execute it', async () => {
        const echoTool = {
            name: 'integration.mcp.echo',
            description: 'MCP Echo tool',
            category: 'system',
            inputSchema: z.object({ msg: z.string() }),
            handler: async (input: { msg: string }) => ({ success: true, data: { echo: input.msg } }),
        };

        registerAsMcpTool(echoTool as any);

        // execute via MCP helper
        const mcpResult = await executeMcpTool(echoTool.name, { msg: 'mcp' });
        expect(mcpResult).toBeDefined();
        expect(mcpResult.isError).toBe(false);
        const contentText = mcpResult.content[0].text;
        expect(contentText).toContain('"echo": "mcp"');
    });
});
