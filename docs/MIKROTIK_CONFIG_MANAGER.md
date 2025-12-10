# MikroTik Configuration Manager

Công cụ quản lý tập trung cấu hình thiết bị MikroTik RouterOS thông qua SSH. Hỗ trợ backup, restore, diff, và áp dụng cấu hình với các lệnh chuẩn từ tài liệu chính thức của MikroTik.

## Tính Năng Chính

- ✅ Kết nối SSH an toàn đến thiết bị MikroTik
- ✅ Backup và restore cấu hình
- ✅ Export cấu hình dạng text (RSC) để so sánh phiên bản
- ✅ So sánh cấu hình (diff) giữa hai snapshot
- ✅ Áp dụng nhóm lệnh với kiểm tra lỗi và rollback tự động
- ✅ Lệnh chuẩn hóa dựa trên tài liệu MikroTik chính thức
- ✅ Thiết lập DHCP, IP, Route, Firewall, DNS, NTP, SNMP
- ✅ Cấu hình Bridge/VLAN, set access/trunk, enable/disable interface, MTU, bonding
- ✅ Kiểm tra lệnh nguy hiểm trước khi thực thi
- ✅ Hỗ trợ chạy lệnh tuần tự và song song

## Cài Đặt

```bash
npm install ssh2
```

## Sử Dụng Cơ Bản

### 1. Kết nối và lấy thông tin hệ thống

```typescript
import { MikrotikManager } from '@/services/mikrotik';

const manager = new MikrotikManager('MT-BR-01');

// Kết nối
await manager.connect('192.168.1.1', 'admin', 'password123');

// Lấy thông tin
const info = await manager.getSystemInfo();
console.log(info);

// Ngắt kết nối
await manager.disconnect();
```

### 2. Tạo Backup

```typescript
// Backup cơ bản
const result = await manager.createBackup({
  name: 'config-backup-2025-12-10',
  compressed: true,
});

// Liệt kê các backup
const backups = await manager.listBackups();
console.log(backups.stdout);
```

### 3. Restore Backup

```typescript
// Lưu ý: Đây là hoạt động phá hủy, sẽ thay thế toàn bộ cấu hình
const restoreResult = await manager.restoreBackup('config-backup-2025-12-10');
```

### 4. Export Cấu Hình (để Diff/Version Control)

```typescript
const config = await manager.exportConfig('my-config.rsc');
// Hoặc lưu vào file
const configSnap = await manager.getConfigSnapshot();
console.log(configSnap.hash); // SHA-like hash để so sánh
```

### 5. So Sánh Hai Cấu Hình (Diff)

```typescript
const before = await manager.getConfigSnapshot();
// ... thực hiện thay đổi ...
const after = await manager.getConfigSnapshot();

const diff = manager.computeDiff(before, after);
console.log('Added lines:', diff.added);
console.log('Removed lines:', diff.removed);
```

### 6. Thiết Lập DHCP Server

```typescript
// Tham số: interface, pool name, address space, range start, range end, gateway, DNS
const dhcpResult = await manager.setupDHCP(
  'ether2',                    // Interface
  'dhcp-pool-lan',             // Pool name
  '192.168.100.0/24',          // Address space
  '192.168.100.10',            // Range start
  '192.168.100.200',           // Range end
  '192.168.100.1',             // Gateway
  ['8.8.8.8', '8.8.4.4']      // DNS servers
);

console.log(`Applied: ${dhcpResult.appliedCommands}, Failed: ${dhcpResult.failedCommands}`);
```

### 7. Áp Dụng Cấu Hình (Batch Commands)

```typescript
const commands = [
  '/ip dns set servers=8.8.8.8,8.8.4.4',
  '/system ntp client set enabled=yes servers=0.us.pool.ntp.org',
  '/ip firewall nat add chain=srcnat action=masquerade out-interface=ether1',
];

const result = await manager.applyCommands(commands, {
  rollbackOnError: true,  // Tự động rollback nếu có lỗi
  dryRun: false,          // Set true để chỉ kiểm tra
});

console.log(result);
// {
//   success: true,
//   appliedCommands: 3,
//   failedCommands: 0,
//   errors: []
// }
```

### 8. Thực Thi Lệnh Tuần Tự

```typescript
const results = await manager.ssh.execMulti([
  '/ip address print detail',
  '/ip route print detail',
  '/interface print detail',
], {
  perCommandTimeoutMs: 30000,
  stopOnError: true,  // Dừng ở lệnh đầu tiên lỗi
});

for (const [cmd, result] of Object.entries(results)) {
  console.log(`${cmd}: exit code ${result.exitCode}`);
}
```

### 9. Bridge / Interface (VLAN, Access/Trunk, MTU)

