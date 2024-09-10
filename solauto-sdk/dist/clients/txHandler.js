"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TxHandler = void 0;
const utils_1 = require("../utils");
class TxHandler {
    constructor(heliusApiKey, localTest) {
        this.localTest = localTest;
        this.heliusApiKey = heliusApiKey;
        const [connection, umi] = (0, utils_1.getSolanaRpcConnection)(this.heliusApiKey);
        this.connection = connection;
        this.umi = umi;
    }
    log(...args) {
        if (this.localTest) {
            console.log(...args);
        }
    }
}
exports.TxHandler = TxHandler;
