import { describe, it, expect } from 'vitest';
import { isBlockedAddress, guardedFetch, FetchGuardError } from '../../src/utils/fetch-guard.js';

describe('isBlockedAddress', () => {
    it.each([
        '0.0.0.0',
        '10.0.0.1',
        '127.0.0.1',
        '169.254.169.254', // cloud metadata
        '172.16.5.4',
        '172.31.255.255',
        '192.168.1.1',
        '100.64.0.1', // CGNAT
        '224.0.0.1', // multicast
        '255.255.255.255',
    ])('blocks the private/reserved IPv4 %s', (ip) => {
        expect(isBlockedAddress(ip)).toBe(true);
    });

    it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34'])('allows the public IPv4 %s', (ip) => {
        expect(isBlockedAddress(ip)).toBe(false);
    });

    it.each([
        '::1', // loopback
        '::', // unspecified
        'fe80::1', // link-local
        'fc00::1', // unique-local
        'fd12::1', // unique-local
        'ff02::1', // multicast
        '::ffff:127.0.0.1', // IPv4-mapped loopback
        '::ffff:10.0.0.1', // IPv4-mapped private
    ])('blocks the reserved IPv6 %s', (ip) => {
        expect(isBlockedAddress(ip)).toBe(true);
    });

    it('allows a public IPv6 address', () => {
        expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
    });

    it('blocks a non-IP string (must be resolved first)', () => {
        expect(isBlockedAddress('example.com')).toBe(true);
    });
});

describe('guardedFetch', () => {
    it('rejects an invalid URL', async () => {
        await expect(guardedFetch('not a url')).rejects.toBeInstanceOf(FetchGuardError);
    });

    it('rejects a non-http(s) scheme', async () => {
        await expect(guardedFetch('ftp://example.com/file')).rejects.toBeInstanceOf(FetchGuardError);
    });

    it('rejects a literal private address', async () => {
        await expect(guardedFetch('http://127.0.0.1/')).rejects.toBeInstanceOf(FetchGuardError);
    });

    it('rejects a literal cloud-metadata address', async () => {
        await expect(guardedFetch('http://169.254.169.254/latest/meta-data')).rejects.toBeInstanceOf(
            FetchGuardError,
        );
    });
});