```typescript
// Tạo bridge và bật vlan-filtering
await manager.createBridge('br-lan', { vlanFiltering: true });

// Thêm port vào bridge với PVID (access)
await manager.addBridgePort('br-lan', 'ether2', { pvid: 10 });

// Cấu hình VLAN: VLAN 10 untagged trên ether2, VLAN 20 tagged trên ether3
await manager.configureBridgeVlan('br-lan', 10, [], ['ether2'], { enableFiltering: true });
await manager.configureBridgeVlan('br-lan', 20, ['ether3']);

// Đặt port access
await manager.setAccessPort('br-lan', 'ether4', 30);

// Đặt port trunk với nhiều VLAN tagged
await manager.setTrunkPort('br-lan', 'ether5', [20, 30, 40]);

// Bật/tắt interface
await manager.setInterfaceState('ether6', true);   // enable
await manager.setInterfaceState('ether6', false);  // disable

// Chỉnh MTU
await manager.setInterfaceMtu('ether7', 9000);

// Bonding LACP
await manager.createBonding('bond1', ['ether8', 'ether9'], '802.3ad');
```

## Lệnh Chuẩn Hóa (MIKROTIK_COMMANDS)

Thư viện cung cấp các lệnh chuẩn từ tài liệu MikroTik để giảm sai sót:

### System & Info
```typescript
MIKROTIK_COMMANDS.SYSTEM_IDENTITY       // /system identity print
MIKROTIK_COMMANDS.SYSTEM_RESOURCES      // /system resource print
MIKROTIK_COMMANDS.SYSTEM_PACKAGE_PRINT  // /system package print
MIKROTIK_COMMANDS.SYSTEM_LICENSE_PRINT  // /system license print
```

### Backup & Restore
```typescript
MIKROTIK_COMMANDS.BACKUP_CREATE(name)        // Tạo backup
MIKROTIK_COMMANDS.BACKUP_RESTORE(name)       // Restore backup
MIKROTIK_COMMANDS.BACKUP_EXPORT(name)        // Export RSC
MIKROTIK_COMMANDS.BACKUP_LIST                // Liệt kê backup
```

### IP Configuration
```typescript
MIKROTIK_COMMANDS.IP_ADDRESS_LIST                              // Liệt kê IP
MIKROTIK_COMMANDS.IP_ADDRESS_ADD(iface, addr, netmask)        // Thêm IP
MIKROTIK_COMMANDS.IP_ADDRESS_REMOVE(id)                        // Xóa IP
MIKROTIK_COMMANDS.IP_ROUTE_LIST                                // Liệt kê route
MIKROTIK_COMMANDS.IP_ROUTE_ADD(dstAddr, gateway, distance)    // Thêm route
```

### Interface Management
```typescript
MIKROTIK_COMMANDS.INTERFACE_LIST                                // Liệt kê interface
MIKROTIK_COMMANDS.INTERFACE_VLAN_ADD(iface, vlanId, name)     // Tạo VLAN
MIKROTIK_COMMANDS.INTERFACE_BRIDGE_ADD(name)                   // Tạo Bridge
MIKROTIK_COMMANDS.INTERFACE_BRIDGE_PORT_ADD(bridge, iface)    // Thêm port vào Bridge
```

### DHCP Server
```typescript
MIKROTIK_COMMANDS.DHCP_SERVER_ADD(iface, pool, space)          // Tạo DHCP server
MIKROTIK_COMMANDS.DHCP_POOL_ADD(name, rangeStart, rangeEnd)   // Tạo pool
MIKROTIK_COMMANDS.DHCP_NETWORK_ADD(addr, gateway, dns)        // Cấu hình mạng DHCP
```

### DNS, Firewall, NTP, SNMP
```typescript
MIKROTIK_COMMANDS.DNS_SERVER_ADD(address)
MIKROTIK_COMMANDS.FIREWALL_NAT_LIST
MIKROTIK_COMMANDS.NTP_CLIENT_ENABLE
MIKROTIK_COMMANDS.SNMP_COMMUNITY_ADD(name, addresses)
// ... và nhiều lệnh khác
```

## Kiểm Tra Lệnh Nguy Hiểm

Manager tự động kiểm tra các lệnh nguy hiểm trước khi thực thi:

```typescript
const validation = manager.validateCommand('/system reboot');
if (!validation.valid) {
  console.log(validation.error);
  // Output: Dangerous command: /system reboot. Requires explicit confirmation.
}
```

Các lệnh bị kiểm tra:
- `/system reboot` - Khởi động lại
- `/system shutdown` - Tắt máy
- `/user remove` - Xóa người dùng
- `/ip firewall nat reset` - Reset NAT

## Kiến Trúc

```
src/services/mikrotik/
├── client.ts      # Promise-based SSH wrapper (MikrotikSSH class)
├── manager.ts     # Config manager (MikrotikManager class + MIKROTIK_COMMANDS)
└── index.ts       # Public exports
```

### MikrotikSSH (client.ts)
- `connect(opts)` - Kết nối SSH
- `disconnect()` - Ngắt kết nối
- `exec(cmd, timeoutMs)` - Thực thi một lệnh
- `execMulti(cmds, opts)` - Thực thi nhiều lệnh tuần tự
- `execParallel(cmds, timeoutMs)` - Thực thi lệnh song song
- `isConnected()` - Kiểm tra trạng thái kết nối

