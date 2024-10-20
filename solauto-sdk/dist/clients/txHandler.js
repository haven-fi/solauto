"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TxHandler = void 0;
const utils_1 = require("../utils");
const constants_1 = require("../constants");
class TxHandler {
    constructor(rpcUrl, localTest, programId = constants_1.SOLAUTO_PROD_PROGRAM) {
        this.rpcUrl = rpcUrl;
        const [connection, umi] = (0, utils_1.getSolanaRpcConnection)(this.rpcUrl);
        this.connection = connection;
        this.umi = umi.use({
            install(umi) {
                umi.programs.add((0, utils_1.createDynamicSolautoProgram)(programId), false);
            },
        });
        if (!globalThis.LOCAL_TEST && localTest) {
            globalThis.LOCAL_TEST = Boolean(localTest);
        }
    }
    log(...args) {
        (0, utils_1.consoleLog)(...args);
    }
}
exports.TxHandler = TxHandler;
