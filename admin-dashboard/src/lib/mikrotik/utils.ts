/**
 * Shared MikroTik RouterOS utilities for frontend
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

    if (!ip || Number.isNaN(mask) || mask < 1 || mask > 32) {
        return null;
    }

    const octets = ip.split('.').map(Number);
    if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
        return null;
    }

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
