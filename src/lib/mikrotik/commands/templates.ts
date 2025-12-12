/**
 * RouterOS command templates
 * Canonical command strings for MikroTik RouterOS CLI
 * Reference: https://help.mikrotik.com/docs/
 */

export const MIKROTIK_COMMANDS = {
    // System & Info
    SYSTEM_IDENTITY: '/system identity print',
    SYSTEM_RESOURCES: '/system resource print',
    SYSTEM_PACKAGE_PRINT: '/system package print',
    SYSTEM_LICENSE_PRINT: '/system license print',

    // Backup & Restore
    BACKUP_CREATE: (name: string) => `/system backup save name=${name}`,
    BACKUP_LIST: '/file print where type=backup',
    BACKUP_RESTORE: (name: string) => `/system backup load name=${name}`,
    BACKUP_EXPORT: (name: string) => `/export file=${name}`,

    // IP Configuration
    IP_ADDRESS_LIST: '/ip address print detail',
    IP_ADDRESS_ADD: (iface: string, address: string, netmask: string) =>
        `/ip address add interface=${iface} address=${address}/${netmask}`,
    IP_ADDRESS_REMOVE: (id: string) => `/ip address remove numbers=${id}`,
    IP_ROUTE_LIST: '/ip route print detail',
    IP_ROUTE_ADD: (dstAddress: string, gateway: string, distance: string = '1') =>
        `/ip route add dst-address=${dstAddress} gateway=${gateway} distance=${distance}`,

    // Interface Management
    INTERFACE_LIST: '/interface print detail',
    INTERFACE_ETHERNET_LIST: '/interface ethernet print detail',
    INTERFACE_VLAN_ADD: (iface: string, vlanId: number, name: string) =>
        `/interface vlan add interface=${iface} vlan-id=${vlanId} name=${name}`,
    INTERFACE_BRIDGE_ADD: (name: string) => `/interface bridge add name=${name}`,
    INTERFACE_BRIDGE_PORT_ADD: (bridge: string, iface: string) =>
        `/interface bridge port add bridge=${bridge} interface=${iface}`,
    INTERFACE_ENABLE: (iface: string) => `/interface set [find name=${iface}] disabled=no`,
    INTERFACE_DISABLE: (iface: string) => `/interface set [find name=${iface}] disabled=yes`,
    INTERFACE_SET_MTU: (iface: string, mtu: number) => `/interface set [find name=${iface}] mtu=${mtu}`,
    INTERFACE_BONDING_ADD: (name: string, slaves: string[], mode: string = '802.3ad') =>
        `/interface bonding add name=${name} slaves=${slaves.join(',')} mode=${mode}`,
    BRIDGE_LIST: '/interface bridge print detail',
    BRIDGE_PORT_LIST: '/interface bridge port print detail',
    BRIDGE_VLAN_LIST: '/interface bridge vlan print detail',
    BRIDGE_SET_VLAN_FILTERING: (bridge: string, enabled: boolean) =>
        `/interface bridge set [find name=${bridge}] vlan-filtering=${enabled ? 'yes' : 'no'}`,
    BRIDGE_VLAN_ADD: (bridge: string, vlanId: number | string, tagged: string[], untagged: string[] = []) =>
        `/interface bridge vlan add bridge=${bridge} vlan-ids=${vlanId} tagged=${tagged.join(',')} untagged=${untagged.join(',')}`,
    BRIDGE_VLAN_REMOVE: (numbers: string) => `/interface bridge vlan remove numbers=${numbers}`,
    BRIDGE_PORT_SET_PVID: (iface: string, pvid: number) =>
        `/interface bridge port set [find interface=${iface}] pvid=${pvid} frame-types=admit-only-untagged-and-priority-tagged`,
    BRIDGE_PORT_SET_FRAME_TYPES: (iface: string, frameTypes: 'admit-all' | 'admit-only-untagged-and-priority-tagged' | 'admit-only-vlan-tagged') =>
        `/interface bridge port set [find interface=${iface}] frame-types=${frameTypes}`,

    // DHCP Server
    DHCP_SERVER_ADD: (iface: string, pool: string) =>
        `/ip dhcp-server add interface=${iface} address-pool=${pool} disabled=no`,
    DHCP_SERVER_LIST: '/ip dhcp-server print detail',
    DHCP_POOL_ADD: (name: string, rangeStart: string, rangeEnd: string) =>
        `/ip pool add name=${name} ranges=${rangeStart}-${rangeEnd}`,
    DHCP_POOL_LIST: '/ip pool print detail',
    DHCP_NETWORK_ADD: (address: string, gateway: string, dnsServers: string[]) =>
        `/ip dhcp-server network add address=${address} gateway=${gateway} dns-server=${dnsServers.join(',')}`,
    DHCP_NETWORK_LIST: '/ip dhcp-server network print detail',

    // DNS
    DNS_SERVER_ADD: (address: string) => `/ip dns set servers=${address}`,
    DNS_LIST: '/ip dns print',
    DNS_CACHE_FLUSH: '/ip dns cache flush',

    // Firewall
    FIREWALL_NAT_LIST: '/ip firewall nat print detail',
    FIREWALL_FILTER_LIST: '/ip firewall filter print detail',
    FIREWALL_NAT_ADD: (chain: string, action: string, protocol?: string) =>
        `/ip firewall nat add chain=${chain} action=${action}${protocol ? ` protocol=${protocol}` : ''}`,

    // Users & Security
    USER_LIST: '/user print detail',
    USER_ADD: (username: string, password: string, group: string = 'full') =>
        `/user add name=${username} password=${password} group=${group}`,
    USER_REMOVE: (id: string) => `/user remove numbers=${id}`,

    // Certificate Management
    CERTIFICATE_LIST: '/certificate print detail',
    CERTIFICATE_IMPORT: (name: string, filename: string) =>
        `/certificate import file-name=${filename} name=${name}`,

    // Logging
    LOG_PRINT: '/log print follow=no numbers=0..100',
    LOG_FILTER_ADD: (topics: string, action: string = 'memory') =>
        `/system logging add topics=${topics} action=${action}`,

    // NTP
    NTP_CLIENT_ENABLE: '/system ntp client set enabled=yes',
    NTP_CLIENT_SET_SERVER: (server: string) => `/system ntp client set servers=${server}`,
    NTP_CLIENT_PRINT: '/system ntp client print',

    // SNMP
    SNMP_PRINT: '/snmp print',
    SNMP_COMMUNITY_LIST: '/snmp community print detail',
    SNMP_COMMUNITY_ADD: (name: string, addresses: string = '0.0.0.0/0') =>
        `/snmp community add name=${name} addresses=${addresses}`,
} as const;
