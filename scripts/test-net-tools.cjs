#!/usr/bin/env node
(async () => {
    try {
        const mod = await import('../dist/index.js');
        console.log('Top-level exports from dist:', Object.keys(mod));
        // Try common export locations for registry
        const mcpRegistry = mod.mcpRegistry || (mod.default && mod.default.mcpRegistry) || (mod.tools && mod.tools.mcpRegistry);
        const initializeToolRegistry = mod.initializeToolRegistry || (mod.default && mod.default.initializeToolRegistry) || (mod.tools && mod.tools.initializeToolRegistry);
        if (!mcpRegistry || !initializeToolRegistry) {
            console.error('Could not find registry exports in built module.');
            console.error('Try running `npm run build` in the root to ensure `dist` is up-to-date.');
            process.exit(2);
        }
        // initialize registry
        initializeToolRegistry();

        console.log('Registered tools:', mcpRegistry.listTools().tools.map(t => t.name).join(', '));

        console.log('\n== net.fw_log_search (syslog example) ==');
        const res1 = await mcpRegistry.callTool('net.fw_log_search', { source: 'syslog', timeRangeMinutes: 60, maxRows: 5 });
        console.log(JSON.stringify(res1, null, 2));

        console.log('\n== net.topology_scan (127.0.0.1) ==');
        const res2 = await mcpRegistry.callTool('net.topology_scan', { scope: '127.0.0.1', mode: 'live_scan', detailLevel: 'summary' });
        console.log(JSON.stringify(res2, null, 2));

        console.log('\n== net.mikrotik_api (sample, no auth) ==');
        const res3 = await mcpRegistry.callTool('net.mikrotik_api', { action: 'run_command', payload: { command: '/ip/address/print' }, address: '127.0.0.1' });
        console.log(JSON.stringify(res3, null, 2));

        process.exit(0);
    } catch (err) {
        console.error('Test runner failed', err);
        process.exit(2);
    }
})();
