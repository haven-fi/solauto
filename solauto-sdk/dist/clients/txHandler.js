"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TxHandler = void 0;
const utils_1 = require("../utils");
const constants_1 = require("../constants");
class TxHandler {
    constructor(rpcUrl, localTest, programId = constants_1.SOLAUTO_PROD_PROGRAM) {
        this.rpcUrl = rpcUrl;
        this.programId = programId;
        const [connection, umi] = (0, utils_1.getSolanaRpcConnection)(this.rpcUrl, this.programId);
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
