import { describe, it, expect } from 'vitest';
import { isBlockedAddress } from '../../src/utils/fetch-guard.js';

// v1.5.0 (ROADMAP "fetch-guard — additional blocked ranges"): the benchmarking
// range 198.18.0.0/15 (RFC 2544), the TEST-NET-1 documentation range
// 192.0.2.0/24 (RFC 5737) and the NAT64 well-known prefix 64:ff9b::/96
// (RFC 6052) are never public unicast destinations.

describe('isBlockedAddress: v1.5.0 ranges', () => {
    it.each(['198.18.0.1', '198.19.255.255', '192.0.2.10', '64:ff9b::c000:201', '::ffff:198.18.0.1', '::ffff:192.0.2.1'])(
        'blocks %s',
        (ip) => {
            expect(isBlockedAddress(ip)).toBe(true);
        },
    );

    it.each(['198.17.255.255', '198.20.0.1', '192.0.3.1', '192.0.1.1', '64:ff9c::1', '2606:4700:4700::1111'])(
        'still allows the neighbour %s',
        (ip) => {
            expect(isBlockedAddress(ip)).toBe(false);
        },
    );
});
