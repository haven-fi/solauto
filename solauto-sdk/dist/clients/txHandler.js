"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TxHandler = void 0;
const utils_1 = require("../utils");
class TxHandler {
    constructor(heliusApiUrl, localTest) {
        this.heliusApiUrl = heliusApiUrl;
        const [connection, umi] = (0, utils_1.getSolanaRpcConnection)(this.heliusApiUrl);
        this.connection = connection;
        this.umi = umi;
        if (!globalThis.LOCAL_TEST && localTest) {
            globalThis.LOCAL_TEST = Boolean(localTest);
        }
    }
    log(...args) {
        (0, utils_1.consoleLog)(...args);
    }
}
exports.TxHandler = TxHandler;
