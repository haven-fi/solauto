
export function generateRandomU8(): number {
    return Math.floor((Math.random() * 255) + 1);
}

export function generateRandomU64(): bigint {
    const upperBound = 2n ** 64n;
    let result = 0n;
    for (let i = 0; i < 64; i += 8) {
        result |= BigInt(Math.floor(Math.random() * 256)) << BigInt(i);
    }
    return result % upperBound;
}