### MikrotikManager (manager.ts)
- `connect()` / `disconnect()` - Quản lý kết nối
- `getSystemInfo()` - Thông tin hệ thống
- `createBackup()` - Tạo backup
- `listBackups()` - Liệt kê backup
- `restoreBackup()` - Restore backup
- `exportConfig()` - Export cấu hình RSC
- `getConfigSnapshot()` - Snapshot cấu hình + hash
- `computeDiff()` - So sánh hai snapshot
- `applyCommands()` - Áp dụng nhóm lệnh
- `setupDHCP()` - Thiết lập DHCP server
- `getIPAddresses()`, `getRoutes()`, `getInterfaces()` - Lấy cấu hình
- `validateCommand()` - Kiểm tra lệnh
- `getLogs()` - Xem log

## Ví Dụ Nâng Cao

### Tự động Backup Hàng Ngày

```typescript
async function dailyBackup() {
  const manager = new MikrotikManager('MT-01');
  
  try {
    await manager.connect('192.168.1.1', 'admin', 'pwd');
    
    const timestamp = new Date().toISOString().split('T')[0];
    const backupName = `auto-backup-${timestamp}`;
    
    await manager.createBackup({ name: backupName });
    console.log(`✓ Backup created: ${backupName}`);
    
  } finally {
    await manager.disconnect();
  }
}
```

### So Sánh Cấu Hình Trước/Sau Thay Đổi

```typescript
async function auditChanges() {
  const manager = new MikrotikManager('MT-01');
  await manager.connect('192.168.1.1', 'admin', 'pwd');
  
  // Snapshot trước
  const before = await manager.getConfigSnapshot();
  
  // Thực hiện thay đổi
  await manager.applyCommands([
    '/ip dns set servers=1.1.1.1',
  ]);
  
  // Snapshot sau
  const after = await manager.getConfigSnapshot();
  
  // So sánh
  const diff = manager.computeDiff(before, after);
  console.log('Changed lines:', [...diff.added, ...diff.removed]);
  
  await manager.disconnect();
}
```

### Triển Khai Cấu Hình với Rollback

```typescript
async function deployConfig() {
  const manager = new MikrotikManager('MT-PROD');
  await manager.connect('10.0.0.1', 'admin', 'pwd');
  
  // Backup trước tiên
  await manager.createBackup({
    name: `pre-deploy-${Date.now()}`,
  });
  
  // Áp dụng cấu hình
  const result = await manager.applyCommands(
    [
      '/ip address add interface=ether2 address=10.0.1.0/24',
      '/ip route add dst-address=192.168.0.0/16 gateway=10.0.0.254',
      '/ip dns set servers=8.8.8.8',
    ],
    { rollbackOnError: true }
  );
  
  if (result.success) {
    console.log('✓ Deployment successful');
  } else {
    console.error('✗ Deployment failed, automatic rollback triggered');
  }
  
  await manager.disconnect();
}
```

## Tham Khảo Tài Liệu

- [MikroTik Official Documentation](https://help.mikrotik.com/docs/)
- [MikroTik API Reference](https://wiki.mikrotik.com/wiki/Manual:API)
- [RouterOS Command Reference](https://wiki.mikrotik.com/wiki/Manual:Command_Line_Interface)

## Dashboard (admin-dashboard)

- Trang mới: `/mikrotik` trong admin-dashboard (React) để sinh lệnh nhanh cho bridge/VLAN, access/trunk, enable/disable interface, MTU, bonding.
- Các lệnh được hiển thị dưới dạng block, có nút Copy để dán vào RouterOS terminal.
- Mục tiêu: giảm sai sót nhập lệnh thủ công, cung cấp preset cho VLAN filtering và trunk/access.

## Lưu Ý Bảo Mật

1. **Xác thực**: Luôn dùng SSH key hoặc mật khẩu mạnh
2. **Lệnh Nguy Hiểm**: Manager sẽ từ chối một số lệnh phá hủy (`reboot`, `shutdown`, `reset`)
3. **Backup Thường Xuyên**: Luôn backup trước khi thực hiện thay đổi lớn
4. **Audit Logging**: Bật logging trên thiết bị để theo dõi tất cả thay đổi
5. **Rollback Strategy**: Sử dụng tùy chọn `rollbackOnError` khi triển khai

## Lỗi Thường Gặp

| Lỗi | Nguyên Nhân | Giải Pháp |
|-----|-----------|----------|
| `Not connected to MikroTik device` | Chưa gọi `connect()` | Gọi `await manager.connect()` trước |
| `Command timeout after 30000ms` | Lệnh chạy quá lâu | Tăng `perCommandTimeoutMs` |
| `Dangerous command: /system reboot` | Lệnh bị block | Kiểm tra trong `validateCommand()` |
| `SSH: No matching key exchange found` | SSH version không tương thích | Cập nhật ssh2 hoặc thiết bị |

## Phát Triển Tiếp Theo

- [ ] Hỗ trợ mã hóa backup (encryption)
- [ ] Diff trực quan với color highlight
- [ ] Template cấu hình (Jinja2-like)
- [ ] Triển khai cấu hình song song trên nhiều thiết bị
- [ ] Tích hợp với chat handler để triển khai qua dialog
- [ ] Web dashboard để quản lý backup
- [ ] Webhook khi có thay đổi cấu hình

## License

MIT
