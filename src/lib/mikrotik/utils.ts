/**
 * Shared MikroTik RouterOS utilities
 * Used by both UI (admin-dashboard) and backend services
 */

/**
 * Normalize a comma-separated list by trimming whitespace and removing empty entries
 * @example normalizeList("eth1, eth2,  , eth3") => "eth1,eth2,eth3"
 */
export function normalizeList(value: string): string {
    return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .join(',');
}

/**
 * Parse CIDR notation and extract gateway IP + network CIDR
 * @param cidr - IP/mask notation (e.g., "192.168.1.1/24")
 * @returns Object with gateway and networkCidr, or null if invalid
 * @example parseCidr("192.168.1.1/24") => { gateway: "192.168.1.1", networkCidr: "192.168.1.0/24" }
 */
export function parseCidr(cidr: string): { gateway: string; networkCidr: string } | null {
    const [ip, maskStr] = cidr.split('/');
    const mask = Number(maskStr);

    // Validate mask range
    if (!ip || Number.isNaN(mask) || mask < 1 || mask > 32) {
        return null;
    }

    // Parse and validate octets
    const octets = ip.split('.').map(Number);
    if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
        return null;
    }

    // Calculate network address
    const ipInt = (octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
    const maskInt = mask === 0 ? 0 : 0xffffffff << (32 - mask);
    const networkInt = ipInt & maskInt;

    const networkOctets = [
        (networkInt >> 24) & 255,
        (networkInt >> 16) & 255,
        (networkInt >> 8) & 255,
        networkInt & 255,
    ];

    return {
        gateway: ip,
        networkCidr: `${networkOctets.join('.')}/${mask}`,
    };
}

/**
 * Validate IPv4 address format
 * @param ip - IPv4 address string
 * @returns true if valid IPv4 address
 */
export function isValidIPv4(ip: string): boolean {
    const octets = ip.split('.');
    if (octets.length !== 4) return false;
    return octets.every((octet) => {
        const num = Number(octet);
        return !Number.isNaN(num) && num >= 0 && num <= 255;
    });
}

/**
 * Validate VLAN ID range
 * @param vlanId - VLAN ID to validate
 * @returns true if valid VLAN ID (1-4094)
 */
export function isValidVlanId(vlanId: number): boolean {
    return Number.isInteger(vlanId) && vlanId >= 1 && vlanId <= 4094;
}

/**
 * Escape special characters for RouterOS CLI
 * @param value - String to escape
 * @returns Escaped string safe for RouterOS commands
 */
export function escapeRouterOS(value: string): string {
    // Escape quotes and backslashes for RouterOS CLI
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
