import { describe, it, expect, beforeAll } from 'vitest';
import { MikrotikSSH, MikrotikManager, MIKROTIK_COMMANDS } from '../index.js';

describe('MikrotikSSH Client', () => {
  let client: MikrotikSSH;

  beforeAll(() => {
    client = new MikrotikSSH();
  });

  it('should create SSH client instance', () => {
    expect(client).toBeDefined();
    expect(client.isConnected()).toBe(false);
  });

  it('should have exec and execMulti methods', () => {
    expect(typeof client.exec).toBe('function');
    expect(typeof client.execMulti).toBe('function');
    expect(typeof client.execParallel).toBe('function');
  });

  it('should throw error when executing without connection', async () => {
    await expect(client.exec('/system identity print')).rejects.toThrow(
      'Not connected'
    );
  });
});

describe('MikrotikManager', () => {
  let manager: MikrotikManager;

  beforeAll(() => {
    manager = new MikrotikManager('TEST-MT-01');
  });

  it('should create manager instance', () => {
    expect(manager).toBeDefined();
  });

  it('should validate dangerous commands', () => {
    const rebootValidation = manager.validateCommand('/system reboot');
    expect(rebootValidation.valid).toBe(false);
    expect(rebootValidation.error).toMatch(/Dangerous command/);

    const shutdownValidation = manager.validateCommand('/system shutdown');
    expect(shutdownValidation.valid).toBe(false);

    const userRemoveValidation = manager.validateCommand('/user remove numbers=5');
    expect(userRemoveValidation.valid).toBe(false);
  });

  it('should accept valid commands', () => {
    const validation = manager.validateCommand('/ip address print detail');
    expect(validation.valid).toBe(true);
    expect(validation.error).toBeUndefined();
  });

  it('should reject commands not starting with /', () => {
    const validation = manager.validateCommand('invalid command');
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('must start with /');
  });

  it('should compute diff between snapshots', () => {
    const snapshot1 = {
      timestamp: Date.now(),
      deviceId: 'TEST-MT-01',
      config: 'line1\nline2\nline3',
      hash: 'abc123',
    };

    const snapshot2 = {
      timestamp: Date.now() + 1000,
      deviceId: 'TEST-MT-01',
      config: 'line1\nline2\nline4',
      hash: 'def456',
    };

    const diff = manager.computeDiff(snapshot1, snapshot2);
    expect(diff.added).toContain('line4');
    expect(diff.removed).toContain('line3');
  });
});

describe('MIKROTIK_COMMANDS', () => {
  it('should provide DHCP server command generator', () => {
    const cmd = MIKROTIK_COMMANDS.DHCP_SERVER_ADD('ether2', 'dhcp-pool', '192.168.1.0/24');
    expect(cmd).toContain('ip dhcp-server add');
    expect(cmd).toContain('ether2');
    expect(cmd).toContain('dhcp-pool');
  });

  it('should provide IP address command generator', () => {
    const cmd = MIKROTIK_COMMANDS.IP_ADDRESS_ADD('ether2', '192.168.1.1', '24');
    expect(cmd).toContain('ip address add');
    expect(cmd).toContain('192.168.1.1');
  });

  it('should provide DHCP pool command generator', () => {
    const cmd = MIKROTIK_COMMANDS.DHCP_POOL_ADD('lan-pool', '192.168.1.10', '192.168.1.200');
    expect(cmd).toContain('ip pool add');
    expect(cmd).toContain('192.168.1.10');
  });

  it('should provide DNS command generators', () => {
    const cmd = MIKROTIK_COMMANDS.DNS_SERVER_ADD('8.8.8.8');
    expect(cmd).toContain('ip dns set');
    expect(cmd).toContain('8.8.8.8');
  });

  it('should provide backup command generators', () => {
    const create = MIKROTIK_COMMANDS.BACKUP_CREATE('my-backup');
    expect(create).toContain('backup save');
    expect(create).toContain('my-backup');

    const restore = MIKROTIK_COMMANDS.BACKUP_RESTORE('my-backup');
    expect(restore).toContain('backup load');
  });
});
