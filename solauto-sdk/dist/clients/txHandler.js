"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TxHandler = void 0;
const utils_1 = require("../utils");
const constants_1 = require("../constants");
class TxHandler {
    constructor(heliusApiUrl, localTest) {
        this.localTest = localTest;
        this.heliusApiUrl = heliusApiUrl;
        const [connection, umi] = (0, utils_1.getSolanaRpcConnection)(this.heliusApiUrl);
        this.connection = connection;
        this.umi = umi;
        constants_1.RUNTIME_DATA.localTest = Boolean(localTest);
    }
    log(...args) {
        (0, utils_1.consoleLog)(...args);
    }
}
exports.TxHandler = TxHandler;
