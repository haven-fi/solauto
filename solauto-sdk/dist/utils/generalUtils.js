"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRandomU8 = generateRandomU8;
exports.generateRandomU64 = generateRandomU64;
exports.currentUnixSeconds = currentUnixSeconds;
exports.getSolanaAccountCreated = getSolanaAccountCreated;
exports.rpcAccountCreated = rpcAccountCreated;
exports.arraysAreEqual = arraysAreEqual;
exports.fetchTokenPrices = fetchTokenPrices;
exports.safeGetPrice = safeGetPrice;
exports.retryWithExponentialBackoff = retryWithExponentialBackoff;
const umi_1 = require("@metaplex-foundation/umi");
const pythConstants_1 = require("../constants/pythConstants");
const numberUtils_1 = require("./numberUtils");
const solautoConstants_1 = require("../constants/solautoConstants");
function generateRandomU8() {
    return Math.floor(Math.random() * 255 + 1);
}
function generateRandomU64() {
    const upperBound = 2n ** 64n;
    let result = 0n;
    for (let i = 0; i < 64; i += 8) {
        result |= BigInt(Math.floor(Math.random() * 256)) << BigInt(i);
    }
    return result % upperBound;
}
function currentUnixSeconds() {
    return Math.round(new Date().getTime() / 1000);
}
async function getSolanaAccountCreated(umi, pk) {
    const account = await umi.rpc.getAccount((0, umi_1.publicKey)(pk));
    return rpcAccountCreated(account);
}
function rpcAccountCreated(account) {
    return account.exists && account.data.length > 0;
}
function arraysAreEqual(arrayA, arrayB) {
    if (arrayA.length !== arrayB.length) {
        return false;
    }
    for (let i = 0; i < arrayA.length; i++) {
        if (arrayA[i] !== arrayB[i]) {
            return false;
        }
    }
    return true;
}
async function fetchTokenPrices(mints) {
    const currentTime = currentUnixSeconds();
    if (!mints.some((mint) => !(mint.toString() in solautoConstants_1.PRICES) ||
        currentTime - solautoConstants_1.PRICES[mint.toString()].time > 3)) {
        return mints.map((mint) => solautoConstants_1.PRICES[mint.toString()].price);
    }
    const priceFeedIds = mints.map((mint) => pythConstants_1.PYTH_PRICE_FEED_IDS[mint.toString()]);
    const getReq = async () => await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${priceFeedIds.map((x) => `ids%5B%5D=${x}`).join("&")}`);
    let resp = await getReq();
    let status = resp.status;
    while (status !== 200) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        resp = await getReq();
        status = resp.status;
    }
    const json = await resp.json();
    const prices = json.parsed.map((x) => {
        if (x.price.expo > 0) {
            return Number((0, numberUtils_1.toBaseUnit)(Number(x.price.price), x.price.expo));
        }
        else if (x.price.expo < 0) {
            return (0, numberUtils_1.fromBaseUnit)(BigInt(x.price.price), Math.abs(x.price.expo));
        }
        else {
            return Number(x.price.price);
        }
    });
    for (var i = 0; i < mints.length; i++) {
        solautoConstants_1.PRICES[mints[i].toString()] = {
            price: prices[i],
            time: currentUnixSeconds(),
        };
    }
    return prices;
}
function safeGetPrice(mint) {
    if (mint && mint?.toString() in solautoConstants_1.PRICES) {
        return solautoConstants_1.PRICES[mint.toString()].price;
    }
    return undefined;
}
function retryWithExponentialBackoff(fn, retries = 5, delay = 150, errorsToThrow) {
    return new Promise((resolve, reject) => {
        const attempt = (attemptNum) => {
            fn(attemptNum)
                .then(resolve)
                .catch((error) => {
                attemptNum++;
                if (errorsToThrow &&
                    errorsToThrow.some((errorType) => error instanceof errorType)) {
                    reject(error);
                    return;
                }
                if (attemptNum < retries) {
                    console.log(error);
                    setTimeout(() => {
                        console.log("Retrying...");
                        return attempt(attemptNum);
                    }, delay);
                    delay *= 2;
                }
                else {
                    reject(error);
                }
            });
        };
        return attempt(0);
    });
}
