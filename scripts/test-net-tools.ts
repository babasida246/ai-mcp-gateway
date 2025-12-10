import { initializeToolRegistry, mcpRegistry as registryFromSrc } from '../src/mcp/tools/index.js';

(async () => {
    try {
        initializeToolRegistry();

        const mcpRegistry = registryFromSrc;

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
        console.error('Test runner (src) failed', err);
        process.exit(2);
    }
})();
